// Фильтрация и агрегации выборки — всё считается на клиенте.
import type { Row } from './types'
import type { Filters } from '../store'
import { segOf, median, MEGA, METHOD_ORDER, SEGS } from './format'

export function passes(r: Row, f: Filters): boolean {
  if (f.law.length && !f.law.includes(r.law)) return false
  if (f.method.length && !f.method.includes(r.mt)) return false
  if (f.seg.length) {
    const s = segOf(r.p)
    if (!s || !f.seg.includes(s)) return false
  }
  if (f.region && r.rg !== f.region) return false
  if (f.month && r.mo !== f.month) return false
  if (f.customer && r.c !== f.customer) return false
  if (f.noOutliers && r.p != null && r.p >= MEGA) return false
  return true
}
export const filterRows = (rows: Row[], f: Filters) => rows.filter((r) => passes(r, f))

// Применить все фильтры, КРОМЕ указанных — чтобы на графике элемент можно было
// подсветить среди «соседей», а не оставить один себя.
export function filterExcept(rows: Row[], f: Filters, except: (keyof Filters)[]): Row[] {
  const f2 = { ...f, law: [...f.law], method: [...f.method], seg: [...f.seg] }
  for (const k of except) {
    if (Array.isArray(f2[k])) (f2 as Record<string, unknown>)[k] = []
    else if (k === 'noOutliers') f2.noOutliers = false
    else (f2 as Record<string, unknown>)[k] = null
  }
  return rows.filter((r) => passes(r, f2))
}
export const priced = (rows: Row[]) => rows.filter((r) => r.p != null).map((r) => r.p as number)

// Регионы: объём, медиана чека, число лотов, доминирующий способ.
export interface RegionPoint {
  name: string
  sum: number
  med: number
  count: number
  dom: string
}
export function regionAgg(rows: Row[]): RegionPoint[] {
  const by: Record<string, { sum: number; prices: number[]; meth: Record<string, number> }> = {}
  for (const r of rows) {
    if (!r.rg || r.p == null) continue
    ;(by[r.rg] ||= { sum: 0, prices: [], meth: {} })
    by[r.rg].sum += r.p
    by[r.rg].prices.push(r.p)
    by[r.rg].meth[r.mt] = (by[r.rg].meth[r.mt] || 0) + 1
  }
  return Object.entries(by).map(([name, o]) => ({
    name,
    sum: o.sum,
    med: median(o.prices),
    count: o.prices.length,
    dom: Object.entries(o.meth).sort((a, b) => b[1] - a[1])[0][0],
  }))
}

export function monthAgg(rows: Row[]): { key: string; count: number; sum: number }[] {
  const by: Record<string, { count: number; sum: number }> = {}
  for (const r of rows) {
    if (!r.mo) continue
    ;(by[r.mo] ||= { count: 0, sum: 0 })
    by[r.mo].count++
    if (r.p != null) by[r.mo].sum += r.p
  }
  return Object.keys(by)
    .sort()
    .map((key) => ({ key, ...by[key] }))
}

export function cancelByMethod(rows: Row[]): { m: string; pct: number; cancel: number; total: number }[] {
  const by: Record<string, { t: number; c: number }> = {}
  for (const r of rows) {
    ;(by[r.mt] ||= { t: 0, c: 0 })
    by[r.mt].t++
    if (/отмен/i.test(r.st)) by[r.mt].c++
  }
  return Object.entries(by)
    .filter(([, o]) => o.t >= 5)
    .map(([m, o]) => ({ m, pct: Math.round((o.c / o.t) * 100), cancel: o.c, total: o.t }))
    .sort((a, b) => b.pct - a.pct)
}

export const HBINS: [number, number][] = [
  [0, 1e5], [1e5, 3e5], [3e5, 6e5], [6e5, 1e6],
  [1e6, 3e6], [3e6, 1e7], [1e7, 3e7], [3e7, Infinity],
]
export const HLAB = ['<100т', '100–300т', '300–600т', '0,6–1М', '1–3М', '3–10М', '10–30М', '30М+']
export function histBins(prices: number[]): number[] {
  const b = HBINS.map(() => 0)
  for (const p of prices)
    for (let i = 0; i < HBINS.length; i++)
      if (p >= HBINS[i][0] && p < HBINS[i][1]) {
        b[i]++
        break
      }
  return b
}

export function paretoAgg(rows: Row[]): { c: string; sum: number; n: number }[] {
  const by: Record<string, { sum: number; n: number }> = {}
  for (const r of rows) {
    if (r.p == null) continue
    ;(by[r.c] ||= { sum: 0, n: 0 })
    by[r.c].sum += r.p
    by[r.c].n++
  }
  return Object.entries(by)
    .map(([c, o]) => ({ c, sum: o.sum, n: o.n }))
    .sort((a, b) => b.sum - a.sum)
}

// Матрица способ × ценовой сегмент.
export function heatMatrix(rows: Row[]): { counts: Record<string, Record<string, number>>; max: number } {
  const counts: Record<string, Record<string, number>> = {}
  let max = 0
  for (const m of METHOD_ORDER) {
    counts[m] = {}
    for (const s of SEGS) counts[m][s.k] = 0
  }
  for (const r of rows) {
    const sg = segOf(r.p)
    if (counts[r.mt] && sg) {
      counts[r.mt][sg]++
      max = Math.max(max, counts[r.mt][sg])
    }
  }
  return { counts, max }
}
