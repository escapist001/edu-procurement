import type { Row } from '../lib/types'
import { useStore } from '../store'
import { lawLabel, median, methodShort, moneyR, monLabel, num, pct, SEGS } from '../lib/format'

// Одностраничный печатный отчёт «для директора» — rule-based, без LLM.
export function Report({ filtered, market }: { filtered: Row[]; market: Row[] }) {
  const s = useStore()

  const desc: string[] = []
  if (s.law.length) desc.push('закон ' + s.law.map(lawLabel).join(', '))
  if (s.method.length) desc.push('способ ' + s.method.map(methodShort).join(', '))
  if (s.seg.length) desc.push('чек ' + s.seg.map((k) => SEGS.find((x) => x.k === k)?.label).join(', '))
  if (s.region) desc.push('регион ' + s.region)
  if (s.month) desc.push('месяц ' + monLabel(s.month))
  if (s.customer) desc.push('заказчик ' + s.customer)
  const scope = desc.length ? desc.join('; ') : 'весь рынок учебного оборудования'

  const priced = filtered.filter((r) => r.p != null).map((r) => r.p as number)
  const sum = priced.reduce((a, b) => a + b, 0)
  const med = median(priced)
  const marketSum = market.filter((r) => r.p != null).reduce((a, b) => a + (b.p as number), 0) || 1

  const byReg: Record<string, number> = {}
  filtered.forEach((r) => {
    if (r.rg && r.p != null) byReg[r.rg] = (byReg[r.rg] || 0) + (r.p as number)
  })
  const topReg = Object.entries(byReg).sort((a, b) => b[1] - a[1]).slice(0, 5)

  const byMo: Record<string, number> = {}
  filtered.forEach((r) => {
    if (r.mo && r.p != null) byMo[r.mo] = (byMo[r.mo] || 0) + (r.p as number)
  })
  const peak = Object.entries(byMo).sort((a, b) => b[1] - a[1])[0]

  return (
    <>
      <button className="btn-ghost" onClick={() => window.print()}>
        ⎙ Отчёт директору
      </button>

      <div className="print-report" aria-hidden>
        <h1>Радар госзаказа — сводка по рынку</h1>
        <div className="pr-scope">Срез: {scope}</div>

        <div className="pr-kpis">
          <div><b>{num(filtered.length)}</b><span>лотов ({pct((filtered.length / market.length) * 100)} рынка)</span></div>
          <div><b>{moneyR(sum)}</b><span>сумма НМЦК ({pct((sum / marketSum) * 100)} денег)</span></div>
          <div><b>{moneyR(med)}</b><span>медиана чека</span></div>
          <div><b>{peak ? monLabel(peak[0]) : '—'}</b><span>пик размещений</span></div>
        </div>

        <h2>Куда идти в первую очередь</h2>
        <table className="pr-tbl">
          <thead>
            <tr><th>#</th><th>Регион</th><th>Объём НМЦК</th></tr>
          </thead>
          <tbody>
            {topReg.map(([r, v], i) => (
              <tr key={r}>
                <td>{i + 1}</td>
                <td>{r}</td>
                <td>{moneyR(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="pr-foot">
          Источник: ЕИС zakupki.gov.ru, собственный парсер. Выборка ~1000 контрактов, декабрь 2025 — июль 2026. Регион —
          эвристика по названию заказчика.
        </div>
      </div>
    </>
  )
}
