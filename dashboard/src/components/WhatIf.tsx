import { useMemo, useState } from 'react'
import type { Row } from '../lib/types'
import { median, moneyR, num } from '../lib/format'
import { AnimatedNumber } from './AnimatedNumber'

export function WhatIf({ filtered }: { filtered: Row[] }) {
  const [winRate, setWinRate] = useState(25)
  const [capacity, setCapacity] = useState(10)

  const stats = useMemo(() => {
    const months = new Set(filtered.map((r) => r.mo).filter(Boolean)).size || 1
    const lotsPerMonth = filtered.length / months
    const med = median(filtered.filter((r) => r.p != null).map((r) => r.p as number))
    return { lotsPerMonth, med }
  }, [filtered])

  const biddable = Math.min(stats.lotsPerMonth, capacity)
  const won = biddable * (winRate / 100)
  const revenue = won * stats.med
  const load = capacity ? Math.min(1, stats.lotsPerMonth / capacity) : 0

  return (
    <div className="panel">
      <div className="eyebrow">
        <span className="num">↯</span>Симулятор · сколько возьму
      </div>
      <h2>What-if: план захода в сегмент</h2>
      <p className="how">
        Двигай ползунки под свою команду — прикидка по среднему потоку лотов и медиане чека текущего среза. Win-rate
        задаёшь сам.
      </p>

      <div style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: '1fr 1fr' }}>
          <Slider label="Ожидаемый win-rate" value={winRate} min={5} max={70} step={5} suffix="%" onChange={setWinRate} />
          <Slider label="Тендеров в месяц (моя команда)" value={capacity} min={1} max={40} step={1} suffix=" шт" onChange={setCapacity} />
        </div>

        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <Out label="Доступно лотов/мес" value={stats.lotsPerMonth} fmt={(n) => num(Math.round(n))} />
          <Out label="Выиграю ~/мес" value={won} fmt={(n) => n.toFixed(1).replace('.', ',')} accent />
          <Out label="Выручка/мес" value={revenue} fmt={moneyR} accent />
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', marginBottom: 5 }}>
            <span>Загрузка команды потоком сегмента</span>
            <span className="mono">{Math.round(load * 100)}%</span>
          </div>
          <div style={{ height: 9, background: 'var(--surface-2)', borderRadius: 5, overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${load * 100}%`,
                background: load > 0.9 ? '#E4728F' : 'var(--amber)',
                borderRadius: 5,
                transition: 'width .4s ease',
              }}
            />
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--dim)', marginTop: 6 }}>
            {load > 0.9
              ? 'Поток сегмента больше вашей ёмкости — есть куда расти или нужен ещё менеджер.'
              : 'Ёмкость команды покрывает поток сегмента с запасом.'}
          </div>
        </div>
      </div>
    </div>
  )
}

function Slider({
  label, value, min, max, step, suffix, onChange,
}: { label: string; value: number; min: number; max: number; step: number; suffix: string; onChange: (v: number) => void }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 6 }}>
        <span style={{ color: 'var(--muted)' }}>{label}</span>
        <span className="mono" style={{ color: 'var(--amber)', fontWeight: 700 }}>
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        style={{ width: '100%', accentColor: '#F2A93B' }}
      />
    </label>
  )
}

function Out({ label, value, fmt, accent }: { label: string; value: number; fmt: (n: number) => string; accent?: boolean }) {
  return (
    <div style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 8, padding: '12px 14px' }}>
      <div className="mono" style={{ fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--dim)' }}>
        {label}
      </div>
      <div className="mono" style={{ fontSize: 21, fontWeight: 700, marginTop: 7, color: accent ? 'var(--amber)' : 'var(--text)' }}>
        <AnimatedNumber value={value} format={fmt} />
      </div>
    </div>
  )
}
