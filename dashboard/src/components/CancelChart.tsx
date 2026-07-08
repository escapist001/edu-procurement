import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { scaleLinear } from 'd3-scale'
import type { Row } from '../lib/types'
import { cancelByMethod } from '../lib/agg'
import { CLR, methodShort, num } from '../lib/format'
import { useTip } from '../lib/tooltip'

const W = 440, H = 250, PL = 130, PR = 20, PT = 8, PB = 26

export function CancelChart({ rows }: { rows: Row[] }) {
  const tip = useTip()
  const data = useMemo(() => cancelByMethod(rows), [rows])
  const maxP = Math.max(5, ...data.map((d) => d.pct))
  const x = scaleLinear().domain([0, maxP]).range([PL, W - PR])
  const bh = data.length ? Math.min(26, (H - PT - PB) / data.length - 6) : 20

  return (
    <div className="panel">
      <div className="eyebrow"><span className="num">02</span>Когда · риск</div>
      <h2>Где заявки сгорают: доля отмен</h2>
      <p className="how">Процент отменённых процедур по способу закупки. Ниже — надёжнее.</p>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" onMouseLeave={() => tip.hide()}>
        {x.ticks(5).map((t) => (
          <g key={t}>
            <line className="grid-line" x1={x(t)} x2={x(t)} y1={PT} y2={H - PB} />
            <text className="axis-txt" x={x(t)} y={H - PB + 14} textAnchor="middle">{t}%</text>
          </g>
        ))}
        {data.map((d, i) => {
          const y = PT + i * ((H - PT - PB) / Math.max(data.length, 1)) + 3
          return (
            <g key={d.m}>
              <text className="axis-txt" x={PL - 8} y={y + bh / 2 + 3} textAnchor="end" fill="var(--muted)" fontSize={11}>
                {methodShort(d.m)}
              </text>
              <motion.rect
                x={PL}
                y={y}
                height={bh}
                rx={4}
                fill={CLR[d.m] || '#E4728F'}
                initial={{ width: 0 }}
                animate={{ width: Math.max(0, x(d.pct) - PL) }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                onMouseMove={(e) =>
                  tip.show(e.clientX, e.clientY, (
                    <>
                      <div className="h">{d.m}</div>
                      <div className="r">отмен <b>{d.pct}%</b></div>
                      <div className="r">{num(d.cancel)} из {num(d.total)} лотов</div>
                    </>
                  ))
                }
              />
            </g>
          )
        })}
      </svg>
    </div>
  )
}
