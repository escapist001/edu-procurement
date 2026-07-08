import { useEffect, useMemo, useState } from 'react'
import { useStore } from './store'
import type { Filters } from './store'
import type { RowsFile } from './lib/types'
import { filterRows, filterExcept } from './lib/agg'
import { lawLabel } from './lib/format'
import { TipLayer } from './lib/tooltip'
import { Header } from './components/Header'
import { FilterBar } from './components/FilterBar'
import { Kpis } from './components/Kpis'
import { Insights } from './components/Insights'
import { Scoring } from './components/Scoring'
import { WhatIf } from './components/WhatIf'
import { ChoroplethMap } from './components/ChoroplethMap'
import { SeasonChart } from './components/SeasonChart'
import { CancelChart } from './components/CancelChart'
import { HeatMap } from './components/HeatMap'
import { Histogram } from './components/Histogram'
import { Pareto } from './components/Pareto'
import { Dossier } from './components/Dossier'
import { Scenarios } from './components/Scenarios'
import { Report } from './components/Report'

function parseHash(): Partial<Filters> | null {
  const h = location.hash.replace(/^#/, '')
  if (!h) return null
  const p = new URLSearchParams(h)
  const arr = (k: string) => (p.get(k) || '').split(',').filter(Boolean)
  return {
    law: arr('law'),
    method: arr('m'),
    seg: arr('seg'),
    region: p.get('reg') || null,
    month: p.get('mo') || null,
    customer: p.get('c') || null,
    noOutliers: p.get('out') === '1',
  }
}
function writeHash(f: Filters) {
  const p = new URLSearchParams()
  if (f.law.length) p.set('law', f.law.join(','))
  if (f.method.length) p.set('m', f.method.join(','))
  if (f.seg.length) p.set('seg', f.seg.join(','))
  if (f.region) p.set('reg', f.region)
  if (f.month) p.set('mo', f.month)
  if (f.customer) p.set('c', f.customer)
  if (f.noOutliers) p.set('out', '1')
  const s = p.toString()
  history.replaceState(null, '', s ? '#' + s : location.pathname + location.search)
}

export default function App() {
  const s = useStore()
  const [meta, setMeta] = useState<{ source: string; period: [string, string] } | null>(null)

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}rows.json`)
      .then((r) => r.json())
      .then((d: RowsFile) => {
        useStore.getState().setData(d.rows, d.generated_period)
        setMeta({ source: d.source, period: d.generated_period })
        const f = parseHash()
        if (f) useStore.getState().hydrate(f)
      })
      .catch((e) => console.error('rows.json load failed', e))
    const unsub = useStore.subscribe((st) => writeHash(st))
    return unsub
  }, [])

  const filters: Filters = { law: s.law, method: s.method, seg: s.seg, region: s.region, month: s.month, customer: s.customer, noOutliers: s.noOutliers }
  const filtered = useMemo(() => filterRows(s.rows, filters), [s.rows, s.law, s.method, s.seg, s.region, s.month, s.customer, s.noOutliers])
  const regionRows = useMemo(() => filterExcept(s.rows, filters, ['region']), [s.rows, s.law, s.method, s.seg, s.month, s.customer, s.noOutliers])
  const monthRows = useMemo(() => filterExcept(s.rows, filters, ['month']), [s.rows, s.law, s.method, s.seg, s.region, s.customer, s.noOutliers])
  const regions = useMemo(
    () => ([...new Set(s.rows.map((r) => r.rg).filter(Boolean))] as string[]).sort((a, b) => a.localeCompare(b, 'ru')),
    [s.rows],
  )
  const numbers = useMemo(() => s.rows.map((r) => r.n), [s.rows])
  const totals = useMemo(() => ({
    sum: s.rows.reduce((a, r) => a + (r.p ?? 0), 0),
    withOutcome: s.rows.filter((r) => r.dp != null).length,
  }), [s.rows])
  const anyFilter = !!(s.law.length || s.method.length || s.seg.length || s.region || s.month || s.customer || s.noOutliers)

  function exportCSV() {
    const head = ['number', 'law', 'method', 'price_rub', 'region', 'month', 'stage', 'customer']
    const esc = (v: unknown) => {
      const t = v == null ? '' : String(v)
      return /[",;\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t
    }
    const lines = [head.join(';')].concat(
      filtered.map((r) => [r.n, lawLabel(r.law), r.mt, r.p ?? '', r.rg ?? '', r.mo ?? '', r.st, r.c].map(esc).join(';')),
    )
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `goszakaz_${filtered.length}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  if (!s.ready) {
    return <div style={{ padding: 60, color: '#94A3BF', fontFamily: 'JetBrains Mono, monospace' }}>Загрузка данных…</div>
  }

  return (
    <>
      <Header source={meta?.source ?? ''} period={meta?.period ?? ['', '']} numbers={numbers}
              records={s.rows.length} totalSum={totals.sum} withOutcome={totals.withOutcome} />
      <FilterBar regions={regions} />
      <div className="wrap">
        <Kpis filtered={filtered} market={s.rows} />
        <Scenarios />
        <div className="layout">
          <div className="col-main">
            <Dossier all={s.rows} />
            <ChoroplethMap rows={regionRows} selected={s.region} onSelect={(r) => s.set('region', r)} />
            <Scoring filtered={filtered} market={s.rows} />
            <WhatIf filtered={filtered} />
            <div className="grid2">
              <SeasonChart rows={monthRows} selected={s.month} onSelect={(m) => s.set('month', m)} />
              <CancelChart rows={filtered} />
            </div>
            <div className="grid2">
              <HeatMap rows={filtered} />
              <Histogram rows={filtered} market={s.rows} filtered={anyFilter} />
            </div>
            <Pareto rows={filtered} />
          </div>
          <Insights filtered={filtered} market={s.rows} />
        </div>

        <footer>
          <div>
            <b style={{ color: 'var(--muted)' }}>Данные.</b> 10 022 закупки учебного оборудования из ЕИС
            (44-ФЗ + 223-ФЗ), период с 2024 года. Собраны оконным обходом расширенного поиска. Регион заказчика —
            из структурных кодов (адрес и ИНН по справочнику ФНС), а не по названию. <b style={{ color: 'var(--muted)' }}>Снижение
            цены</b> — реальный исход торгов: НМЦК против предложения победителя из протоколов подведения итогов
            (получено для завершённых процедур 44-ФЗ). Ценовые сегменты — по порогам 44-ФЗ.
          </div>
          <div style={{ marginTop: 8 }}>
            Стек: конвейер на Python (сбор, чистый регион, реальные снижения) → <code>rows.json</code>; дашборд —
            Vite + React + TypeScript, собственные SVG-графики и полигональная карта на своей проекции, Framer Motion.
            Все срезы считаются в браузере.
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <button className="btn-ghost" onClick={exportCSV}>
              ⭳ Экспорт выборки в CSV
            </button>
            <Report filtered={filtered} market={s.rows} />
          </div>
        </footer>
      </div>
      <TipLayer />
    </>
  )
}
