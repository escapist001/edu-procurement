"""
Анализ собранных госзакупок учебного оборудования (pandas).

Читает data/contracts.csv (его собирает parser.py из ЕИС) и считает:
сводные метрики, распределение по способам закупки и законам, ценовые корзины,
динамику по датам, топ заказчиков и топ регионов. Результат — web/data.json,
который рендерит дашборд.

Запуск:  python analysis.py
"""

import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent
CSV = ROOT / "data" / "contracts.csv"
OUT = ROOT / "docs" / "data.json"

PRICE_BUCKETS = [
    ("до 100 тыс", 0, 100_000),
    ("100–500 тыс", 100_000, 500_000),
    ("500 тыс – 1 млн", 500_000, 1_000_000),
    ("1–5 млн", 1_000_000, 5_000_000),
    ("более 5 млн", 5_000_000, float("inf")),
]


def short_method(m: str) -> str:
    """Короткие, читаемые ярлыки способов закупки для фильтров и графиков."""
    m = str(m)
    smp = "СМП" if ("малого и среднего" in m or "субъекты малого" in m) else ""
    if "аукцион" in m.lower():
        return "Аукцион (СМП)" if smp else "Электронный аукцион"
    if "котиров" in m.lower():
        return "Котировки (СМП)" if smp else "Запрос котировок"
    if "93" in m or "единствен" in m.lower():
        return "Ед. поставщик"
    if "предложен" in m.lower():
        return "Запрос предложений"
    return "Иной способ"


def short_customer(name: str) -> str:
    """Убираем оргправовую форму для читаемости в топе."""
    for junk in ['МУНИЦИПАЛЬНОЕ', 'ГОСУДАРСТВЕННОЕ', 'КАЗЁННОЕ', 'КАЗЕННОЕ',
                 'БЮДЖЕТНОЕ', 'АВТОНОМНОЕ', 'ОБЩЕОБРАЗОВАТЕЛЬНОЕ', 'УЧРЕЖДЕНИЕ',
                 'ПРОФЕССИОНАЛЬНАЯ', 'ОБРАЗОВАТЕЛЬНАЯ', 'ОБРАЗОВАТЕЛЬНОЕ']:
        name = name.replace(junk, "")
    return " ".join(name.split())[:46].strip(' "')


def main() -> None:
    df = pd.read_csv(CSV)
    df["price_rub"] = pd.to_numeric(df["price_rub"], errors="coerce")
    df["date"] = pd.to_datetime(df["posted"], format="%d.%m.%Y", errors="coerce")

    priced = df.dropna(subset=["price_rub"])

    # --- Способы закупки ---
    by_method = (df["method"].value_counts().head(6)
                 .rename_axis("method").reset_index(name="count"))

    # --- Закон ---
    by_law = df["law"].value_counts().rename_axis("law").reset_index(name="count")

    # --- Ценовые корзины ---
    buckets = []
    for label, lo, hi in PRICE_BUCKETS:
        n = int(((priced["price_rub"] >= lo) & (priced["price_rub"] < hi)).sum())
        buckets.append({"label": label, "count": n})

    # --- Динамика по датам (количество и сумма) ---
    daily = (df.dropna(subset=["date"]).groupby(df["date"].dt.date)
             .agg(count=("number", "size"), sum=("price_rub", "sum"))
             .reset_index().sort_values("date"))
    timeline = [{"date": str(r["date"]), "count": int(r["count"]),
                 "sum": float(r["sum"] or 0)} for _, r in daily.iterrows()]

    # --- Помесячная динамика: количество и сумма НМЦК ---
    dmonth = df.dropna(subset=["date"]).copy()
    dmonth["month"] = dmonth["date"].dt.to_period("M").astype(str)
    monthly_g = (dmonth.groupby("month")
                 .agg(count=("number", "size"), sum=("price_rub", "sum"))
                 .reset_index().sort_values("month"))
    monthly = [{"month": r["month"], "count": int(r["count"]),
                "sum": float(r["sum"] or 0)} for _, r in monthly_g.iterrows()]

    # --- Средний чек по способу закупки (для топ-способов) ---
    method_order = list(by_method["method"])
    avg_g = (priced[priced["method"].isin(method_order)]
             .groupby("method")["price_rub"].mean())
    avg_by_method = [{"method": m, "avg": float(avg_g.get(m, 0))} for m in method_order]

    # --- Стадии процедур (воронка «где сейчас закупка») ---
    stage_g = df["stage"].value_counts().head(5)
    by_stage = [{"stage": k, "count": int(v)} for k, v in stage_g.items()]

    # --- Топ заказчиков ---
    top_cust = (priced.groupby("customer")
                .agg(count=("number", "size"), sum=("price_rub", "sum"))
                .sort_values("sum", ascending=False).head(10).reset_index())
    top_customers = [{"customer": short_customer(r["customer"]),
                      "count": int(r["count"]), "sum": float(r["sum"])}
                     for _, r in top_cust.iterrows()]

    # --- Топ регионов (эвристика) ---
    reg = df[df["region"] != "Не определён"]
    top_reg = reg["region"].value_counts().head(12)
    top_regions = [{"region": k, "count": int(v)} for k, v in top_reg.items()]

    kpis = {
        "records": int(len(df)),
        "total_sum": float(priced["price_rub"].sum()),
        "median_price": float(priced["price_rub"].median()),
        "max_price": float(priced["price_rub"].max()),
        "date_from": str(df["date"].min().date()) if df["date"].notna().any() else None,
        "date_to": str(df["date"].max().date()) if df["date"].notna().any() else None,
        "auction_share": round(float((df["method"].str.contains("укцион", na=False)).mean()) * 100, 1),
        "fz44_share": round(float((df["law"] == "44-ФЗ").mean()) * 100, 1),
        "regions": int(reg["region"].nunique()),
    }

    payload = {
        "source": "ЕИС zakupki.gov.ru · 44-ФЗ + 223-ФЗ · запрос «учебное оборудование»",
        "kpis": kpis,
        "by_method": by_method.to_dict(orient="records"),
        "by_law": by_law.to_dict(orient="records"),
        "buckets": buckets,
        "timeline": timeline,
        "monthly": monthly,
        "avg_by_method": avg_by_method,
        "by_stage": by_stage,
        "top_customers": top_customers,
        "top_regions": top_regions,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    # --- Построчная выгрузка для клиентских фильтров (интерактивный дашборд) ---
    # Компактно: короткие ключи, только нужные поля. Дашборд считает все срезы сам.
    rows = []
    dd = df.copy()
    dd["m"] = dd["date"].dt.to_period("M").astype(str)
    for _, r in dd.iterrows():
        price = r["price_rub"]
        rows.append({
            "n": str(r["number"]),
            "law": "44" if r["law"] == "44-ФЗ" else "223",
            "mt": short_method(r["method"]),
            "p": None if pd.isna(price) else int(price),
            "rg": r["region"] if r["region"] != "Не определён" else None,
            "mo": None if pd.isna(r["date"]) else r["m"],
            "st": r["stage"],
            "c": short_customer(r["customer"]),
        })
    rows_payload = json.dumps({
        "source": payload["source"],
        "generated_period": [kpis["date_from"], kpis["date_to"]],
        "rows": rows,
    }, ensure_ascii=False)
    # пишем и в docs (текущий сайт), и в public React-приложения
    for rel in ("docs/rows.json", "dashboard/public/rows.json"):
        out = ROOT / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(rows_payload, encoding="utf-8")
    print(f"Построчно выгружено: {len(rows)} записей (docs + dashboard/public)")

    print(f"Записей: {kpis['records']}")
    print(f"Сумма НМЦК: {kpis['total_sum']:,.0f} руб")
    print(f"Медиана НМЦК: {kpis['median_price']:,.0f} руб")
    print(f"Период: {kpis['date_from']} .. {kpis['date_to']}")
    print(f"Доля аукционов: {kpis['auction_share']}% · доля 44-ФЗ: {kpis['fz44_share']}%")
    print(f"Регионов (эвристика): {kpis['regions']}")
    print(f"Готово: {OUT}")


if __name__ == "__main__":
    main()
