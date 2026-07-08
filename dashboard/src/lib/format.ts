// Форматтеры, шкалы-константы и палитра. Русская типографика чисел.

export const NBSP = ' '

export function money(n: number): string {
  n = n || 0
  const a = Math.abs(n)
  if (a >= 1e9) return (n / 1e9).toFixed(2).replace('.', ',') + NBSP + 'млрд'
  if (a >= 1e6) return (n / 1e6).toFixed(1).replace('.', ',') + NBSP + 'млн'
  if (a >= 1e3) return Math.round(n / 1e3) + NBSP + 'тыс'
  return String(Math.round(n))
}
export const moneyR = (n: number) => money(n) + NBSP + '₽'
export const num = (n: number) => Math.round(n).toLocaleString('ru-RU').replace(/\s/g, NBSP)
export const pct = (x: number, digits = 0) => x.toFixed(digits).replace('.', ',') + '%'

export function median(arr: number[]): number {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
export function quantile(sortedAsc: number[], q: number): number {
  if (!sortedAsc.length) return 0
  const pos = (sortedAsc.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return sortedAsc[lo]
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (pos - lo)
}
export const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0)

const MON = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
export function monLabel(ym: string | null): string {
  if (!ym) return '—'
  const [y, m] = ym.split('-')
  return MON[+m - 1] + " '" + y.slice(2)
}
export const lawLabel = (l: string) => (l === '44' ? '44-ФЗ' : '223-ФЗ')

// Ценовые сегменты — по порогам 44-ФЗ, а не произвольные бины.
export const SEGS = [
  { k: 's0', label: 'до 600 тыс', lo: 0, hi: 6e5 },
  { k: 's1', label: '0,6–3 млн', lo: 6e5, hi: 3e6 },
  { k: 's2', label: '3–20 млн', lo: 3e6, hi: 2e7 },
  { k: 's3', label: '20 млн+', lo: 2e7, hi: Infinity },
] as const
export function segOf(p: number | null): string | null {
  if (p == null) return null
  for (const s of SEGS) if (p >= s.lo && p < s.hi) return s.k
  return null
}

export const MEGA = 1e8 // «мегалот» ≥ 100 млн ₽ — статистическая аномалия

// Палитра способов закупки.
export const CLR: Record<string, string> = {
  'Электронный аукцион': '#5B8DEF',
  'Аукцион (СМП)': '#9B8AFB',
  'Запрос котировок': '#46C2CB',
  'Котировки (СМП)': '#7DD3D8',
  'Ед. поставщик': '#E4728F',
  'Иной способ': '#64748B',
}
export const METHOD_ORDER = Object.keys(CLR)
export const methodShort = (m: string) => m.replace('Электронный ', '').replace('Запрос ', '')
