// Скоринг привлекательности текущего среза рынка для поставщика.
// Все факторы — из реально доступных полей ЕИС, каждый вносит понятный вклад.
import type { Row } from './types'
import { median, moneyR, pct } from './format'

export interface Factor {
  label: string
  points: number   // фактический вклад в балл
  max: number      // максимум по фактору
  detail: string
}
export interface Score {
  total: number
  factors: Factor[]
  verdict: string
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

export function scoreSelection(rows: Row[], market: Row[]): Score {
  const priced = rows.filter((r) => r.p != null).map((r) => r.p as number)
  const sum = priced.reduce((a, b) => a + b, 0)
  const marketSum = market.filter((r) => r.p != null).reduce((a, b) => a + (b.p as number), 0) || 1
  const med = median(priced)
  const marketMed = median(market.filter((r) => r.p != null).map((r) => r.p as number)) || 1

  // 1. Ёмкость — сколько денег в срезе (лог-шкала, 30% рынка ≈ максимум).
  const capShare = sum / marketSum
  const capacity = clamp01(Math.log10(1 + capShare * 30) / Math.log10(1 + 0.3 * 30)) * 25

  // 2. Крупность чека — медиана относительно рынка.
  const bigness = clamp01((med / marketMed) / 2) * 20

  // 3. Надёжность — доля отменённых процедур, инверсия.
  const cancels = rows.filter((r) => /отмен/i.test(r.st)).length
  const cancelRate = rows.length ? cancels / rows.length : 0
  const reliability = clamp01(1 - cancelRate * 4) * 20

  // 4. Открытость — доля закупок у единственного поставщика, инверсия (меньше = легче зайти).
  const single = rows.filter((r) => r.mt === 'Ед. поставщик').length
  const singleRate = rows.length ? single / rows.length : 0
  const openness = clamp01(1 - singleRate * 2) * 20

  // 5. Разреженность спроса — не один монопсонист держит деньги.
  const byC: Record<string, number> = {}
  for (const r of rows) if (r.p != null) byC[r.c] = (byC[r.c] || 0) + r.p
  const top5 = Object.values(byC).sort((a, b) => b - a).slice(0, 5).reduce((a, b) => a + b, 0)
  const conc = sum ? top5 / sum : 1
  const diversity = clamp01((1 - conc) / 0.7) * 15

  const factors: Factor[] = [
    { label: 'Ёмкость денег', points: capacity, max: 25, detail: `${pct(capShare * 100, 1)} денег рынка (${moneyR(sum)})` },
    { label: 'Крупность чека', points: bigness, max: 20, detail: `медиана ${moneyR(med)}` },
    { label: 'Надёжность', points: reliability, max: 20, detail: `${pct(cancelRate * 100)} процедур отменяют` },
    { label: 'Открытость', points: openness, max: 20, detail: `${pct(singleRate * 100)} у единственного поставщика` },
    { label: 'Разреженность', points: diversity, max: 15, detail: `топ-5 держат ${pct(conc * 100)} денег` },
  ]
  const total = Math.round(factors.reduce((a, f) => a + f.points, 0))

  let verdict: string
  if (rows.length < 15) verdict = 'Мало данных — суждению верить рано.'
  else if (total >= 66) verdict = 'Тёплый рынок: заходить стоит.'
  else if (total >= 45) verdict = 'Смешанно: заходить выборочно, под конкретного заказчика.'
  else verdict = 'Холодно: рынок узкий или закрытый.'

  return { total, factors, verdict }
}
