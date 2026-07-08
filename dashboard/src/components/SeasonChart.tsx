import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { scaleBand, scaleLinear } from 'd3-scale'
import { line as d3line } from 'd3-shape'
import type { Row } from '../lib/types'
import { monthAgg } from '../lib/agg'
import { money, moneyR, monLabel, num } from '../lib/format'
import { useTip } from '../lib/tooltip'

const W = 440, H = 250, PL = 40, PR = 46, PT = 12, PB = 30

export function SeasonChart({ rows, selected, onSelect }: { rows: Row[]; selected: string | null; onSelect: (m: string) => void }) {
  const tip = useTip()
  const data = useMemo(() => monthAgg(rows), [rows])
  const xb = scaleBand().domain(data.map((d) => d.key)).range([PL, W - PR]).padding(0.34)
  const maxC = Math.max(1, ...data.map((d) => d.count))
  const maxS = Math.max(1, ...data.map((d) => d.sum))
  const yL = scaleLinear().domain([0, maxC]).range([H - PB, PT])
  const yR = scaleLinear().domain([0, maxS]).range([H - PB, PT])
  const lineGen = d3line<{ key: string; sum: number }>()
    .x((d) => (xb(d.key) || 0) + xb.bandwidth() / 2)
    .y((d) => yR(d.sum))
  const path = lineGen(data) || ''

  return (
    <div className="panel">
      <div className="eyebrow"><span className="num">02</span>Когда · сезонность</div>
      <h2>Ритм размещений по месяцам</h2>
      <p className="how">Столбцы — число закупок, янтарь — сумма НМЦК. Клик — фильтр по месяцу.</p>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" onMouseLeave={() => tip.hide()}>
        {yL.ticks(4).map((t) => (
          <line key={t} className="grid-line" x1={PL} x2={W - PR} y1={yL(t)} y2={yL(t)} />
        ))}
        {data.map((d) => {
          const bx = xb(d.key) || 0
          const dim = selected && selected !== d.key
          return (
            <motion.rect
              key={d.key}
              x={bx}
              width={xb.bandwidth()}
              rx={4}
              fill={dim ? '#2E416055' : '#2E4160'}
              style={{ cursor: 'pointer' }}
              initial={{ y: H - PB, height: 0 }}
              animate={{ y: yL(d.count), height: H - PB - yL(d.count) }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              onClick={() => onSelect(d.key)}
              onMouseMove={(e) =>
                tip.show(e.clientX, e.clientY, (
                  <>
                    <div className="h">{monLabel(d.key)}</div>
                    <div className="r"><b>{num(d.count)}</b> лотов</div>
                    <div className="r">сумма <b>{moneyR(d.sum)}</b></div>
                  </>
                ))
              }
            />
          )
        })}
        <motion.path
          d={path}
          fill="none"
          stroke="#F2A93B"
          strokeWidth={2}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
        />
        {data.map((d) => (
          <text key={'l' + d.key} className="axis-txt" x={(xb(d.key) || 0) + xb.bandwidth() / 2} y={H - PB + 15} textAnchor="middle">
            {monLabel(d.key)}
          </text>
        ))}
        {yR.ticks(4).map((t) => (
          <text key={'r' + t} className="axis-txt" x={W - PR + 5} y={yR(t) + 3}>
            {money(t)}
          </text>
        ))}
      </svg>
    </div>
  )
}
