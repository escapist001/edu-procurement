import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { scaleLinear } from 'd3-scale'
import type { Row } from '../lib/types'
import { HLAB, histBins, priced } from '../lib/agg'
import { num } from '../lib/format'
import { useTip } from '../lib/tooltip'

const W = 440, H = 250, PL = 34, PR = 14, PT = 12, PB = 34

export function Histogram({ rows, market, filtered }: { rows: Row[]; market: Row[]; filtered: boolean }) {
  const tip = useTip()
  const bins = useMemo(() => histBins(priced(rows)), [rows])
  const ghost = useMemo(() => (filtered ? histBins(priced(market)) : null), [market, filtered])
  const maxV = Math.max(1, ...bins, ...(ghost || []))
  const bw = (W - PL - PR) / bins.length
  const y = scaleLinear().domain([0, maxV]).range([H - PB, PT])

  return (
    <div className="panel">
      <div className="eyebrow"><span className="num">03</span>Как войти · чеки</div>
      <h2>Распределение чеков</h2>
      <p className="how">Рынок двугорбый: масса мелочи и хвост крупных. {filtered ? 'Контур — весь рынок за выборкой.' : ''}</p>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" onMouseLeave={() => tip.hide()}>
        {y.ticks(4).map((t) => (
          <line key={t} className="grid-line" x1={PL} x2={W - PR} y1={y(t)} y2={y(t)} />
        ))}
        {ghost &&
          ghost.map((v, i) => (
            <rect key={'g' + i} x={PL + i * bw + 3} width={bw - 6} y={y(v)} height={H - PB - y(v)} fill="none" stroke="#33415c" strokeWidth={1} />
          ))}
        {bins.map((v, i) => (
          <motion.rect
            key={i}
            x={PL + i * bw + 3}
            width={bw - 6}
            rx={3}
            fill="#5B8DEF"
            initial={{ y: H - PB, height: 0 }}
            animate={{ y: y(v), height: H - PB - y(v) }}
            transition={{ duration: 0.5, ease: 'easeOut', delay: i * 0.02 }}
            onMouseMove={(e) => tip.show(e.clientX, e.clientY, (<><div className="h">{HLAB[i]}</div><div className="r"><b>{num(v)}</b> лотов</div></>))}
          />
        ))}
        {HLAB.map((l, i) => (
          <text key={l} className="axis-txt" x={PL + i * bw + bw / 2} y={H - PB + 14} textAnchor="middle" fontSize={9}>
            {l}
          </text>
        ))}
      </svg>
    </div>
  )
}
