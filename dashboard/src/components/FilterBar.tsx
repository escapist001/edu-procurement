import { useMemo } from 'react'
import { useStore } from '../store'
import { filterRows } from '../lib/agg'
import { SEGS, lawLabel, methodShort, METHOD_ORDER, monLabel, moneyR, num } from '../lib/format'

export function FilterBar({ regions }: { regions: string[] }) {
  const s = useStore()
  const filtered = useMemo(() => filterRows(s.rows, s), [s.rows, s.law, s.method, s.seg, s.region, s.month, s.customer, s.noOutliers])
  const sum = filtered.reduce((a, r) => a + (r.p || 0), 0)

  const chips: { key: string; label: string; clear: () => void }[] = []
  s.law.forEach((k) => chips.push({ key: 'law' + k, label: lawLabel(k), clear: () => s.toggle('law', k) }))
  s.method.forEach((k) => chips.push({ key: 'm' + k, label: k, clear: () => s.toggle('method', k) }))
  s.seg.forEach((k) => chips.push({ key: 'seg' + k, label: SEGS.find((x) => x.k === k)!.label, clear: () => s.toggle('seg', k) }))
  if (s.region) chips.push({ key: 'rg', label: 'Регион: ' + s.region, clear: () => s.set('region', null) })
  if (s.month) chips.push({ key: 'mo', label: 'Месяц: ' + monLabel(s.month), clear: () => s.set('month', null) })
  if (s.customer) chips.push({ key: 'c', label: 'Заказчик: ' + s.customer, clear: () => s.set('customer', null) })
  if (s.noOutliers) chips.push({ key: 'out', label: 'без мегалотов', clear: () => s.toggleOutliers() })

  return (
    <div className="filterbar">
      <div className="wrap">
        <div className="fb-in">
          <div className="fb-group">
            <span className="fb-label">Закон</span>
            <div className="seg">
              {(['44', '223'] as const).map((k) => (
                <button key={k} className={s.law.includes(k) ? 'on' : ''} onClick={() => s.toggle('law', k)}>
                  {lawLabel(k)}
                </button>
              ))}
            </div>
          </div>
          <div className="fb-group">
            <span className="fb-label">Способ</span>
            <div className="seg">
              {METHOD_ORDER.map((m) => (
                <button key={m} title={m} className={s.method.includes(m) ? 'on' : ''} onClick={() => s.toggle('method', m)}>
                  {methodShort(m)}
                </button>
              ))}
            </div>
          </div>
          <div className="fb-group">
            <span className="fb-label">Чек</span>
            <div className="seg">
              {SEGS.map((seg) => (
                <button key={seg.k} className={s.seg.includes(seg.k) ? 'on' : ''} onClick={() => s.toggle('seg', seg.k)}>
                  {seg.label}
                </button>
              ))}
            </div>
          </div>
          <div className="fb-group">
            <span className="fb-label">Регион</span>
            <span className="region-in">
              <input
                list="regions"
                placeholder="все регионы"
                value={s.region ?? ''}
                onChange={(e) => {
                  const v = e.target.value.trim()
                  s.set('region', regions.includes(v) ? v : null)
                }}
              />
              <datalist id="regions">
                {regions.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </span>
          </div>
          <div className="fb-group">
            <span className="fb-label">Аномалии</span>
            <div className="seg">
              <button className={s.noOutliers ? 'on' : ''} onClick={s.toggleOutliers}>
                Без мегалотов
              </button>
            </div>
          </div>
          <div className="fb-right">
            <span className="count">
              <b>{num(filtered.length)}</b> из {num(s.rows.length)} · {moneyR(sum)}
            </span>
            <button className="btn-ghost" onClick={s.reset}>
              Сбросить
            </button>
          </div>
        </div>
        {chips.length > 0 && (
          <div className="chips">
            {chips.map((c) => (
              <span className="chip" key={c.key}>
                {c.label}
                <button aria-label="убрать" onClick={c.clear}>
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
