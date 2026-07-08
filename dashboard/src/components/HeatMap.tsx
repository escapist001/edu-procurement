import { useMemo } from 'react'
import type { Row } from '../lib/types'
import { useStore } from '../store'
import { heatMatrix } from '../lib/agg'
import { METHOD_ORDER, SEGS, methodShort, median, moneyR, segOf } from '../lib/format'
import { useTip } from '../lib/tooltip'

export function HeatMap({ rows }: { rows: Row[] }) {
  const tip = useTip()
  const s = useStore()
  const { counts, max } = useMemo(() => heatMatrix(rows), [rows])

  const click = (m: string, seg: string) => {
    const on = s.method.includes(m) && s.seg.includes(seg)
    if (on) {
      s.toggle('method', m)
      s.toggle('seg', seg)
    } else {
      if (!s.method.includes(m)) s.toggle('method', m)
      if (!s.seg.includes(seg)) s.toggle('seg', seg)
    }
  }

  return (
    <div className="panel">
      <div className="eyebrow"><span className="num">03</span>Как войти · матрица</div>
      <h2>Способ × размер чека</h2>
      <p className="how">Число лотов в ячейке, заливка — интенсивность. Клик — двойной фильтр (способ + сегмент).</p>
      <table className="heat" onMouseLeave={() => tip.hide()}>
        <thead>
          <tr>
            <th className="rowh">способ ↓ / чек →</th>
            {SEGS.map((sg) => (
              <th key={sg.k}>{sg.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {METHOD_ORDER.map((m) => (
            <tr key={m}>
              <th className="rowh" title={m}>{methodShort(m)}</th>
              {SEGS.map((sg) => {
                const v = counts[m][sg.k]
                const t = max ? v / max : 0
                const sel = s.method.includes(m) && s.seg.includes(sg.k)
                return (
                  <td key={sg.k}>
                    <div
                      className={'cell' + (v ? '' : ' zero') + (sel ? ' sel' : '')}
                      style={{ background: v ? `rgba(91,141,239,${0.12 + t * 0.62})` : '#0f1725' }}
                      onClick={v ? () => click(m, sg.k) : undefined}
                      onMouseMove={
                        v
                          ? (e) => {
                              const rs = rows.filter((r) => r.mt === m && segOf(r.p) === sg.k)
                              tip.show(e.clientX, e.clientY, (
                                <>
                                  <div className="h">{m}</div>
                                  <div className="r">{sg.label}: <b>{v}</b> лотов</div>
                                  <div className="r">медиана <b>{moneyR(median(rs.map((r) => r.p as number)))}</b></div>
                                </>
                              ))
                            }
                          : undefined
                      }
                    >
                      {v || '·'}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
