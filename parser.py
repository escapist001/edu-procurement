"""
Парсер госзакупок учебного оборудования из ЕИС (zakupki.gov.ru).

Официального удобного API у ЕИС нет, но страницы расширенного поиска отдаются
сервером как обычный HTML — его можно распарсить. Скрипт по ключевому запросу
«учебное оборудование» (44-ФЗ и 223-ФЗ) проходит N страниц выдачи и вытаскивает
из каждой карточки: номер, закон, способ, стадию, объект закупки, заказчика,
НМЦК, дату размещения и регион (эвристика по названию заказчика).

Результат — data/contracts.csv, на котором дальше работает analysis.py.

Запуск:  python parser.py --pages 20
Замечание: сертификат ЕИС выдан российским УЦ, которого нет в стандартном
хранилище, поэтому проверка TLS отключена (verify=False) — данные открытые.
"""

import argparse
import csv
import re
import time
from pathlib import Path

import requests
import urllib3
from bs4 import BeautifulSoup

urllib3.disable_warnings()

BASE = "https://zakupki.gov.ru/epz/order/extendedsearch/results.html"
QUERY = "учебное оборудование"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
OUT = Path(__file__).resolve().parent / "data" / "contracts.csv"

DATE_RE = re.compile(r"Размещено\s*([0-3]?\d\.[01]?\d\.\d{4})")

# Регион — эвристика по названию заказчика (uppercase).
REGION_PATTERNS = [
    (re.compile(r"Г\.?\s*МОСКВ|ГОРОД МОСКВА"), "Москва"),
    (re.compile(r"САНКТ-ПЕТЕРБУРГ|С-ПЕТЕРБУРГ"), "Санкт-Петербург"),
    (re.compile(r"СЕВАСТОПОЛ"), "Севастополь"),
    (re.compile(r"([А-ЯЁ\-]+)\s+ОБЛАСТ"), None),      # <слово> область
    (re.compile(r"([А-ЯЁ\-]+)\s+КРА[ЙЯ]"), None),      # <слово> край
    (re.compile(r"РЕСПУБЛИК[АИ]\s+([А-ЯЁ\-]+)"), None),
    (re.compile(r"([А-ЯЁ\-]+)\s+РЕСПУБЛИК"), None),
    (re.compile(r"([А-ЯЁ\-]+)\s+АВТОНОМН\w*\s+ОКРУГ"), None),
]

# Слова оргправовой формы — их эвристика не должна принимать за регион.
REGION_STOP = {"МУНИЦИПАЛЬНОЕ", "ГОСУДАРСТВЕННОЕ", "БЮДЖЕТНОЕ", "КАЗЕННОЕ", "КАЗЁННОЕ",
               "АВТОНОМНОЕ", "ФЕДЕРАЛЬНОЕ", "ОБЛАСТНОЕ", "КРАЕВОЕ", "ЧАСТНОЕ",
               "ОБЩЕОБРАЗОВАТЕЛЬНОЕ", "ДОШКОЛЬНОЕ", "ПРОФЕССИОНАЛЬНОЕ", "БЮДЖЕТНОГО"}


def parse_price(text: str):
    """'502 416,84 ₽' -> 502416.84 (или None)."""
    if not text:
        return None
    t = text.replace("\xa0", "").replace(" ", "").replace("₽", "").replace(",", ".")
    m = re.search(r"\d+(\.\d+)?", t)
    return float(m.group()) if m else None


def detect_region(customer: str):
    up = customer.upper()
    for pat, fixed in REGION_PATTERNS:
        m = pat.search(up)
        if m:
            if fixed:
                return fixed
            word = m.group(1).strip("-")
            if len(word) < 3 or word in REGION_STOP:
                continue
            return word.capitalize()
    return "Не определён"


def body_value(card, title_sub: str):
    for blk in card.select(".registry-entry__body-block"):
        ttl = blk.select_one(".registry-entry__body-title")
        if ttl and title_sub in ttl.get_text(" ", strip=True):
            val = (blk.select_one(".registry-entry__body-value")
                   or blk.select_one(".registry-entry__body-href"))
            return val.get_text(" ", strip=True) if val else ""
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

    obj = body_value(card, "Объект закупки")
    customer = body_value(card, "Организац") or body_value(card, "Заказчик")

    price_el = card.select_one(".price-block__value")
    price = parse_price(price_el.get_text(strip=True) if price_el else "")

    m = DATE_RE.search(card.get_text(" ", strip=True))
    posted = m.group(1) if m else ""

    return {
        "number": number, "law": law, "method": method, "stage": stage,
        "object": obj, "customer": customer, "price_rub": price,
        "posted": posted, "region": detect_region(customer),
    }


def fetch_page(session: requests.Session, page: int):
    params = {
        "searchString": QUERY, "morphology": "on",
        "fz44": "on", "fz223": "on",
        "pageNumber": page, "recordsPerPage": "_50",
        "sortBy": "UPDATE_DATE", "sortDirection": "false",
    }
    r = session.get(BASE, params=params, timeout=45, verify=False)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "lxml")
    return [parse_card(c) for c in soup.select(".search-registry-entry-block")]


def main(pages: int):
    session = requests.Session()
    session.headers.update({"User-Agent": UA, "Accept-Language": "ru-RU,ru;q=0.9"})

    seen, rows = set(), []
    for p in range(1, pages + 1):
        try:
            cards = fetch_page(session, p)
        except Exception as exc:
            print(f"  страница {p}: ошибка {exc}")
            break
        new = 0
        for row in cards:
            if row["number"] and row["number"] not in seen:
                seen.add(row["number"]); rows.append(row); new += 1
        print(f"  страница {p}: карточек {len(cards)}, новых {new}")
        if not cards:
            break
        time.sleep(0.8)  # вежливая пауза между запросами

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader(); w.writerows(rows)
    print(f"\nСобрано записей: {len(rows)}  ->  {OUT}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=int, default=20)
    main(ap.parse_args().pages)
