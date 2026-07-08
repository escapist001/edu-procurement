import { useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Row } from '../lib/types'
import { useStore } from '../store'
import { CLR, SEGS, median, methodShort, money, moneyR, monLabel, num, pct, segOf } from '../lib/format'

export function Dossier({ all }: { all: Row[] }) {
  const customer = useStore((s) => s.customer)
  const close = useStore((s) => s.set)

  const d = useMemo(() => {
    if (!customer) return null
    const rows = all.filter((r) => r.c === customer)
    const priced = rows.filter((r) => r.p != null).map((r) => r.p as number)
    const sum = priced.reduce((a, b) => a + b, 0)
    const methods: Record<string, number> = {}
    const segs: Record<string, number> = {}
    const months: Record<string, number> = {}
    let single = 0
    for (const r of rows) {
      methods[r.mt] = (methods[r.mt] || 0) + 1
      const sg = segOf(r.p)
      if (sg) segs[sg] = (segs[sg] || 0) + 1
      if (r.mo) months[r.mo] = (months[r.mo] || 0) + 1
      if (r.mt === 'Ед. поставщик') single++
    }
    const region = rows.find((r) => r.rg)?.rg || '—'
    const singleRate = rows.length ? single / rows.length : 0
    const topMethod = Object.entries(methods).sort((a, b) => b[1] - a[1])[0]?.[0] || '—'
    const peakMonth = Object.entries(months).sort((a, b) => b[1] - a[1])[0]?.[0] || null
    return {
      rows,
      count: rows.length,
      sum,
      med: median(priced),
      methods,
      segs,
      region,
      singleRate,
      topMethod,
      peakMonth,
    }
  }, [customer, all])

  return (
    <AnimatePresence>
      {customer && d && (
        <motion.div
          className="panel"
          style={{ borderColor: 'rgba(242,169,59,.4)' }}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div>
              <div className="eyebrow"><span className="num">◎</span>Досье заказчика</div>
              <h2 style={{ marginBottom: 2 }}>{customer}</h2>
              <p className="how" style={{ marginBottom: 0 }}>
                {d.region} · всего {num(d.count)} закупок на {moneyR(d.sum)} в выборке
              </p>
            </div>
            <button className="btn-ghost" onClick={() => close('customer', null)}>
              Закрыть ×
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginTop: 16 }}>
            <Stat label="Медиана чека" value={moneyR(d.med)} />
            <Stat label="Средний чек" value={d.count ? moneyR(d.sum / Math.max(1, d.rows.filter((r) => r.p != null).length)) : '—'} />
            <Stat label="Любимая процедура" value={methodShort(d.topMethod)} small />
            <Stat
              label="Открытость входа"
              value={d.singleRate > 0.5 ? 'закрыт' : d.singleRate > 0.2 ? 'средне' : 'открыт'}
              accent={d.singleRate <= 0.2}
              hint={`${pct(d.singleRate * 100)} у ед. поставщика`}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 18 }}>
            <MiniBars title="Способы закупки" data={d.methods} labelFn={methodShort} colorFn={(k) => CLR[k] || '#64748B'} />
            <MiniBars
              title="Ценовые сегменты"
              data={d.segs}
              labelFn={(k) => SEGS.find((s) => s.k === k)?.label || k}
              colorFn={() => '#5B8DEF'}
            />
          </div>

          <div style={{ marginTop: 16, fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
            <b style={{ color: 'var(--text)' }}>Как заходить: </b>
            {d.singleRate > 0.5
              ? 'заказчик часто берёт у единственного поставщика — зайти сложно, нужен прямой контакт и включение в его пул.'
              : `основная дверь — ${methodShort(d.topMethod).toLowerCase()}, медиана чека ${money(d.med)} ₽`}
            {d.peakMonth ? `; активнее всего размещает в ${monLabel(d.peakMonth)}.` : '.'}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Stat({ label, value, small, accent, hint }: { label: string; value: string; small?: boolean; accent?: boolean; hint?: string }) {
  return (
    <div style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 8, padding: '11px 13px' }}>
      <div className="mono" style={{ fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--dim)' }}>{label}</div>
      <div className={small ? '' : 'mono'} style={{ fontSize: small ? 14 : 18, fontWeight: 700, marginTop: 6, color: accent ? 'var(--good)' : 'var(--text)' }}>
        {value}
      </div>
      {hint && <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 3 }}>{hint}</div>}
    </div>
  )
}

function MiniBars({ title, data, labelFn, colorFn }: { title: string; data: Record<string, number>; labelFn: (k: string) => string; colorFn: (k: string) => string }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1])
  const max = Math.max(1, ...entries.map((e) => e[1]))
  return (
    <div>
      <div className="mono" style={{ fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 8 }}>{title}</div>
      {entries.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 12 }}>
          <span style={{ width: 118, flex: '0 0 auto', color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{labelFn(k)}</span>
          <div style={{ flex: 1, height: 8, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden' }}>
            <motion.div style={{ height: '100%', background: colorFn(k), borderRadius: 4 }} initial={{ width: 0 }} animate={{ width: `${(v / max) * 100}%` }} transition={{ duration: 0.5 }} />
          </div>
          <span className="mono" style={{ width: 24, textAlign: 'right', color: 'var(--muted)' }}>{v}</span>
        </div>
      ))}
    </div>
  )
}
