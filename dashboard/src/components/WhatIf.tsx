import { useMemo, useState } from 'react'
import type { Row } from '../lib/types'
import { median, moneyR, num } from '../lib/format'
import { AnimatedNumber } from './AnimatedNumber'

// Прикидка: во что превратится заход команды в текущий срез рынка. Считаем цепочкой —
// поток лотов в сегменте → сколько команда возьмёт в работу → сколько выиграет → выручка.
export function WhatIf({ filtered }: { filtered: Row[] }) {
  const [winRate, setWinRate] = useState(25)
  const [capacity, setCapacity] = useState(5)

  const stats = useMemo(() => {
    const months = new Set(filtered.map((r) => r.mo).filter(Boolean)).size || 1
    const lotsPerMonth = filtered.length / months
    const med = median(filtered.filter((r) => r.p != null).map((r) => r.p as number))
    return { lotsPerMonth, med }
  }, [filtered])

  const flow = stats.lotsPerMonth            // поток сегмента, лотов/мес
  const taken = Math.min(flow, capacity)     // берём в работу (ограничены ёмкостью команды)
  const won = taken * (winRate / 100)        // выигрышей в месяц
  const revenue = won * stats.med            // выручка/мес по медианному чеку
  const load = capacity ? Math.min(1, flow / capacity) : 0

  return (
    <div className="panel">
      <div className="eyebrow">
        <span className="num">↯</span>Симулятор · сколько принесёт
      </div>
      <h2>What-if: выручка от захода в сегмент</h2>
      <p className="how">
        Прикидка под твою команду по текущему срезу рынка (фильтры выше). Задай два числа — цепочка ниже
        пересчитает ожидаемую выручку в месяц.
      </p>

      <div style={{ display: 'grid', gap: 18 }}>
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: '1fr 1fr' }}>
          <Slider
            label="Заявок в месяц осилит команда" hint="сколько тендеров реально подготовить"
            value={capacity} min={1} max={40} step={1} suffix=" шт" onChange={setCapacity}
          />
          <Slider
            label="Ожидаемый процент побед" hint="доля выигранных заявок; новичку 15–25%"
            value={winRate} min={5} max={70} step={5} suffix="%" onChange={setWinRate}
          />
        </div>

        {/* Цепочка расчёта: каждый шаг вытекает из предыдущего */}
        <div className="wi-chain">
          <Step n="1" value={flow} fmt={(x) => num(Math.round(x))} unit="лотов/мес"
                title="В сегменте" note="средний поток закупок" />
          <Arrow />
          <Step n="2" value={taken} fmt={(x) => num(Math.round(x))} unit="в работу"
                title="Берёшь" note={`ограничено ёмкостью — ${capacity}/мес`} />
          <Arrow />
          <Step n="3" value={won} fmt={(x) => x.toFixed(1).replace('.', ',')} unit="побед/мес"
                title="Выигрываешь" note={`${winRate}% от взятых в работу`} accent />
          <Arrow />
          <Step n="4" value={revenue} fmt={moneyR} unit="в месяц"
                title="Выручка" note={`по медиане чека ${moneyR(stats.med)}`} accent big />
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', marginBottom: 5 }}>
            <span>Хватает ли рынка на твою команду</span>
            <span className="mono">поток {Math.round(load * 100)}% ёмкости</span>
          </div>
          <div style={{ height: 9, background: 'var(--surface-2)', borderRadius: 5, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${load * 100}%`,
              background: load > 0.9 ? '#E4728F' : 'var(--amber)', borderRadius: 5, transition: 'width .4s ease',
            }} />
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--dim)', marginTop: 6 }}>
            {load > 0.9
              ? 'Лотов в сегменте больше, чем команда осилит — есть куда расти или нужен ещё менеджер.'
              : 'Команда покрывает поток сегмента с запасом — можно брать шире.'}
          </div>
        </div>
      </div>
    </div>
  )
}

function Slider({
  label, hint, value, min, max, step, suffix, onChange,
}: { label: string; hint: string; value: number; min: number; max: number; step: number; suffix: string; onChange: (v: number) => void }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 12.5, marginBottom: 2 }}>
        <span style={{ color: 'var(--muted)' }}>{label}</span>
        <span className="mono" style={{ color: 'var(--amber)', fontWeight: 700, fontSize: 15 }}>{value}{suffix}</span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 8 }}>{hint}</div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(+e.target.value)}
        style={{ width: '100%', accentColor: '#F2A93B' }}
      />
    </label>
  )
}

function Step({ n, value, fmt, unit, title, note, accent, big }: {
  n: string; value: number; fmt: (x: number) => string; unit: string
  title: string; note: string; accent?: boolean; big?: boolean
}) {
  return (
    <div className="wi-step" style={{ borderColor: accent ? 'rgba(242,169,59,.35)' : 'var(--line)' }}>
      <div className="mono" style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--dim)' }}>
        {n} · {title}
      </div>
      <div className="mono" style={{
        fontSize: big ? 24 : 20, fontWeight: 700, marginTop: 6, lineHeight: 1.05,
        color: accent ? 'var(--amber)' : 'var(--text)',
      }}>
        <AnimatedNumber value={value} format={fmt} />
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{unit}</div>
      <div style={{ fontSize: 10.5, color: 'var(--dim)', marginTop: 6 }}>{note}</div>
    </div>
  )
}

function Arrow() {
  return <div className="wi-arrow" aria-hidden>→</div>
}
