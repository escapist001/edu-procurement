import { useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { scaleLog, scaleSqrt } from 'd3-scale'
import type { Row } from '../lib/types'
import { regionAgg } from '../lib/agg'
import { CLR, median, money, moneyR, num } from '../lib/format'
import { useTip } from '../lib/tooltip'

const W = 860, H = 440
const PL = 58, PR = 22, PT = 26, PB = 40

export function RegionMap({ rows, selected, onSelect }: { rows: Row[]; selected: string | null; onSelect: (r: string) => void }) {
  const reduce = useReducedMotion()
  const tip = useTip()

  const { pts, x, y, r, xLine, yLine, labels } = useMemo(() => {
    const pts = regionAgg(rows).filter((p) => p.sum > 0 && p.med > 0)
    const sums = pts.map((p) => p.sum)
    const meds = pts.map((p) => p.med)
    const counts = pts.map((p) => p.count)
    const x = scaleLog().domain([Math.max(1e4, Math.min(...sums, 1e9)), Math.max(...sums, 1e5)]).range([PL, W - PR]).clamp(true)
    const y = scaleLog().domain([Math.max(5e4, Math.min(...meds, 1e8)), Math.max(...meds, 1e5)]).range([H - PB, PT]).clamp(true)
    const r = scaleSqrt().domain([0, Math.max(...counts, 1)]).range([4, 30])
    const xLine = median(sums)
    const yLine = median(meds)
    // подписи: топ по числу лотов, с уходом от наложения
    const order = [...pts].sort((a, b) => b.count - a.count).slice(0, 9)
    const placed: { x: number; y: number; w: number; h: number }[] = []
    const labels: { name: string; lx: number; ly: number }[] = []
    for (const p of order) {
      const bx = x(p.sum), by = y(p.med), rad = r(p.count)
      const w = p.name.length * 6.4, h = 13
      let lx = bx + rad + 4, ly = by + 4, tries = 0
      while (tries < 4 && placed.some((q) => !(lx > q.x + q.w || lx + w < q.x || ly - h > q.y || ly < q.y - q.h))) {
        ly -= 15
        tries++
      }
      if (tries >= 4) continue
      placed.push({ x: lx, y: ly, w, h })
      labels.push({ name: p.name, lx, ly })
    }
    return { pts, x, y, r, xLine, yLine, labels }
  }, [rows])

  // только «круглые» декады (10^n), иначе лог-шкала плодит слишком много подписей
  const decade = (t: number) => Number.isInteger(Math.round(Math.log10(t) * 1e6) / 1e6)
  const yTicks = y.ticks(6).filter(decade)
  const xTicks = x.ticks(8).filter(decade)

  return (
    <div className="panel">
      <div className="eyebrow">
        <span className="num">01</span>Где · география спроса
      </div>
      <h2>Карта регионов: куда ехать первым делом</h2>
      <p className="how">
        Пузырь — регион. Правее — больше денег, выше — крупнее медианный чек, больше пузырь — больше лотов, цвет —
        доминирующая процедура. Клик — фильтр по региону.
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} onMouseLeave={() => tip.hide()}>
        {/* сетка + оси */}
        {yTicks.map((t) => (
          <g key={'y' + t}>
            <line className="grid-line" x1={PL} x2={W - PR} y1={y(t)} y2={y(t)} />
            <text className="axis-txt" x={PL - 6} y={y(t) + 3} textAnchor="end">
              {money(t)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={'x' + t} className="axis-txt" x={x(t)} y={H - PB + 16} textAnchor="middle">
            {money(t)}
          </text>
        ))}
        {/* линии медиан рынка */}
        <line x1={x(xLine)} x2={x(xLine)} y1={PT} y2={H - PB} stroke="rgba(242,169,59,.28)" strokeDasharray="5 5" />
        <line x1={PL} x2={W - PR} y1={y(yLine)} y2={y(yLine)} stroke="rgba(242,169,59,.28)" strokeDasharray="5 5" />
        {/* подписи квадрантов */}
        <text className="axis-txt" x={W - PR - 6} y={PT + 12} textAnchor="end" fill="rgba(148,163,191,.5)">МНОГО И ДОРОГО</text>
        <text className="axis-txt" x={PL + 4} y={PT + 12} fill="rgba(148,163,191,.5)">МАЛО, НО ЖИРНО</text>
        <text className="axis-txt" x={PL + 4} y={H - PB - 6} fill="rgba(148,163,191,.5)">ПОКА ПУСТО</text>
        <text className="axis-txt" x={W - PR - 6} y={H - PB - 6} textAnchor="end" fill="rgba(148,163,191,.5)">МНОГО, НО МЕЛКО</text>
        {/* оси-подписи */}
        <text className="axis-txt" x={W / 2} y={H - 4} textAnchor="middle" fill="var(--dim)">объём региона, ₽</text>
        <text className="axis-txt" transform={`rotate(-90 14 ${H / 2})`} x={14} y={H / 2} textAnchor="middle" fill="var(--dim)">медиана чека, ₽</text>

        {/* пузыри */}
        {pts.map((p) => {
          const dim = selected && selected !== p.name
          return (
            <motion.circle
              key={p.name}
              cx={x(p.sum)}
              cy={y(p.med)}
              r={r(p.count)}
              fill={CLR[p.dom]}
              fillOpacity={dim ? 0.15 : 0.62}
              stroke={CLR[p.dom]}
              strokeOpacity={dim ? 0.3 : 1}
              strokeWidth={1.2}
              style={{ cursor: 'pointer' }}
              initial={reduce ? false : { scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.4 }}
              onClick={() => onSelect(p.name)}
              onMouseMove={(e) =>
                tip.show(
                  e.clientX,
                  e.clientY,
                  <>
                    <div className="h">{p.name}</div>
                    <div className="r"><b>{num(p.count)}</b> лотов</div>
                    <div className="r">объём <b>{moneyR(p.sum)}</b></div>
                    <div className="r">медиана <b>{moneyR(p.med)}</b></div>
                    <div className="r">чаще: {p.dom}</div>
                  </>,
                )
              }
            />
          )
        })}
        {/* подписи топ-регионов */}
        {labels.map((l) => (
          <text key={l.name} x={l.lx} y={l.ly} fill="#EAF0FA" fontSize={11} fontWeight={600} style={{ pointerEvents: 'none' }}>
            {l.name}
          </text>
        ))}
      </svg>
    </div>
  )
}
