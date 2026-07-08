"""
Этап 2 конвейера — чистый регион заказчика (замена genitive-эвристики по названию).

Регион берём из структурных кодов, а не угадываем по имени организации:
  • 223-ФЗ: ИНН заказчика есть прямо в base.csv (org_ref='inn:...') → первые 2 цифры = код
    субъекта РФ по справочнику ФНС. Запрос не нужен.
  • 44-ФЗ: в base.csv только код СПЗ (org_ref='spz:...'). Открываем карточку заказчика на
    портале, достаём ОКТМО и ИНН → первые 2 цифры кода = субъект РФ.

Резолвим по УНИКАЛЬНЫМ заказчикам (один заказчик = много закупок), результат кэшируем в
data/orgs.json. Повторный запуск не перезапрашивает уже известных — возобновление.
Сетевые запросы (только для 44-ФЗ) идут пулом потоков: портал терпит вежливый параллелизм.

Запуск:  python resolve_regions.py
"""

from __future__ import annotations

import csv
import json
import re
import threading
from concurrent.futures import ThreadPoolExecutor

import eis

BASE = eis.DATA / "base.csv"
CACHE = eis.DATA / "orgs.json"
ORG_URL = f"{eis.HOST}/epz/organization/view/info.html"

_lock = threading.Lock()


def _labelled_value(sp, label: str) -> str:
    """Значение поля карточки организации по подписи (ИНН/Место нахождения/…)."""
    for cls in ("section__title", "registry-entry__body-title", "cardMainInfo__title"):
        for el in sp.find_all(class_=cls):
            if el.get_text(strip=True) == label:
                sib = el.find_next_sibling()
                if sib:
                    return sib.get_text(" ", strip=True)
    return ""


def load_cache() -> dict:
    if CACHE.exists():
        return json.loads(CACHE.read_text(encoding="utf-8"))
    return {}


def save_cache(cache: dict):
    with _lock:
        CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=0),
                         encoding="utf-8")


def region_for_inn(inn: str) -> dict:
    # 223-ФЗ: ИНН заказчика уже в базе, регион — из кода ФНС (первые 2 цифры). Без запроса.
    return {"inn": inn, "place": "", "region": eis.region_from_inn(inn) or "Не определён"}


def resolve_spz(session, org_ref: str) -> dict:
    """Открыть карточку 44-ФЗ заказчика → «Место нахождения» → субъект РФ.

    Основной источник — адрес (фактический субъект деятельности). Если субъект из адреса
    не распознан, откатываемся к коду ФНС по ИНН заказчика.
    """
    code = org_ref.split(":", 1)[1]
    r = eis.get(session, ORG_URL, params={"organizationCode": code}, pause=0.25)
    if r is None:
        return {"inn": "", "place": "", "region": "Не определён"}
    sp = eis.soup(r.text)
    place = _labelled_value(sp, "Место нахождения")
    inn = _labelled_value(sp, "ИНН")
    region = eis.region_from_address(place) or eis.region_from_inn(inn) or "Не определён"
    return {"inn": inn, "place": place, "region": region}


def main(workers: int = 6):
    with BASE.open(encoding="utf-8") as f:
        refs = {row["org_ref"] for row in csv.DictReader(f) if row.get("org_ref")}
    cache = load_cache()

    # 223-ФЗ решаем без сети
    inn_refs = [r for r in refs if r.startswith("inn:") and r not in cache]
    for ref in inn_refs:
        cache[ref] = region_for_inn(ref.split(":", 1)[1])
    if inn_refs:
        save_cache(cache)
        print(f"223-ФЗ: {len(inn_refs)} заказчиков решено из ИНН без запросов.")

    # 44-ФЗ требует запрос к карточке заказчика
    spz_todo = [r for r in refs if r.startswith("spz:") and r not in cache]
    print(f"44-ФЗ: резолвим {len(spz_todo)} уникальных заказчиков "
          f"(в кэше уже {sum(1 for r in cache if r.startswith('spz:'))})…")

    session = eis.make_session()
    done = [0]

    def work(ref):
        try:
            info = resolve_spz(session, ref)
        except Exception as exc:                       # один сбой не должен ронять всё
            info = {"inn": "", "place": "", "region": "Не определён", "err": str(exc)[:60]}
        with _lock:
            cache[ref] = info
            done[0] += 1
            if done[0] % 50 == 0:
                CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=0),
                                 encoding="utf-8")
                print(f"  …{done[0]}/{len(spz_todo)}", flush=True)

    with ThreadPoolExecutor(max_workers=workers) as ex:
        for _ in ex.map(work, spz_todo):
            pass
    save_cache(cache)

    # сводка качества
    from collections import Counter
    reg = Counter(v["region"] for v in cache.values())
    und = reg.get("Не определён", 0)
    print(f"\nГотово. Заказчиков в кэше: {len(cache)}. "
          f"Не определён: {und} ({und/max(len(cache),1)*100:.1f}%). Топ регионов:")
    for name, n in reg.most_common(8):
        print(f"  {n:5} {name}")


if __name__ == "__main__":
    main()
