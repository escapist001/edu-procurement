"""
Этап итоговой сборки — объединяет всё собранное в данные для дашборда.

Вход:
  data/base.csv      — базовые поля закупок (этап 1)
  data/orgs.json     — чистый регион по заказчику (этап 2)
  data/outcomes.csv  — реальное снижение цены (этап 3)
  data/winners.csv   — победитель-поставщик (этап 4, опционально)

Выход:
  docs/rows.json  и  dashboard/public/rows.json — построчная выгрузка (клиент считает срезы)
  docs/data.json  — предрасчитанные агрегаты и статистика реальных исходов

Запуск:  python build.py
"""

from __future__ import annotations

import csv
import json
import re
import statistics as st
from collections import Counter, defaultdict

import eis

BASE = eis.DATA / "base.csv"
ORGS = eis.DATA / "orgs.json"
OUTCOMES = eis.DATA / "outcomes.csv"
WINNERS = eis.DATA / "winners.csv"
ROOT = eis.ROOT

PRICE_BUCKETS = [
    ("до 100 тыс", 0, 100_000),
    ("100–500 тыс", 100_000, 500_000),
    ("500 тыс – 1 млн", 500_000, 1_000_000),
    ("1–5 млн", 1_000_000, 5_000_000),
    ("более 5 млн", 5_000_000, float("inf")),
]


def short_method(m: str) -> str:
    m = str(m).lower()
    smp = "малого и среднего" in m or "субъекты малого" in m
    if "аукцион" in m:
        return "Аукцион (СМП)" if smp else "Электронный аукцион"
    if "котиров" in m:
        return "Котировки (СМП)" if smp else "Запрос котировок"
    if "93" in m or "единствен" in m:
        return "Ед. поставщик"
    if "конкурс" in m:
        return "Конкурс"
    if "предложен" in m:
        return "Запрос предложений"
    return "Иной способ"


def short_customer(name: str) -> str:
    for junk in ["МУНИЦИПАЛЬНОЕ", "ГОСУДАРСТВЕННОЕ", "КАЗЁННОЕ", "КАЗЕННОЕ", "БЮДЖЕТНОЕ",
                 "АВТОНОМНОЕ", "ОБЩЕОБРАЗОВАТЕЛЬНОЕ", "УЧРЕЖДЕНИЕ", "ПРОФЕССИОНАЛЬНАЯ",
                 "ОБРАЗОВАТЕЛЬНАЯ", "ОБРАЗОВАТЕЛЬНОЕ", "ФЕДЕРАЛЬНОЕ"]:
        name = name.replace(junk, "")
    return " ".join(name.split())[:46].strip(' "')


def month_of(posted: str) -> str | None:
    # '23.06.2026' -> '2026-06'
    if not posted or posted.count(".") != 2:
        return None
    d, m, y = posted.split(".")
    return f"{y}-{int(m):02d}"


def price_segment(p: float | None) -> str:
    if p is None:
        return "?"
    for label, lo, hi in PRICE_BUCKETS:
        if lo <= p < hi:
            return label
    return "?"


def load_orgs() -> dict:
    return json.loads(ORGS.read_text(encoding="utf-8")) if ORGS.exists() else {}


def load_outcomes() -> dict:
    out = {}
    if OUTCOMES.exists():
        with OUTCOMES.open(encoding="utf-8") as f:
            for r in csv.DictReader(f):
                if r["has_result"] == "1" and r["drop_pct"]:
                    out[r["number"]] = {
                        "fp": float(r["final_price"]) if r["final_price"] else None,
                        "dp": float(r["drop_pct"]),
                    }
    return out


def load_winners_by_purchase() -> dict:
    """Победитель по номеру закупки — чтобы проставить поставщика в строки base."""
    win = {}
    if WINNERS.exists():
        with WINNERS.open(encoding="utf-8") as f:
            for r in csv.DictReader(f):
                if r.get("supplier") and r.get("purchase"):
                    win[r["purchase"]] = short_supplier(r["supplier"])
    return win


def short_supplier(name: str) -> str:
    n = name.split(" (")[0]            # убираем дубль-краткое в скобках
    for junk, rep in [("ПУБЛИЧНОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО", "ПАО"),
                      ("ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ", "ООО"),
                      ("АКЦИОНЕРНОЕ ОБЩЕСТВО", "АО"),
                      ("ИНДИВИДУАЛЬНЫЙ ПРЕДПРИНИМАТЕЛЬ", "ИП")]:
        n = n.replace(junk, rep)
    return " ".join(n.split())[:46].strip()


DATE_ORD = re.compile(r"(\d{2})\.(\d{2})\.(\d{4})")


def date_ord(s: str) -> int:
    m = DATE_ORD.search(s or "")
    if not m:
        return 0
    d, mo, y = map(int, m.groups())
    return y * 372 + mo * 31 + d       # грубый порядковый ключ, годится для сравнения


def pct_rank(sorted_vals: list, v: float) -> float:
    """Перцентильный ранг значения 0..100 (для осей розы)."""
    n = len(sorted_vals)
    if n <= 1:
        return 50.0
    import bisect
    return bisect.bisect_left(sorted_vals, v) / (n - 1) * 100


def build_suppliers(base_rows: list) -> tuple[list, dict, dict]:
    """Досье поставщиков-победителей из winners.csv по концепту Fable.

    Возвращает (топ-поставщики с профилем, медианы рынка для розы, map покупка→поставщик).
    """
    if not WINNERS.exists():
        return [], {}, {}
    with WINNERS.open(encoding="utf-8") as f:
        wins = [r for r in csv.DictReader(f) if r.get("supplier_inn")]
    if not wins:
        return [], {}, {}

    # база по номеру закупки: чистый регион + НМЦК (для снижения)
    base_by_num = {r["n"]: r for r in base_rows}

    now = max((date_ord(w["date"]) for w in wins), default=0)
    year = 372

    by_inn: dict[str, dict] = {}
    for w in wins:
        inn = w["supplier_inn"]
        g = by_inn.setdefault(inn, {
            "inn": inn, "name": short_supplier(w["supplier"]),
            "status": w.get("supplier_status", "иной"),
            "contracts": 0, "sum": 0.0, "cust": defaultdict(float),
            "regions": defaultdict(int), "drops": [], "recent": 0, "prev": 0,
        })
        price = float(w["price"]) if w["price"] else 0.0
        g["contracts"] += 1
        g["sum"] += price
        if w["customer"]:
            g["cust"][short_customer(w["customer"])] += price
        # регион и снижение — из связанной закупки base
        b = base_by_num.get(w["purchase"])
        if b and b.get("rg"):
            g["regions"][b["rg"]] += 1
        if b and b.get("p") is not None and price > 0:
            nmck = b["p"]
            if nmck and nmck >= price:
                g["drops"].append((nmck - price) / nmck * 100)
        d = date_ord(w["date"])
        if d and now - d <= year:
            g["recent"] += 1
        elif d and now - d <= 2 * year:
            g["prev"] += 1

    sups = []
    for g in by_inn.values():
        sum_ = g["sum"] or 1
        cust_sorted = sorted(g["cust"].items(), key=lambda kv: -kv[1])
        top1_share = cust_sorted[0][1] / sum_ if cust_sorted else 0
        regs = sorted(g["regions"].items(), key=lambda kv: -kv[1])
        reg_count = len(regs)
        home_share = (regs[0][1] / sum(g["regions"].values())) if regs else 0
        drop_med = round(st.median(g["drops"]), 1) if g["drops"] else None
        sups.append({
            "inn": g["inn"], "name": g["name"], "status": g["status"],
            "contracts": g["contracts"], "sum": round(g["sum"]),
            "customers": [{"name": c, "sum": round(s2), "share": round(s2 / sum_ * 100)}
                          for c, s2 in cust_sorted[:5]],
            "top1_share": round(top1_share * 100),
            "regions": [r for r, _ in regs[:8]], "region_count": reg_count,
            "home_share": round(home_share * 100),
            "drop_median": drop_med, "drop_n": len(g["drops"]),
            "recent": g["recent"], "prev": g["prev"],
        })

    # перцентильные оси розы — по рынку
    def col(key, f=lambda x: x):
        return sorted(f(s[key]) for s in sups if s[key] is not None)
    sums = col("sum"); tempos = col("recent"); reaches = col("region_count")
    entrs = col("top1_share")
    drops_all = sorted(s["drop_median"] for s in sups if s["drop_median"] is not None)
    market_drop = round(st.median(drops_all), 1) if drops_all else 0
    p90_sum = sums[int(len(sums) * 0.9)] if sums else 0

    for s in sups:
        axV = pct_rank(sums, s["sum"])
        axT = pct_rank(tempos, s["recent"])
        axR = pct_rank(reaches, s["region_count"])
        axE = pct_rank(entrs, s["top1_share"])
        axP = pct_rank(drops_all, s["drop_median"]) if s["drop_median"] is not None else 50
        s["axes"] = {"price": round(axP), "volume": round(axV), "tempo": round(axT),
                     "reach": round(axR), "entrench": round(axE)}
        # уверенность в оценке растёт с числом контрактов — один контракт не «топ-угроза»
        conf = min(1.0, s["contracts"] / 4)
        s["threat"] = round((0.30 * axV + 0.25 * axT + 0.25 * axP + 0.20 * axR) * conf)
        s["rising"] = s["prev"] > 0 and s["recent"] >= s["prev"] * 1.5
        # архетип (сверху вниз, взаимоисключающие). Мало контрактов → спорадик, не «инсайдер».
        dm = s["drop_median"]
        n = s["contracts"]
        if n < 3:
            s["type"] = "sporadic"
        elif dm is not None and dm >= 15 and n >= 5:
            s["type"] = "damper"
        elif s["top1_share"] >= 60 and (dm is None or dm < 5) and n >= 4:
            s["type"] = "insider"
        elif s["region_count"] >= 8 and s["sum"] >= p90_sum:
            s["type"] = "giant"
        elif s["region_count"] <= 2 and s["home_share"] >= 80:
            s["type"] = "entrencher"
        else:
            s["type"] = "sporadic"

    sups.sort(key=lambda s: -s["threat"])
    top = sups[:40]
    market = {"drop": market_drop, "axes_note": "перцентили по рынку поставщиков"}
    purchase_map = load_winners_by_purchase()
    return top, market, purchase_map


def main():
    orgs = load_orgs()
    outc = load_outcomes()

    with BASE.open(encoding="utf-8") as f:
        base = list(csv.DictReader(f))

    rows = []
    for r in base:
        p = float(r["nmck"]) if r["nmck"] else None
        region = None
        if r["org_ref"] and r["org_ref"] in orgs:
            region = orgs[r["org_ref"]]["region"]
            if region == "Не определён":
                region = None
        o = outc.get(r["number"])
        rows.append({
            "n": r["number"],
            "law": "44" if r["law"] == "44-ФЗ" else "223",
            "mt": short_method(r["method"]),
            "p": None if p is None else int(p),
            "fp": None if not o or o["fp"] is None else int(o["fp"]),
            "dp": None if not o else round(o["dp"], 1),
            "rg": region,
            "mo": month_of(r["posted"]),
            "st": r["stage"],
            "c": short_customer(r["customer"]),
            "sup": None,
        })

    # досье поставщиков-победителей + проставляем поставщика в строки по номеру закупки
    suppliers, sup_market, purchase_map = build_suppliers(rows)
    for r in rows:
        if r["n"] in purchase_map:
            r["sup"] = purchase_map[r["n"]]

    # ---- агрегаты ----
    priced = [r for r in rows if r["p"] is not None]
    withdrop = [r for r in rows if r["dp"] is not None]
    prices = [r["p"] for r in priced]
    drops = [r["dp"] for r in withdrop]
    months = sorted({r["mo"] for r in rows if r["mo"]})

    # реальные снижения по сегменту цены и по способу — основа честного скоринга
    seg_drops = defaultdict(list)
    for r in withdrop:
        seg_drops[price_segment(r["p"])].append(r["dp"])
    drop_by_segment = {k: round(st.median(v), 1) for k, v in seg_drops.items() if v}

    method_drops = defaultdict(list)
    for r in withdrop:
        method_drops[r["mt"]].append(r["dp"])
    drop_by_method = [{"method": k, "median_drop": round(st.median(v), 1), "n": len(v)}
                      for k, v in sorted(method_drops.items(), key=lambda kv: -len(kv[1]))]

    # регионы — для полигональной карты: объём, деньги, реальное снижение, конкуренция
    reg_agg = defaultdict(lambda: {"count": 0, "sum": 0, "drops": []})
    for r in rows:
        if not r["rg"]:
            continue
        a = reg_agg[r["rg"]]
        a["count"] += 1
        if r["p"]:
            a["sum"] += r["p"]
        if r["dp"] is not None:
            a["drops"].append(r["dp"])
    by_region = []
    for name, a in reg_agg.items():
        by_region.append({
            "region": name, "count": a["count"], "sum": a["sum"],
            "median_drop": round(st.median(a["drops"]), 1) if a["drops"] else None,
            "n_drop": len(a["drops"]),
        })
    by_region.sort(key=lambda x: -x["sum"])

    buckets = [{"label": lb, "count": sum(1 for p in prices if lo <= p < hi)}
               for lb, lo, hi in PRICE_BUCKETS]

    monthly = []
    for m in months:
        mr = [r for r in rows if r["mo"] == m]
        monthly.append({"month": m, "count": len(mr),
                        "sum": sum(r["p"] for r in mr if r["p"])})

    by_method = Counter(r["mt"] for r in rows)
    by_stage = Counter(r["st"] for r in rows)

    cust_sum = defaultdict(lambda: {"count": 0, "sum": 0})
    for r in priced:
        cust_sum[r["c"]]["count"] += 1
        cust_sum[r["c"]]["sum"] += r["p"]
    top_customers = sorted(({"customer": k, **v} for k, v in cust_sum.items()),
                           key=lambda x: -x["sum"])[:12]

    # доля состоявшихся (есть исход) среди завершённых
    done = [r for r in rows if "аверш" in r["st"]]
    concluded = sum(1 for r in done if r["dp"] is not None)

    kpis = {
        "records": len(rows),
        "total_sum": sum(prices),
        "median_price": st.median(prices) if prices else 0,
        "max_price": max(prices) if prices else 0,
        "period": [months[0], months[-1]] if months else [None, None],
        "auction_share": round(sum(1 for r in rows if "укцион" in r["mt"].lower())
                               / len(rows) * 100, 1),
        "fz44_share": round(sum(1 for r in rows if r["law"] == "44") / len(rows) * 100, 1),
        "regions": len(reg_agg),
        # реальные исходы
        "with_outcome": len(withdrop),
        "median_drop": round(st.median(drops), 1) if drops else None,
        "mean_drop": round(st.mean(drops), 1) if drops else None,
        "concluded_rate": round(concluded / len(done) * 100, 1) if done else None,
    }

    data = {
        "source": f"ЕИС zakupki.gov.ru · 44-ФЗ + 223-ФЗ · учебное оборудование · "
                  f"{len(rows)} закупок · снижение цены по {len(withdrop)} торгам",
        "kpis": kpis,
        "buckets": buckets,
        "monthly": monthly,
        "by_method": [{"method": k, "count": v} for k, v in by_method.most_common()],
        "by_stage": [{"stage": k, "count": v} for k, v in by_stage.most_common(6)],
        "top_customers": top_customers,
        "by_region": by_region,
        "drop_by_segment": drop_by_segment,
        "drop_by_method": drop_by_method,
        "suppliers": suppliers,
        "sup_market": sup_market,
    }

    (ROOT / "docs").mkdir(exist_ok=True)
    (ROOT / "docs" / "data.json").write_text(
        json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")

    rows_payload = json.dumps({
        "source": data["source"],
        "generated_period": kpis["period"],
        "rows": rows,
        "suppliers": suppliers,
        "sup_market": sup_market,
    }, ensure_ascii=False)
    for rel in ("docs/rows.json", "dashboard/public/rows.json"):
        out = ROOT / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(rows_payload, encoding="utf-8")

    print(f"Записей: {kpis['records']}")
    print(f"С реальным исходом (снижение): {kpis['with_outcome']} "
          f"({kpis['with_outcome']/kpis['records']*100:.0f}%)")
    print(f"Медиана снижения: {kpis['median_drop']}%  | среднее: {kpis['mean_drop']}%")
    print(f"Состоялось среди завершённых: {kpis['concluded_rate']}%")
    print(f"Сумма НМЦК: {kpis['total_sum']:,.0f} ₽ | медиана: {kpis['median_price']:,.0f} ₽")
    print(f"Регионов на карте: {kpis['regions']} | период: {kpis['period']}")
    print(f"Снижение по сегментам: {drop_by_segment}")
    if suppliers:
        from collections import Counter as _C
        arche = _C(s["type"] for s in suppliers)
        print(f"Поставщиков в досье: {len(suppliers)} | архетипы: {dict(arche)}")
        t = suppliers[0]
        print(f"Топ-угроза: {t['name']} — {t['contracts']} контр., угроза {t['threat']}, тип {t['type']}")


if __name__ == "__main__":
    main()
