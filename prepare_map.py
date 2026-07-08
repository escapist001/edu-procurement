"""
Подготовка полигональной карты РФ для дашборда.

Берём открытый geojson субъектов РФ, приводим названия к нашим каноничным (чтобы данные
ложились на полигоны) и упрощаем геометрию: округляем координаты и прореживаем точки —
для обзорной карты субкилометровая точность избыточна, а вес файла критичен для веба.

Вход:  data/russia.geojson (скачивается отдельно)
Выход: dashboard/public/regions.geojson  (+ docs/regions.geojson)

Запуск:  python prepare_map.py
"""

from __future__ import annotations

import json

import eis

SRC = eis.DATA / "russia.geojson"
COORD_PREC = 2          # знаков после запятой (~1 км) — достаточно для обзора
_CANON = set(eis.REGION_BY_CODE.values())
_CNORM = {eis._norm(c): c for c in _CANON}


def to_canon(name: str) -> str | None:
    if name in _CANON:
        return name
    n = eis._norm(name)
    if n in _CNORM:
        return _CNORM[n]
    for core in eis._CORES:
        if core and core in n:
            return eis._CORE_TO_CANON[core]
    return None


def simplify_ring(ring: list) -> list:
    """Округлить координаты, проредить точки длинных колец, убрать дубли.

    Длинные кольца (детальная береговая линия) прореживаем — для обзорной карты страны
    столько точек не нужно. Мелкие регионы (короткие кольца) не трогаем, чтобы не схлопнуть.
    """
    n = len(ring)
    step = 3 if n > 400 else 2 if n > 120 else 1
    out = []
    for i, (x, y) in enumerate(ring):
        if step > 1 and i % step and 0 < i < n - 1:
            continue
        # арктическое побережье срезаем по 72°N: материковые регионы (Таймыр, Саха) уходят
        # выше в зону, где коническая проекция выворачивается кляксой. Север станет ровным.
        p = [round(x, COORD_PREC), round(min(y, 72.0), COORD_PREC)]
        if not out or out[-1] != p:
            out.append(p)
    if len(out) >= 3 and out[0] != out[-1]:
        out.append(out[0])
    return out if len(out) >= 4 else []


def bad_ring(ring: list) -> bool:
    """Кольцо, которое ломает коническую проекцию:
      • перескакивает 180° (Чукотка) — клякса на весь кадр;
      • целиком в высокой Арктике (>72°N: Новая Земля, Северная Земля, ЗФИ, Новосибирские
        о-ва) — уходит за горизонт проекции и заливает фон.
    Для обзорной карты рынка это несущественные островные хвосты — выкидываем."""
    if not ring:
        return True
    lons = [x for x, _ in ring]
    lats = [y for _, y in ring]
    if min(lons) < 0 or (max(lons) - min(lons)) > 170:
        return True
    if min(lats) > 72:
        return True
    return False


def simplify_geom(geom: dict) -> dict:
    t = geom["type"]
    if t == "Polygon":
        rings = []
        for ring in geom["coordinates"]:
            if bad_ring(ring):
                continue
            s = simplify_ring(ring)
            if s:
                rings.append(s)
        return {"type": "Polygon", "coordinates": rings}
    if t == "MultiPolygon":
        polys = []
        for poly in geom["coordinates"]:
            if poly and bad_ring(poly[0]):
                continue  # выкидываем заантимеридианный под-полигон целиком
            rings = [r for r in (simplify_ring(ring) for ring in poly) if r]
            if rings:
                polys.append(rings)
        return {"type": "MultiPolygon", "coordinates": polys}
    return geom


def main():
    g = json.loads(SRC.read_text(encoding="utf-8"))
    out_feats, unmatched = [], []
    for f in g["features"]:
        canon = to_canon(f["properties"].get("name", ""))
        if not canon:
            unmatched.append(f["properties"].get("name"))
            continue
        out_feats.append({
            "type": "Feature",
            "properties": {"region": canon},
            "geometry": simplify_geom(f["geometry"]),
        })
    fc = {"type": "FeatureCollection", "features": out_feats}
    payload = json.dumps(fc, ensure_ascii=False, separators=(",", ":"))

    for rel in ("dashboard/public/regions.geojson", "docs/regions.geojson"):
        out = eis.ROOT / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(payload, encoding="utf-8")

    size_kb = len(payload.encode("utf-8")) / 1024
    print(f"Регионов на карте: {len(out_feats)} | не сматчено: {unmatched}")
    print(f"Размер geojson: {size_kb:.0f} КБ")


if __name__ == "__main__":
    main()
