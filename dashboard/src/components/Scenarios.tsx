import { useEffect, useState } from 'react'
import type { Filters } from '../store'
import { useStore } from '../store'
import { num, moneyR } from '../lib/format'
import { filterRows } from '../lib/agg'

interface Scenario {
  name: string
  f: Filters
  snap: { count: number; sum: number }
}
const KEY = 'radar_scenarios'
const load = (): Scenario[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]')
  } catch {
    return []
  }
}

export function Scenarios() {
  const s = useStore()
  const [list, setList] = useState<Scenario[]>([])
  useEffect(() => setList(load()), [])

  const save = () => {
    const f: Filters = { law: s.law, method: s.method, seg: s.seg, region: s.region, month: s.month, customer: s.customer, noOutliers: s.noOutliers }
    const rows = filterRows(s.rows, f)
    const name = window.prompt('Название сценария:', s.region || s.customer || 'Мой рынок')
    if (!name) return
    const snap = { count: rows.length, sum: rows.reduce((a, r) => a + (r.p || 0), 0) }
    const next = [...load().filter((x) => x.name !== name), { name, f, snap }]
    localStorage.setItem(KEY, JSON.stringify(next))
    setList(next)
  }
  const restore = (sc: Scenario) => s.hydrate(sc.f)
  const remove = (name: string) => {
    const next = load().filter((x) => x.name !== name)
    localStorage.setItem(KEY, JSON.stringify(next))
    setList(next)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '2px 0 -4px' }}>
      <span className="mono" style={{ fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--dim)' }}>
        Сценарии
      </span>
      <button className="btn-ghost" onClick={save}>
        + Сохранить срез
      </button>
      {list.map((sc) => {
        const now = filterRows(s.rows, sc.f)
        const nowCount = now.length
        const diff = nowCount - sc.snap.count
        return (
          <span
            key={sc.name}
            className="chip"
            style={{ background: 'var(--surface)', color: 'var(--text)', borderColor: 'var(--line)', cursor: 'pointer' }}
            title={`было ${num(sc.snap.count)} лотов на ${moneyR(sc.snap.sum)}`}
            onClick={() => restore(sc)}
          >
            {sc.name}
            {diff !== 0 && (
              <span style={{ color: diff > 0 ? 'var(--good)' : 'var(--bad)', fontWeight: 700 }}>
                {diff > 0 ? '+' : ''}
                {diff}
              </span>
            )}
            <button
              aria-label="удалить"
              onClick={(e) => {
                e.stopPropagation()
                remove(sc.name)
              }}
            >
              ×
            </button>
          </span>
        )
      })}
    </div>
  )
}
