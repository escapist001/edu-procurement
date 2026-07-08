import { useMemo } from 'react'
import { motion } from 'framer-motion'
import type { Row } from '../lib/types'
import { scoreSelection } from '../lib/scoring'
import { AnimatedNumber } from './AnimatedNumber'

const R = 66
const CIRC = 2 * Math.PI * R

function scoreColor(t: number) {
  if (t >= 66) return '#46C2CB'
  if (t >= 45) return '#F2A93B'
  return '#E4728F'
}

export function Scoring({ filtered, market }: { filtered: Row[]; market: Row[] }) {
  const score = useMemo(() => scoreSelection(filtered, market), [filtered, market])
  const col = scoreColor(score.total)
  const dash = (score.total / 100) * CIRC

  return (
    <div className="panel">
      <div className="eyebrow">
        <span className="num">★</span>Скоринг · стоит ли заходить
      </div>
      <h2>Оценка текущего среза</h2>
      <p className="how">Композитный балл привлекательности из пяти факторов. Каждый — из реальных полей ЕИС.</p>

      <div style={{ display: 'flex', gap: 26, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', width: 160, height: 160, flex: '0 0 auto' }}>
          <svg width={160} height={160} viewBox="0 0 160 160">
            <circle cx={80} cy={80} r={R} fill="none" stroke="#1B2536" strokeWidth={12} />
            <motion.circle
              cx={80}
              cy={80}
              r={R}
              fill="none"
              stroke={col}
              strokeWidth={12}
              strokeLinecap="round"
              transform="rotate(-90 80 80)"
              strokeDasharray={CIRC}
              initial={false}
              animate={{ strokeDashoffset: CIRC - dash }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
            <div>
              <div className="mono" style={{ fontSize: 40, fontWeight: 700, color: col, lineHeight: 1 }}>
                <AnimatedNumber value={score.total} format={(n) => String(Math.round(n))} />
              </div>
              <div className="mono" style={{ fontSize: 11, color: 'var(--dim)' }}>из 100</div>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontWeight: 600, marginBottom: 12, color: col }}>{score.verdict}</div>
          {score.factors.map((f) => (
            <div key={f.label} style={{ marginBottom: 11 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                <span>
                  {f.label} <span style={{ color: 'var(--dim)' }}>· {f.detail}</span>
                </span>
                <span className="mono" style={{ color: 'var(--muted)' }}>
                  {Math.round(f.points)}/{f.max}
                </span>
              </div>
              <div style={{ height: 7, background: 'var(--surface-2)', borderRadius: 5, overflow: 'hidden' }}>
                <motion.div
                  style={{ height: '100%', background: col, borderRadius: 5 }}
                  initial={{ width: 0 }}
                  animate={{ width: `${(f.points / f.max) * 100}%` }}
                  transition={{ duration: 0.7, ease: 'easeOut' }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
