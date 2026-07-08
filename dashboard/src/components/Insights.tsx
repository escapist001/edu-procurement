import type { Row } from '../lib/types'
import { useStore } from '../store'
import { median, moneyR, monLabel, pct, MEGA, num } from '../lib/format'

interface Ins {
  warn?: boolean
  node: React.ReactNode
}

export function Insights({ filtered, market }: { filtered: Row[]; market: Row[] }) {
  const noOutliers = useStore((s) => s.noOutliers)
  const out: Ins[] = []

  const priced = filtered.filter((r) => r.p != null).map((r) => r.p as number)
  const sum = priced.reduce((a, b) => a + b, 0)
  const med = median(priced)
  const marketPriced = market.filter((r) => r.p != null).map((r) => r.p as number)
  const marketSum = marketPriced.reduce((a, b) => a + b, 0) || 1
  const marketMed = median(marketPriced) || 1
  const shareMoney = Math.round((sum / marketSum) * 100)
  const shareCount = Math.round((filtered.length / market.length) * 100)

  // Предупреждение о мегалотах.
  const megas = market.filter((r) => r.p != null && (r.p as number) >= MEGA)
  if (!noOutliers && megas.length) {
    const megaSum = megas.reduce((a, b) => a + (b.p as number), 0)
    out.push({
      warn: true,
      node: (
        <>
          <b>{num(megas.length)}</b> {megas.length === 1 ? 'мегалот' : 'мегалота'} (≥ 100 млн ₽) держат{' '}
          <b>{pct((megaSum / marketSum) * 100)}</b> денег при {pct((megas.length / market.length) * 100, 1)} лотов —
          сильно тянут средние. Кнопка «Без мегалотов» нормализует картину.
        </>
      ),
    })
  }

  if (filtered.length < 20) {
    out.push({ warn: true, node: <>Выборка мала — <b>{num(filtered.length)}</b> лотов. Выводы статистически ненадёжны.</> })
  } else {
    out.push({
      node: (
        <>
          В выборке <b>{num(filtered.length)}</b> лотов на <b className="mono">{moneyR(sum)}</b> — это <b>{shareMoney}%</b>{' '}
          рынка по деньгам при <b>{shareCount}%</b> по количеству.
        </>
      ),
    })
    const dp = Math.round((med / marketMed - 1) * 100)
    out.push({
      node: (
        <>
          Медиана чека здесь <b className="mono">{moneyR(med)}</b> — на <b>{dp >= 0 ? '+' : ''}{dp}%</b>{' '}
          {dp >= 0 ? 'выше' : 'ниже'} рынка ({moneyR(marketMed)}).
        </>
      ),
    })
    // Самая доступная дверь.
    const byM: Record<string, Row[]> = {}
    filtered.forEach((r) => (byM[r.mt] ||= []).push(r))
    let bestM = ''
    let bestSmall = -1
    Object.entries(byM).forEach(([m, rs]) => {
      const small = rs.filter((r) => r.p != null && (r.p as number) < 6e5).length / rs.length
      if (rs.length >= 8 && small > bestSmall) {
        bestSmall = small
        bestM = m
      }
    })
    if (bestM)
      out.push({
        node: (
          <>
            Самая доступная дверь: <b>{bestM}</b> — <b>{Math.round(bestSmall * 100)}%</b> лотов до 600 тыс. ₽.
          </>
        ),
      })
    // Пик размещений.
    const byMo: Record<string, number> = {}
    filtered.forEach((r) => {
      if (r.mo && r.p != null) byMo[r.mo] = (byMo[r.mo] || 0) + (r.p as number)
    })
    const peak = Object.entries(byMo).sort((a, b) => b[1] - a[1])[0]
    if (peak)
      out.push({
        node: (
          <>
            Пик размещений — <b>{monLabel(peak[0])}</b> (<b>{Math.round((peak[1] / (sum || 1)) * 100)}%</b> денег). Заявку
            готовить за 3–4 недели до.
          </>
        ),
      })
    // Концентрация.
    const byC: Record<string, number> = {}
    filtered.forEach((r) => {
      if (r.p != null) byC[r.c] = (byC[r.c] || 0) + (r.p as number)
    })
    const top5 = Object.values(byC).sort((a, b) => b - a).slice(0, 5).reduce((a, b) => a + b, 0)
    const conc = sum ? Math.round((top5 / sum) * 100) : 0
    out.push({
      warn: conc > 40,
      node: (
        <>
          Топ-5 заказчиков держат <b>{conc}%</b> денег
          {conc > 40 ? ' — рынок узкий, продажи решают связи с конкретными организациями.' : '.'}
        </>
      ),
    })
  }

  return (
    <aside className="insights">
      <h3>Выводы · пересчёт под фильтр</h3>
      {out.map((i, k) => (
        <div className={'ins' + (i.warn ? ' warn' : '')} key={k}>
          <span className="mk" />
          <div>{i.node}</div>
        </div>
      ))}
    </aside>
  )
}
