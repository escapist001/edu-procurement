import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { scaleBand, scaleLinear } from 'd3-scale'
import { line as d3line } from 'd3-shape'
import type { Row } from '../lib/types'
import { paretoAgg } from '../lib/agg'
import { useStore } from '../store'
import { money, moneyR, num } from '../lib/format'
import { useTip } from '../lib/tooltip'

const W = 900, H = 320, PL = 44, PR = 46, PT = 14, PB = 20

export function Pareto({ rows }: { rows: Row[] }) {
  const tip = useTip()
  const s = useStore()
  const { top, cum } = useMemo(() => {
    const arr = paretoAgg(rows)
    const total = arr.reduce((a, b) => a + b.sum, 0) || 1
    const top = arr.slice(0, 15)
    let c = 0
    const cum = top.map((t) => {
      c += t.sum
      return (c / total) * 100
    })
    return { top, cum }
  }, [rows])

  const xb = scaleBand().domain(top.map((_, i) => String(i))).range([PL, W - PR]).padding(0.3)
  const maxS = Math.max(1, ...top.map((t) => t.sum))
  const yL = scaleLinear().domain([0, maxS]).range([H - PB, PT])
  const yR = scaleLinear().domain([0, 100]).range([H - PB, PT])
  const lineGen = d3line<number>()
    .x((_, i) => (xb(String(i)) || 0) + xb.bandwidth() / 2)
    .y((d) => yR(d))
  const path = lineGen(cum) || ''

  return (
    <div className="panel">
      <div className="eyebrow"><span className="num">04</span>С кем · заказчики</div>
      <h2>Кто держит деньги: топ и концентрация</h2>
      <p className="how">Топ-15 заказчиков по сумме НМЦК + кумулятивная доля рынка. Клик по столбцу — фильтр.</p>
      {!top.length && <p className="how" style={{ padding: '40px 0', textAlign: 'center' }}>Под текущий фильтр заказчиков нет.</p>}
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: top.length ? 'block' : 'none' }} onMouseLeave={() => tip.hide()}>
        {yL.ticks(4).map((t) => (
          <g key={t}>
            <line className="grid-line" x1={PL} x2={W - PR} y1={yL(t)} y2={yL(t)} />
            <text className="axis-txt" x={PL - 6} y={yL(t) + 3} textAnchor="end">{money(t)}</text>
          </g>
        ))}
        {top.map((t, i) => {
          const bx = xb(String(i)) || 0
          const dim = s.customer && s.customer !== t.c
          return (
            <motion.rect
              key={t.c}
              x={bx}
              width={xb.bandwidth()}
              rx={3}
              fill={dim ? '#5B8DEF44' : '#5B8DEF'}
              style={{ cursor: 'pointer' }}
              initial={{ y: H - PB, height: 0 }}
              animate={{ y: yL(t.sum), height: H - PB - yL(t.sum) }}
              transition={{ duration: 0.5, ease: 'easeOut', delay: i * 0.015 }}
              onClick={() => s.set('customer', t.c)}
              onMouseMove={(e) =>
                tip.show(e.clientX, e.clientY, (
                  <>
                    <div className="h">{t.c}</div>
                    <div className="r">сумма <b>{moneyR(t.sum)}</b></div>
                    <div className="r"><b>{num(t.n)}</b> лотов · топ держит <b>{Math.round(cum[i])}%</b></div>
                  </>
                ))
              }
            />
          )
        })}
        <motion.path d={path} fill="none" stroke="#F2A93B" strokeWidth={2} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9 }} />
        {yR.ticks(4).map((t) => (
          <text key={'r' + t} className="axis-txt" x={W - PR + 5} y={yR(t) + 3}>{t}%</text>
        ))}
      </svg>
    </div>
  )
}
