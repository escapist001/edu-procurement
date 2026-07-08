import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import type { Row } from '../lib/types'
import { money, num, pct } from '../lib/format'

type Mode = 'money' | 'ease' | 'white'
const MODES: { k: Mode; label: string; how: string }[] = [
  { k: 'money', label: 'Деньги', how: 'Где в стране больше всего бюджета на учебное оборудование.' },
  { k: 'ease', label: 'Лёгкость входа', how: 'Где меньше закупок у единственного поставщика — честной заявкой зайти проще.' },
  { k: 'white', label: 'Белые пятна', how: 'Деньги есть, а рынок открыт — приоритетные регионы для экспансии.' },
]

interface Reg {
  name: string
  sum: number
  count: number
  openness: number // 1 - доля ед.поставщика
  white: number
}

export function RegionModes({ rows, selected, onSelect }: { rows: Row[]; selected: string | null; onSelect: (r: string) => void }) {
  const [mode, setMode] = useState<Mode>('money')

  const regs = useMemo<Reg[]>(() => {
    const by: Record<string, { sum: number; count: number; single: number }> = {}
    for (const r of rows) {
      if (!r.rg || r.p == null) continue
      ;(by[r.rg] ||= { sum: 0, count: 0, single: 0 })
      by[r.rg].sum += r.p
      by[r.rg].count++
      if (r.mt === 'Ед. поставщик') by[r.rg].single++
    }
    const arr = Object.entries(by).map(([name, o]) => {
      const openness = o.count ? 1 - o.single / o.count : 1
      return { name, sum: o.sum, count: o.count, openness, white: 0 }
    })
    const maxSum = Math.max(1, ...arr.map((r) => r.sum))
    arr.forEach((r) => {
      r.white = (r.sum / maxSum) * r.openness // много денег И открыт
    })
    return arr
  }, [rows])

  const metric = (r: Reg) => (mode === 'money' ? r.sum : mode === 'ease' ? r.openness : r.white)
  const sorted = useMemo(() => [...regs].sort((a, b) => metric(b) - metric(a)).slice(0, 24), [regs, mode])
  const maxM = Math.max(...sorted.map(metric), mode === 'ease' ? 1 : Number.EPSILON)

  const label = (r: Reg) =>
    mode === 'money' ? money(r.sum) + ' ₽' : mode === 'ease' ? pct(r.openness * 100) + ' откр.' : `${num(r.count)} лотов`

  return (
    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div className="eyebrow"><span className="num">01</span>Где · регионы по режимам</div>
          <h2 style={{ marginBottom: 2 }}>Куда расширяться</h2>
        </div>
        <div className="seg">
          {MODES.map((m) => (
            <button key={m.k} className={mode === m.k ? 'on' : ''} onClick={() => setMode(m.k)}>
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <p className="how">{MODES.find((m) => m.k === mode)!.how} Клик — фильтр по региону.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
        {sorted.map((r) => {
          const t = metric(r) / maxM
          const dim = selected && selected !== r.name
          const hue = mode === 'white' ? '242,169,59' : mode === 'ease' ? '70,194,203' : '91,141,239'
          return (
            <motion.button
              key={r.name}
              layout
              onClick={() => onSelect(r.name)}
              initial={false}
              animate={{ opacity: dim ? 0.35 : 1 }}
              transition={{ layout: { duration: 0.5, ease: 'easeInOut' }, opacity: { duration: 0.25 } }}
              style={{
                textAlign: 'left',
                border: `1px solid ${selected === r.name ? 'var(--amber)' : 'var(--line)'}`,
                borderRadius: 8,
                padding: '10px 12px',
                cursor: 'pointer',
                background: `rgba(${hue}, ${0.08 + t * 0.5})`,
                color: 'var(--text)',
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
              <div className="mono" style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{label(r)}</div>
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
