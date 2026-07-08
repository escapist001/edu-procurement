import type { ReactNode } from 'react'
import { create } from 'zustand'

interface TipState {
  node: ReactNode
  x: number
  y: number
  open: boolean
  show: (x: number, y: number, node: ReactNode) => void
  hide: () => void
}
export const useTip = create<TipState>((set) => ({
  node: null,
  x: 0,
  y: 0,
  open: false,
  show: (x, y, node) => set({ x, y, node, open: true }),
  hide: () => set({ open: false }),
}))

export function TipLayer() {
  const { node, x, y, open } = useTip()
  if (!open) return null
  const style: React.CSSProperties = {
    left: Math.min(x + 14, window.innerWidth - 260),
    top: Math.max(8, y - 12),
    transform: 'translateY(-100%)',
  }
  return (
    <div className="tip" style={style}>
      {node}
    </div>
  )
}
