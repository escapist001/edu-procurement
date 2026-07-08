"""
Этап 1 конвейера — сбор базового списка закупок из выдачи расширенного поиска.

Две идеи, чтобы собрать 10K репрезентативных записей:

1. НЕСКОЛЬКО запросов домена «учебное оборудование» (а не один) — снимает смещённость
   узкой формулировки: набор не зависит от одной фразы.

2. ОКНА ПО ДАТЕ размещения. Портал отдаёт максимум ~1000 записей на один набор параметров
   (жёсткий лимит пагинации), хотя «найдено» — десятки тысяч. Обходим это, нарезая период
   на месячные окна: в каждом окне записей мало, лимит не мешает, а окна не пересекаются —
   дедуп почти не срабатывает, и суммарный объём растёт.

Из каждой карточки берём: номер, закон, способ, стадию, объект, заказчика, ссылку на
организацию (ИНН для 223-ФЗ / код СПЗ для 44-ФЗ — понадобится для чистого региона), НМЦК,
дату размещения.

Устойчивость: результат дописывается в data/base.csv после каждой страницы; при повторном
запуске уже собранные номера подхватываются из файла (возобновление, а не сбор заново).

Запуск:  python scrape_list.py --target 10000 --since 2024-01 --until 2026-07
"""

from __future__ import annotations

import argparse
import csv
import re

import eis

BASE_URL = f"{eis.HOST}/epz/order/extendedsearch/results.html"
OUT = eis.DATA / "base.csv"

FIELDS = ["number", "law", "method", "stage", "object", "customer",
          "org_ref", "nmck", "posted"]

# Запросы домена учебного оборудования (профиль А2 Система: оснащение школ и колледжей
# под ФГОС). Морфология включена, поэтому формы слов ловятся автоматически.
QUERIES = [
    "учебное оборудование",
    "лабораторное оборудование",
    "цифровая лаборатория",
    "учебно-лабораторное оборудование",
    "оборудование для кабинета физики",
    "оборудование для кабинета химии",
    "оборудование для кабинета биологии",
    "интерактивная панель образование",
    "учебно-наглядные пособия",
    "оборудование для мастерских",
    "спортивное оборудование школа",
    "компьютерный класс оборудование",
    "робототехника образовательный набор",
    "оснащение образовательного учреждения",
]

DATE_RE = re.compile(r"Размещено\s*([0-3]?\d\.[01]?\d\.\d{4})")
INN_RE = re.compile(r"[?&]inn=(\d{10,12})")
ORGCODE_RE = re.compile(r"organizationCode=(\d{6,})")


def body_value(card, title_sub: str) -> str:
    for blk in card.select(".registry-entry__body-block"):
        ttl = blk.select_one(".registry-entry__body-title")
        if ttl and title_sub in ttl.get_text(" ", strip=True):
            val = (blk.select_one(".registry-entry__body-value")
                   or blk.select_one(".registry-entry__body-href"))
            return val.get_text(" ", strip=True) if val else ""
    return ""


def org_ref(card) -> str:
    """Ссылку на заказчика превращаем в 'inn:<ИНН>' (223-ФЗ) или 'spz:<код>' (44-ФЗ)."""
    for a in card.find_all("a", href=True):
        href = a["href"]
        m = INN_RE.search(href)
        if m:
            return f"inn:{m.group(1)}"
        m = ORGCODE_RE.search(href)
        if m:
            return f"spz:{m.group(1)}"
    return ""


def parse_card(card) -> dict:
    num_el = card.select_one(".registry-entry__header-mid__number")
    number = num_el.get_text(strip=True).lstrip("№ ").strip() if num_el else ""

    head = card.select_one(".registry-entry__header-top__title")
    head_txt = head.get_text(" ", strip=True) if head else ""
    law = "44-ФЗ" if "44-ФЗ" in head_txt else ("223-ФЗ" if "223-ФЗ" in head_txt else "—")
    method = head_txt.replace("44-ФЗ", "").replace("223-ФЗ", "").strip() or "—"

    stage_el = card.select_one(".registry-entry__header-mid__title")
    stage = stage_el.get_text(" ", strip=True) if stage_el else ""

    price_el = card.select_one(".price-block__value")
    nmck = eis.parse_price(price_el.get_text(strip=True) if price_el else "")

    m = DATE_RE.search(card.get_text(" ", strip=True))
    posted = m.group(1) if m else ""

    return {
        "number": number, "law": law, "method": method, "stage": stage,
        "object": body_value(card, "Объект закупки"),
        "customer": body_value(card, "Организац") or body_value(card, "Заказчик"),
        "org_ref": org_ref(card), "nmck": nmck, "posted": posted,
    }


def load_seen() -> set[str]:
    if not OUT.exists():
        return set()
    with OUT.open(encoding="utf-8") as f:
        return {row["number"] for row in csv.DictReader(f) if row.get("number")}


def fetch_page(session, query: str, page: int, dfrom: str, dto: str):
    params = {
        "searchString": query, "morphology": "on", "fz44": "on", "fz223": "on",
        "pageNumber": page, "recordsPerPage": "_50",
        "sortBy": "UPDATE_DATE", "sortDirection": "false",
        "publishDateFrom": dfrom, "publishDateTo": dto,
    }
    r = eis.get(session, BASE_URL, params=params)
    if r is None:
        return None
    return [parse_card(c) for c in eis.soup(r.text).select(".search-registry-entry-block")]


def month_windows(since: str, until: str) -> list[tuple[str, str]]:
    """'2024-01','2026-07' -> [('01.06.2026','30.06.2026'), ...] от свежих к старым."""
    sy, sm = map(int, since.split("-"))
    uy, um = map(int, until.split("-"))
    windows = []
    y, m = uy, um
    while (y, m) >= (sy, sm):
        last = [31, 29 if y % 4 == 0 and (y % 100 or y % 400 == 0) else 28,
                31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]
        windows.append((f"01.{m:02d}.{y}", f"{last:02d}.{m:02d}.{y}"))
        m -= 1
        if m == 0:
            m, y = 12, y - 1
    return windows


def main(target: int, max_pages: int, since: str, until: str):
    session = eis.make_session()
    seen = load_seen()
    windows = month_windows(since, until)
    print(f"Старт. Уже собрано: {len(seen)}. Цель: {target}. "
          f"Окон: {len(windows)} ({until}..{since}), запросов: {len(QUERIES)}.")

    new_file = not OUT.exists()
    f = OUT.open("a", encoding="utf-8", newline="")
    writer = csv.DictWriter(f, fieldnames=FIELDS)
    if new_file:
        writer.writeheader()

    collected = len(seen)
    try:
        for dfrom, dto in windows:
            if collected >= target:
                break
            win_new = 0
            for query in QUERIES:
                if collected >= target:
                    break
                empty_streak = 0
                for page in range(1, max_pages + 1):
                    cards = fetch_page(session, query, page, dfrom, dto)
                    if cards is None:
                        break
                    fresh = [c for c in cards if c["number"] and c["number"] not in seen]
                    for c in fresh:
                        seen.add(c["number"])
                        writer.writerow(c)
                    f.flush()
                    collected += len(fresh)
                    win_new += len(fresh)
                    if not cards:
                        break
                    # 2 страницы подряд без новизны в этом окне+запросе — исчерпано
                    empty_streak = empty_streak + 1 if not fresh else 0
                    if empty_streak >= 2 or collected >= target:
                        break
            print(f"  окно {dfrom}..{dto}: +{win_new} | всего {collected}")
    finally:
        f.close()
    print(f"\nГотово. Всего в base.csv: {collected} записей → {OUT}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", type=int, default=10000, help="целевое число записей")
    ap.add_argument("--max-pages", type=int, default=25, help="макс. страниц на окно+запрос")
    ap.add_argument("--since", default="2024-01", help="начало периода YYYY-MM")
    ap.add_argument("--until", default="2026-07", help="конец периода YYYY-MM")
    a = ap.parse_args()
    main(a.target, a.max_pages, a.since, a.until)
