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


def load_winners() -> dict:
    win = {}
    if WINNERS.exists():
        with WINNERS.open(encoding="utf-8") as f:
            for r in csv.DictReader(f):
                if r.get("supplier"):
                    win[r["number"]] = {"sup": r["supplier"], "inn": r.get("supplier_inn", "")}
    return win


def main():
    orgs = load_orgs()
    outc = load_outcomes()
    wins = load_winners()

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
        w = wins.get(r["number"])
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
            "sup": w["sup"] if w else None,
        })

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
    }

    (ROOT / "docs").mkdir(exist_ok=True)
    (ROOT / "docs" / "data.json").write_text(
        json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")

    rows_payload = json.dumps({
        "source": data["source"],
        "generated_period": kpis["period"],
        "rows": rows,
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


if __name__ == "__main__":
    main()
