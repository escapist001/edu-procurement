"""
Этап 3 конвейера — РЕАЛЬНЫЙ исход торгов: финальная цена и снижение от НМЦК.

Это ядро ценности «Радара»: снижение цены на торгах — прямой ex-post показатель реальной
конкуренции и демпинг-риска для маржи поставщика. В отличие от прокси «из головы», это факт
из протокола подведения итогов.

Для каждой завершённой закупки 44-ФЗ открываем вкладку результатов
(`.../notice/<тип>/view/supplier-results.html`). Тип процедуры知 заранее не известен, но
портал сам редиректит с любого типа на правильный, сохраняя вкладку — поэтому запрашиваем
через ea44 и идём за редиректом. Из таблицы «Предложения участников, ₽» берём строку
победителя → его цену. Снижение = (НМЦК − финал) / НМЦК.

Не у каждой завершённой закупки есть результат (несостоявшиеся, отменённые) — это не
заглушка, а факт: у такой закупки исхода нет, помечаем has_result=0.

Пул потоков + возобновление (пропускаем номера, уже записанные в outcomes.csv).

Запуск:  python scrape_outcomes.py
"""

from __future__ import annotations

import csv
import re
import threading
from concurrent.futures import ThreadPoolExecutor

import eis

BASE = eis.DATA / "base.csv"
OUT = eis.DATA / "outcomes.csv"
SR_URL = f"{eis.HOST}/epz/order/notice/ea44/view/supplier-results.html"

FIELDS = ["number", "nmck", "final_price", "drop_pct", "winner_id", "has_result"]
_lock = threading.Lock()


def parse_outcome(html: str) -> dict:
    """Из HTML вкладки результатов достаём цену победителя и его идентификатор."""
    sp = eis.soup(html)
    winner_price, winner_id = None, ""

    # ищем таблицу с колонкой «Предложения участников, ₽»
    for tbl in sp.find_all("table"):
        head = tbl.get_text(" ", strip=True)
        if "Предложения участников" not in head:
            continue
        for tr in tbl.find_all("tr"):
            cells = [td.get_text(" ", strip=True) for td in tr.find_all(["td", "th"])]
            if len(cells) < 3:
                continue
            row = " ".join(cells)
            # строка победителя: содержит «Победител» или порядковый номер «1»
            if "Победител" in row or re.match(r"^1\b", cells[1].strip()):
                price = eis.parse_price(cells[-1])
                if price:
                    winner_price = price
                    winner_id = cells[0].strip()
                    break
        if winner_price is not None:
            break

    # запасной путь: явная «Цена контракта» / «итоговая цена» в тексте
    if winner_price is None:
        m = re.search(r"(?:Цена контракта|Итогова\w* цена)\D{0,40}?([\d \xa0]+,\d{2})",
                      sp.get_text(" "))
        if m:
            winner_price = eis.parse_price(m.group(1))

    return {"final_price": winner_price, "winner_id": winner_id}


def fetch_outcome(session, number: str, nmck: float | None) -> dict | None:
    # None == не удалось загрузить (бан/сбой) → строку не пишем, повторим в след. прогон.
    r = eis.get(session, SR_URL, params={"regNumber": number}, retries=3, pause=0.5)
    if r is None:
        return None
    o = parse_outcome(r.text)
    final = o["final_price"]
    drop = ""
    if final and nmck and nmck > 0:
        drop = round(max(0.0, (nmck - final) / nmck) * 100, 2)
    return {
        "number": number, "nmck": nmck, "final_price": final or "",
        "drop_pct": drop, "winner_id": o["winner_id"],
        "has_result": 1 if final else 0,
    }


def load_done() -> set[str]:
    if not OUT.exists():
        return set()
    with OUT.open(encoding="utf-8") as f:
        return {row["number"] for row in csv.DictReader(f) if row.get("number")}


def main(workers: int = 3):
    with BASE.open(encoding="utf-8") as f:
        rows = [r for r in csv.DictReader(f)]
    # завершённые 44-ФЗ (у 223-ФЗ протоколы часто закрыты) — целимся в них
    done_stages = ("Определение поставщика завершено", "Закупка завершена")
    todo = [r for r in rows
            if r["law"] == "44-ФЗ" and r["stage"] in done_stages]
    already = load_done()
    todo = [r for r in todo if r["number"] not in already]
    print(f"К добыче исходов: {len(todo)} (в outcomes уже {len(already)})")

    new_file = not OUT.exists()
    f = OUT.open("a", encoding="utf-8", newline="")
    writer = csv.DictWriter(f, fieldnames=FIELDS)
    if new_file:
        writer.writeheader()

    session = eis.make_session()
    done = [0]
    got = [0]

    def work(r):
        nmck = float(r["nmck"]) if r["nmck"] else None
        try:
            rec = fetch_outcome(session, r["number"], nmck)
        except Exception:
            rec = None
        if rec is None:                 # бан/сбой — не пишем, номер повторится позже
            return
        with _lock:
            writer.writerow(rec)
            done[0] += 1
            got[0] += rec["has_result"]
            if done[0] % 100 == 0:
                f.flush()
                print(f"  …{done[0]} | с результатом {got[0]}", flush=True)

    try:
        with ThreadPoolExecutor(max_workers=workers) as ex:
            for _ in ex.map(work, todo):
                pass
    finally:
        f.close()
    print(f"\nГотово. Обработано {done[0]}, с реальным результатом {got[0]}.")


if __name__ == "__main__":
    main()
