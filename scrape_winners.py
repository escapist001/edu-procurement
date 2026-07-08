"""
Этап 4 конвейера — победители-поставщики из реестра контрактов ЕИС.

Отвечает на вопрос «с кем поставщик столкнётся на рынке». Список реестра контрактов даёт
заказчика, цену контракта, номер закупки и дату, но НЕ поставщика — его берём с детальной
карточки контракта (блок «Информация о поставщиках»: название, ИНН, статус СМП).

Номер закупки нужен, чтобы связать контракт с нашей базой (base.csv) — оттуда придёт НМЦК
и чистый регион, а значит и снижение цены (демпинг-профиль победителя).

Собираем окнами по дате контракта (портал отдаёт ~1000 на запрос). Возобновляемо.

Запуск:  python scrape_winners.py --target 3000
"""

from __future__ import annotations

import argparse
import csv
import re
import threading
from concurrent.futures import ThreadPoolExecutor

import eis

LIST_URL = f"{eis.HOST}/epz/contract/search/results.html"
CARD_URL = f"{eis.HOST}/epz/contract/contractCard/common-info.html"
LIST_CSV = eis.DATA / "contracts_reg.csv"
OUT = eis.DATA / "winners.csv"

QUERIES = [
    "учебное оборудование", "лабораторное оборудование", "цифровая лаборатория",
    "оборудование для кабинета физики", "оборудование для кабинета химии",
    "учебно-наглядные пособия", "робототехника образовательный набор",
    "оснащение образовательного учреждения", "интерактивная панель образование",
]
LIST_FIELDS = ["reestr", "purchase", "customer", "price", "date"]
FIELDS = LIST_FIELDS + ["supplier", "supplier_inn", "supplier_status"]

REESTR_RE = re.compile(r"reestrNumber=(\d+)")
_lock = threading.Lock()


# ------------------------------------------------------------------ список реестра
def parse_list_card(card) -> dict | None:
    a = card.find("a", href=REESTR_RE)
    reestr = REESTR_RE.search(a["href"]).group(1) if a else ""
    if not reestr:
        return None
    # номера в карточке: первый — реестровый номер контракта, дальше встречается № закупки
    nums = re.findall(r"№\s*(\d{11,})", card.get_text(" "))
    purchase = next((n for n in nums if n != reestr), "")

    def body(title):
        for blk in card.select(".search-registry-entry-block__body-block, .registry-entry__body-block"):
            t = blk.select_one(".registry-entry__body-title")
            if t and title in t.get_text(" ", strip=True):
                v = blk.select_one(".registry-entry__body-value, .registry-entry__body-href")
                return v.get_text(" ", strip=True) if v else ""
        return ""

    customer = body("Заказчик") or body("аименование заказчика")
    price_el = card.select_one(".price-block__value")
    price = eis.parse_price(price_el.get_text(strip=True) if price_el else "")
    m = re.search(r"([0-3]?\d\.[01]?\d\.\d{4})", card.get_text(" "))
    return {"reestr": reestr, "purchase": purchase, "customer": customer,
            "price": price, "date": m.group(1) if m else ""}


def month_windows(since: str, until: str):
    sy, sm = map(int, since.split("-"))
    uy, um = map(int, until.split("-"))
    out, y, m = [], uy, um
    while (y, m) >= (sy, sm):
        last = [31, 29 if y % 4 == 0 and (y % 100 or y % 400 == 0) else 28, 31, 30, 31, 30,
                31, 31, 30, 31, 30, 31][m - 1]
        out.append((f"01.{m:02d}.{y}", f"{last:02d}.{m:02d}.{y}"))
        m -= 1
        if m == 0:
            m, y = 12, y - 1
    return out


def collect_list(session, target, since, until):
    seen = set()
    if LIST_CSV.exists():
        with LIST_CSV.open(encoding="utf-8") as f:
            seen = {r["reestr"] for r in csv.DictReader(f)}
    new_file = not LIST_CSV.exists()
    f = LIST_CSV.open("a", encoding="utf-8", newline="")
    w = csv.DictWriter(f, fieldnames=LIST_FIELDS)
    if new_file:
        w.writeheader()
    total = len(seen)
    try:
        for dfrom, dto in month_windows(since, until):
            if total >= target:
                break
            wnew = 0
            for q in QUERIES:
                if total >= target:
                    break
                streak = 0
                for page in range(1, 25):
                    params = {"searchString": q, "morphology": "on", "fz44": "on",
                              "contractStageList_0": "on", "contractStageList": "0",
                              "contractDateFrom": dfrom, "contractDateTo": dto,
                              "recordsPerPage": "_50", "pageNumber": page,
                              "sortBy": "BY_UPDATE_DATE"}
                    r = eis.get(session, LIST_URL, params=params, pause=0.5)
                    if r is None:
                        break
                    cards = eis.soup(r.text).select(".search-registry-entry-block")
                    fresh = 0
                    for c in cards:
                        row = parse_list_card(c)
                        if row and row["reestr"] not in seen:
                            seen.add(row["reestr"]); w.writerow(row); fresh += 1
                    f.flush()
                    total += fresh; wnew += fresh
                    if not cards:
                        break
                    streak = streak + 1 if not fresh else 0
                    if streak >= 2 or total >= target:
                        break
            print(f"  окно {dfrom}: +{wnew} | всего {total}", flush=True)
    finally:
        f.close()
    return total


# --------------------------------------------------------------- поставщик с карточки
def fetch_supplier(session, reestr) -> dict:
    r = eis.get(session, CARD_URL, params={"reestrNumber": reestr}, retries=3, pause=0.4)
    if r is None:
        return {"supplier": "", "supplier_inn": "", "supplier_status": ""}
    sp = eis.soup(r.text)
    for s in sp(["script", "style"]):
        s.decompose()
    lines = [l.strip() for l in sp.get_text("\n").split("\n") if l.strip()]
    name, inn, status = "", "", ""
    try:
        i0 = next(i for i, l in enumerate(lines) if "Информация о поставщик" in l)
    except StopIteration:
        i0 = 0
    for l in lines[i0:i0 + 30]:
        if not name and len(l) > 15 and sum(c.isupper() for c in l) > 6 and "ПОСТАВЩИК" not in l.upper():
            name = l
        if not inn and re.fullmatch(r"\d{10,12}", l):
            inn = l
        if not status and ("предпринимательства" in l or "малого" in l):
            status = "СМП"
    return {"supplier": name, "supplier_inn": inn, "supplier_status": status or "иной"}


def enrich(session, workers=3):
    with LIST_CSV.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    done = set()
    if OUT.exists():
        with OUT.open(encoding="utf-8") as f:
            done = {r["reestr"] for r in csv.DictReader(f)}
    todo = [r for r in rows if r["reestr"] not in done]
    print(f"Обогащаем поставщиком: {len(todo)} контрактов (готово {len(done)})")

    new_file = not OUT.exists()
    f = OUT.open("a", encoding="utf-8", newline="")
    w = csv.DictWriter(f, fieldnames=FIELDS)
    if new_file:
        w.writeheader()
    cnt = [0]

    def work(r):
        try:
            sup = fetch_supplier(session, r["reestr"])
        except Exception:
            return
        if not sup["supplier"]:
            return
        with _lock:
            w.writerow({**r, **sup})
            cnt[0] += 1
            if cnt[0] % 100 == 0:
                f.flush(); print(f"  …{cnt[0]}/{len(todo)}", flush=True)

    try:
        with ThreadPoolExecutor(max_workers=workers) as ex:
            for _ in ex.map(work, todo):
                pass
    finally:
        f.close()
    print(f"Готово: {cnt[0]} поставщиков дописано.")


def main(target, since, until):
    session = eis.make_session()
    print("=== Этап A: список контрактов реестра ===")
    collect_list(session, target, since, until)
    print("=== Этап B: поставщик с детальных карточек ===")
    enrich(session)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", type=int, default=3000)
    ap.add_argument("--since", default="2025-01")
    ap.add_argument("--until", default="2026-07")
    a = ap.parse_args()
    main(a.target, a.since, a.until)
