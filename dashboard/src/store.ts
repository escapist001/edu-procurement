import { create } from 'zustand'
import type { Row } from './lib/types'

export interface Filters {
  law: string[]
  method: string[]
  seg: string[]
  region: string | null
  month: string | null
  customer: string | null
  noOutliers: boolean
}

interface Store extends Filters {
  rows: Row[]
  period: [string, string]
  ready: boolean
  setData: (rows: Row[], period: [string, string]) => void
  toggle: (key: 'law' | 'method' | 'seg', v: string) => void
  set: (key: 'region' | 'month' | 'customer', v: string | null) => void
  toggleOutliers: () => void
  reset: () => void
  hydrate: (f: Partial<Filters>) => void
}

const toggleIn = (arr: string[], v: string) =>
  arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]

export const useStore = create<Store>((set) => ({
  rows: [],
  period: ['', ''],
  ready: false,
  law: [],
  method: [],
  seg: [],
  region: null,
  month: null,
  customer: null,
  noOutliers: false,
  setData: (rows, period) => set({ rows, period, ready: true }),
  toggle: (key, v) => set((s) => ({ [key]: toggleIn(s[key], v) }) as Partial<Store>),
  set: (key, v) => set((s) => ({ [key]: s[key] === v ? null : v }) as Partial<Store>),
  toggleOutliers: () => set((s) => ({ noOutliers: !s.noOutliers })),
  reset: () =>
    set({ law: [], method: [], seg: [], region: null, month: null, customer: null, noOutliers: false }),
  hydrate: (f) => set(f as Partial<Store>),
}))

export const hasFilter = (f: Filters) =>
  f.law.length || f.method.length || f.seg.length || f.region || f.month || f.customer || f.noOutliers
