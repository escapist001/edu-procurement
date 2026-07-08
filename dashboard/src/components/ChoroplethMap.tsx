import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import type { Row } from '../lib/types'
import { median, money, moneyR, num, pct } from '../lib/format'
import { useTip } from '../lib/tooltip'

// Проекция под Россию сделана вручную (равнопромежуточная с поправкой на косинус широты).
// Готовые d3-проекции для страны, тянущейся от 20° до 180°E и до полюса, дают артефакты
// (апекс конической/горизонт/разрыв на 180°). Простая линейная проекция предсказуема: без
// клякс и разрывов, а лёгкое искажение площадей для обзорной карты рынка несущественно.
const W = 900, H = 450

type Mode = 'money' | 'drop' | 'ease'
const MODES: { k: Mode; label: string; how: string; hue: [number, number, number] }[] = [
  { k: 'money', label: 'Деньги рынка', hue: [91, 141, 239],
    how: 'Где сосредоточен бюджет на учебное оборудование — там объём заказа.' },
  { k: 'drop', label: 'Конкуренция', hue: [242, 169, 59],
    how: 'Медианное снижение цены на торгах — реальный исход из протоколов. Ярче = цены рубят сильнее (тесно, риск для маржи), бледнее = заходить спокойнее.' },
  { k: 'ease', label: 'Лёгкость входа', hue: [70, 194, 203],
    how: 'Где меньше закупок у единственного поставщика — честной заявкой зайти проще.' },
]

interface Feat { region: string; d: string }
interface Agg { sum: number; count: number; drops: number[]; single: number }
type Ring = [number, number][]
type Geom =
  | { type: 'Polygon'; coordinates: Ring[] }
  | { type: 'MultiPolygon'; coordinates: Ring[][] }

export function ChoroplethMap({ rows, selected, onSelect }: {
  rows: Row[]; selected: string | null; onSelect: (r: string) => void
}) {
  const reduce = useReducedMotion()
  const tip = useTip()
  const [mode, setMode] = useState<Mode>('drop')
  const [raw, setRaw] = useState<{ type: string; features: unknown[] } | null>(null)
  const loaded = useRef(false)

  // грузим geojson один раз
  useEffect(() => {
    if (loaded.current) return
    loaded.current = true
    fetch(`${import.meta.env.BASE_URL}regions.geojson`)
      .then((r) => r.json())
      .then((fc) => setRaw(fc))
      .catch(() => setRaw(null))
  }, [])

  const feats = useMemo<Feat[]>(() => {
    if (!raw) return []
    // bbox всех точек
    let minLon = 999, maxLon = -999, minLat = 999, maxLat = -999
    const eachPt = (cb: (lon: number, lat: number) => void) => {
      for (const f of raw.features as { geometry: Geom }[]) {
        const g = f.geometry
        const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates
        for (const poly of polys) for (const ring of poly) for (const [x, y] of ring) cb(x, y)
      }
    }
    eachPt((lon, lat) => {
      if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon
      if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat
    })
    // Заполняем весь кадр (независимые масштабы по осям), чтобы карта была крупной и не
    // тонула в тёмных полях. Лёгкая коррекция ширины на косинус широты, но с ограничением
    // снизу — иначе страна выходит слишком приплюснутой по вертикали.
    const midLat = ((minLat + maxLat) / 2) * Math.PI / 180
    const cos = Math.max(0.72, Math.cos(midLat))
    const pad = 8
    const kx = (W - pad * 2) / ((maxLon - minLon) * cos)
    const ky = (H - pad * 2) / (maxLat - minLat)
    const px = (lon: number) => pad + (lon - minLon) * cos * kx
    const py = (lat: number) => pad + (maxLat - lat) * ky   // север сверху

    const ringPath = (ring: [number, number][]) =>
      'M' + ring.map(([x, y]) => `${px(x).toFixed(1)} ${py(y).toFixed(1)}`).join('L') + 'Z'

    const fs: Feat[] = []
    for (const f of raw.features as { properties: { region: string }; geometry: Geom }[]) {
      const g = f.geometry
      const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates
      const d = polys.map((poly) => poly.map(ringPath).join('')).join('')
      if (d) fs.push({ region: f.properties.region, d })
    }
    return fs
  }, [raw])

  // агрегаты по региону из текущей выборки
  const agg = useMemo(() => {
    const by: Record<string, Agg> = {}
    for (const r of rows) {
      if (!r.rg) continue
      const a = (by[r.rg] ||= { sum: 0, count: 0, drops: [], single: 0 })
      a.count++
      if (r.p != null) a.sum += r.p
      if (r.dp != null) a.drops.push(r.dp)
      if (r.mt === 'Ед. поставщик') a.single++
    }
    return by
  }, [rows])

  const metric = (a: Agg | undefined): number | null => {
    if (!a || !a.count) return null
    if (mode === 'money') return a.sum
    if (mode === 'drop') return a.drops.length >= 3 ? median(a.drops) : null
    return a.count ? 1 - a.single / a.count : null
  }

  // Нормировка интенсивности заливки:
  //  • деньги распределены крайне неравно (Москва vs глубинка) — по логарифму цвет сливается,
  //    поэтому берём ПЕРЦЕНТИЛЬНЫЙ РАНГ: топ-регион всегда яркий, аутсайдер тёмный, контраст ровный;
  //  • снижение и открытость — линейно (важна абсолютная величина «спокойно ↔ жёстко»).
  const { norm, hi } = useMemo(() => {
    const vals: number[] = []
    for (const r of feats) {
      const v = metric(agg[r.region])
      if (v != null) vals.push(v)
    }
    const max = Math.max(...vals, mode === 'ease' ? 1 : 0.0001)
    const sorted = [...vals].sort((a, b) => a - b)
    const rank = (v: number) => {
      if (!sorted.length) return 0
      let lo = 0, hi2 = sorted.length
      while (lo < hi2) { const m = (lo + hi2) >> 1; if (sorted[m] < v) lo = m + 1; else hi2 = m }
      return lo / Math.max(1, sorted.length - 1)
    }
    const norm = (v: number) => {
      if (mode === 'money') return rank(v)
      if (mode === 'drop') return Math.min(1, v / 40)   // 40% снижения = «жёстко»
      return v                                          // ease уже 0..1
    }
    return { norm, hi: max }
  }, [feats, agg, mode])

  const fill = (region: string) => {
    const v = metric(agg[region])
    if (v == null) return 'rgba(255,255,255,0.03)' // нет данных
    const [r, g, b] = MODES.find((m) => m.k === mode)!.hue
    const t = Math.max(0.06, Math.min(1, norm(v)))
    return `rgba(${r},${g},${b},${0.1 + t * 0.78})`
  }

  const cur = MODES.find((m) => m.k === mode)!
  const withData = feats.filter((f) => metric(agg[f.region]) != null).length

  const tipFor = (region: string) => {
    const a = agg[region]
    const md = a?.drops.length ? median(a.drops) : null
    return (
      <>
        <div className="h">{region}</div>
        {a?.count ? (
          <>
            <div className="r"><b>{num(a.count)}</b> закупок</div>
            <div className="r">объём <b>{moneyR(a.sum)}</b></div>
            {md != null && <div className="r">снижение цены <b>{pct(md, 1)}</b> <span style={{ color: 'var(--dim)' }}>(n={a.drops.length})</span></div>}
            <div className="r">открытость <b>{pct((1 - a.single / a.count) * 100)}</b></div>
          </>
        ) : (
          <div className="r" style={{ color: 'var(--dim)' }}>под фильтром данных нет</div>
        )}
      </>
    )
  }

  return (
    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div className="eyebrow"><span className="num">01</span>Где · карта страны</div>
          <h2 style={{ marginBottom: 2 }}>Куда заходить: рынок по регионам</h2>
        </div>
        <div className="seg">
          {MODES.map((m) => (
            <button key={m.k} className={mode === m.k ? 'on' : ''} onClick={() => setMode(m.k)}>
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <p className="how">{cur.how} Клик по региону — фильтр.</p>

      {!feats.length && <p className="how" style={{ padding: '80px 0', textAlign: 'center' }}>Загрузка карты…</p>}

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: feats.length ? 'block' : 'none' }}
           onMouseLeave={() => tip.hide()}>
        {feats.map((f, i) => {
          const dim = selected && selected !== f.region
          const active = selected === f.region
          return (
            <motion.path
              key={f.region}
              d={f.d}
              fill={fill(f.region)}
              stroke={active ? 'var(--amber)' : 'rgba(12,17,28,0.9)'}
              strokeWidth={active ? 1.6 : 0.5}
              style={{ cursor: 'pointer' }}
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: dim ? 0.35 : 1 }}
              transition={reduce ? { duration: 0 } : { duration: 0.4, delay: Math.min(i * 0.004, 0.5) }}
              onClick={() => onSelect(f.region)}
              onMouseMove={(e) => tip.show(e.clientX, e.clientY, tipFor(f.region))}
            />
          )
        })}
      </svg>

      {feats.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
          {/* легенда-градиент */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="axis-txt" style={{ color: 'var(--dim)' }}>
              {mode === 'money' ? 'меньше денег' : mode === 'drop' ? 'спокойно' : 'закрыто'}
            </span>
            <div style={{
              width: 140, height: 9, borderRadius: 5,
              background: `linear-gradient(90deg, rgba(${cur.hue[0]},${cur.hue[1]},${cur.hue[2]},0.12), rgba(${cur.hue[0]},${cur.hue[1]},${cur.hue[2]},0.9))`,
            }} />
            <span className="axis-txt" style={{ color: 'var(--dim)' }}>
              {mode === 'money' ? money(hi) + ' ₽' : mode === 'drop' ? 'жёстко' : 'открыто'}
            </span>
          </div>
          <span className="axis-txt" style={{ color: 'var(--dim)' }}>
            {withData} регионов с данными · серые — вне выборки
          </span>
        </div>
      )}
    </div>
  )
}
