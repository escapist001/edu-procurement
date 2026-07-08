import type { Row } from '../lib/types'
import { AnimatedNumber } from './AnimatedNumber'
import { median, moneyR, num, pct } from '../lib/format'

export function Kpis({ filtered, market }: { filtered: Row[]; market: Row[] }) {
  const priced = filtered.filter((r) => r.p != null).map((r) => r.p as number)
  const sum = priced.reduce((a, b) => a + b, 0)
  const med = median(priced)
  const marketMed = median(market.filter((r) => r.p != null).map((r) => r.p as number))
  const auc = filtered.length ? (filtered.filter((r) => r.mt.includes('укцион')).length / filtered.length) * 100 : 0

  const byReg: Record<string, number> = {}
  filtered.forEach((r) => {
    if (r.rg && r.p != null) byReg[r.rg] = (byReg[r.rg] || 0) + r.p
  })
  const topReg = Object.entries(byReg).sort((a, b) => b[1] - a[1])[0]

  return (
    <div className="kpis">
      <div className="kpi accent">
        <div className="l">Σ денег выборки</div>
        <div className="n">
          <AnimatedNumber value={sum} format={moneyR} />
        </div>
        <div className="sub">
          <AnimatedNumber value={filtered.length} format={(n) => num(n)} /> лотов
        </div>
      </div>
      <div className="kpi">
        <div className="l">Медиана чека</div>
        <div className="n">
          <AnimatedNumber value={med} format={moneyR} />
        </div>
        <div className="sub">{med > marketMed ? 'выше рынка' : med ? 'на уровне / ниже рынка' : '—'}</div>
      </div>
      <div className="kpi">
        <div className="l">Средний чек</div>
        <div className="n">
          <AnimatedNumber value={priced.length ? sum / priced.length : 0} format={moneyR} />
        </div>
        <div className="sub">sum / лотов с ценой</div>
      </div>
      <div className="kpi">
        <div className="l">Доля аукционов</div>
        <div className="n">
          <AnimatedNumber value={auc} format={(n) => pct(n)} />
        </div>
        <div className="sub">электронные + СМП</div>
      </div>
      <div className="kpi">
        <div className="l">Топ-регион</div>
        <div className="n" style={{ fontSize: 22 }}>
          {topReg ? topReg[0] : '—'}
        </div>
        <div className="sub">{topReg ? moneyR(topReg[1]) : 'нет данных'}</div>
      </div>
    </div>
  )
}
