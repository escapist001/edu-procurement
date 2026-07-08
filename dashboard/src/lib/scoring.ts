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
  const bigness = clamp01((med / marketMed) / 2) * 15

  // 3. МАРЖА — реальное снижение цены на торгах (из протоколов ЕИС). Чем сильнее в срезе
  //    рубят цену, тем выше конкуренция и тем меньше остаётся маржи → фактор инверсный.
  //    Порог насыщения — снижение 40% (типичный «жёсткий» аукцион).
  const dropVals = rows.filter((r) => r.dp != null).map((r) => r.dp as number)
  const enoughDrop = dropVals.length >= 5
  const medDrop = enoughDrop ? median(dropVals) : median(market.filter((r) => r.dp != null).map((r) => r.dp as number))
  const margin = clamp01(1 - medDrop / 40) * 25

  // 4. Надёжность — доля отменённых процедур, инверсия.
  const cancels = rows.filter((r) => /отмен/i.test(r.st)).length
  const cancelRate = rows.length ? cancels / rows.length : 0
  const reliability = clamp01(1 - cancelRate * 4) * 15

  // 5. Открытость — доля закупок у единственного поставщика, инверсия (меньше = легче зайти).
  const single = rows.filter((r) => r.mt === 'Ед. поставщик').length
  const singleRate = rows.length ? single / rows.length : 0
  const openness = clamp01(1 - singleRate * 2) * 20

  const factors: Factor[] = [
    { label: 'Ёмкость денег', points: capacity, max: 25, detail: `${pct(capShare * 100, 1)} денег рынка (${moneyR(sum)})` },
    { label: 'Крупность чека', points: bigness, max: 15, detail: `медиана ${moneyR(med)}` },
    { label: 'Маржа (снижение цен)', points: margin, max: 25,
      detail: enoughDrop
        ? `медиана снижения ${pct(medDrop, 1)} по ${dropVals.length} торгам`
        : `мало исходов в срезе — по рынку ${pct(medDrop, 1)}` },
    { label: 'Надёжность', points: reliability, max: 15, detail: `${pct(cancelRate * 100)} процедур отменяют` },
    { label: 'Открытость', points: openness, max: 20, detail: `${pct(singleRate * 100)} у единственного поставщика` },
  ]
  const total = Math.round(factors.reduce((a, f) => a + f.points, 0))

  let verdict: string
  if (rows.length < 15) verdict = 'Мало данных — суждению верить рано.'
  else if (total >= 66) verdict = 'Тёплый рынок: заходить стоит.'
  else if (total >= 45) verdict = 'Смешанно: заходить выборочно, под конкретного заказчика.'
  else verdict = 'Холодно: рынок узкий или цены рубят в ноль.'

  return { total, factors, verdict }
}
