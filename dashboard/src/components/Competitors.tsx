import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { moneyR, pct } from '../lib/format'

// Досье поставщиков-победителей: картотека по «Индексу угрозы» + разворот выбранного с
// «Розой угрозы» (5 осей, перцентили по рынку) и рекомендацией «как играть». Концепт — Fable.

export interface Supplier {
  inn: string; name: string; status: string
  contracts: number; sum: number
  customers: { name: string; sum: number; share: number }[]
  top1_share: number; regions: string[]; region_count: number; home_share: number
  drop_median: number | null; drop_n: number
  recent: number; prev: number
  axes: { price: number; volume: number; tempo: number; reach: number; entrench: number }
  threat: number; rising: boolean; type: ArchType
}
type ArchType = 'damper' | 'insider' | 'giant' | 'entrencher' | 'sporadic'

const ARCH: Record<ArchType, { label: string; color: string }> = {
  damper: { label: 'Демпер', color: '#E4728F' },
  insider: { label: 'Свой человек', color: '#F2A93B' },
  giant: { label: 'Гигант', color: '#5B8DEF' },
  entrencher: { label: 'Окопник', color: '#6B84B8' },
  sporadic: { label: 'Спорадик', color: '#64748B' },
}

const AXES: { key: keyof Supplier['axes']; label: string }[] = [
  { key: 'price', label: 'Цена' },
  { key: 'volume', label: 'Объём' },
  { key: 'tempo', label: 'Темп' },
  { key: 'reach', label: 'Охват' },
  { key: 'entrench', label: 'Окоп.' },
]

export function Competitors({ suppliers }: { suppliers: Supplier[] }) {
  const [sel, setSel] = useState(0)
  if (!suppliers?.length) return null
  const s = suppliers[Math.min(sel, suppliers.length - 1)]

  return (
    <div className="panel">
      <div className="eyebrow"><span className="num">03</span>С кем · разведка конкурентов</div>
      <h2>Досье: с кем столкнёшься на рынке</h2>
      <p className="how">
        Реальные победители госзакупок из реестра контрактов, ранжированы по <b>Индексу угрозы</b>. Выбери —
        досье раскроет профиль и подскажет, как против него играть.
      </p>

      <div className="dos-grid">
        <div className="dos-list">
          {suppliers.slice(0, 15).map((sup, i) => {
            const a = ARCH[sup.type]
            const on = i === sel
            return (
              <button key={sup.inn} className={'dos-row' + (on ? ' on' : '')} onClick={() => setSel(i)}>
                <span className="mono dos-rank">{String(i + 1).padStart(2, '0')}</span>
                <span className="dos-nm">
                  <span className="dos-name">{sup.name}</span>
                  <span className="dos-sub">
                    <span className="dos-dot" style={{ background: a.color }} />
                    {a.label}{sup.rising ? ' · ⚡' : ''} · {sup.contracts} контр.
                  </span>
                </span>
                <span className="dos-threat">
                  <span className="mono" style={{ color: threatColor(sup.threat) }}>{sup.threat}</span>
                  <span className="dos-bar"><span style={{ width: `${sup.threat}%`, background: threatColor(sup.threat) }} /></span>
                </span>
              </button>
            )
          })}
        </div>

        <div className="dos-file">
          <div className="dos-fhead">
            <div>
              <div className="dos-fname">{s.name}</div>
              <div className="mono dos-finn">ИНН {s.inn} · {s.status === 'СМП' ? 'малый бизнес' : 'крупный'}</div>
            </div>
            <div className="dos-badge" style={{ borderColor: ARCH[s.type].color, color: ARCH[s.type].color }}>
              {ARCH[s.type].label}{s.rising ? ' ⚡' : ''}
            </div>
          </div>

          <div className="dos-body">
            <ThreatRose s={s} />
            <div className="dos-metrics">
              <Metric label="Индекс угрозы" value={String(s.threat)} tag={s.threat >= 66 ? 'высокий' : s.threat >= 40 ? 'средний' : 'низкий'} accent={threatColor(s.threat)} />
              <Metric label="Демпинг" value={s.drop_median != null ? pct(s.drop_median, 1) : 'н/д'}
                tag={s.drop_median == null ? 'нет данных' : s.drop_median >= 15 ? 'демпер' : s.drop_median >= 5 ? 'умеренный' : 'премиальный'} />
              <Metric label="Окопанность" value={pct(s.top1_share)} tag={s.top1_share >= 60 ? 'монополист у заказчика' : s.top1_share >= 30 ? 'ядро + периферия' : 'распылён'} />
              <Metric label="Охват" value={`${s.region_count} рег.`} tag={s.region_count >= 8 ? 'федеральный' : s.region_count >= 3 ? 'межрегиональный' : 'локальный'} />
              <Metric label="Объём" value={moneyR(s.sum)} tag={`${s.contracts} контрактов`} />
              <Metric label="Темп 12 мес" value={`${s.recent} vs ${s.prev}`} tag={s.rising ? 'разгоняется' : s.recent < s.prev ? 'затухает' : 'стабилен'} />
            </div>
          </div>

          {s.customers.length > 0 && (
            <div className="dos-cust">
              <div className="dos-lbl">Где закрепился · топ-заказчики</div>
              {s.customers.slice(0, 4).map((c) => (
                <div key={c.name} className="dos-crow">
                  <span className="dos-cname">{c.name}</span>
                  <span className="dos-cbar"><span style={{ width: `${c.share}%` }} /></span>
                  <span className="mono dos-cshare">{c.share}%</span>
                </div>
              ))}
            </div>
          )}

          <div className="dos-play">
            <div className="dos-lbl amber">Как играть</div>
            <div className="dos-playtext">{howToPlay(s)}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function threatColor(t: number) {
  return t >= 80 ? '#E4728F' : t >= 60 ? '#F2A93B' : '#5B8DEF'
}

function howToPlay(s: Supplier): string {
  const away = s.regions.length ? `вне его регионов (${s.regions.slice(0, 3).join(', ')} — заняты)` : 'в регионах без него'
  const top = s.customers[0]?.name
  switch (s.type) {
    case 'damper':
      return `Не воюй ценой — его медиана снижения ${s.drop_median != null ? pct(s.drop_median, 1) : 'высокая'}, съест твою маржу. Ищи заказчиков ${away}, где он не давит.`
    case 'insider':
      return `${top ? `У «${top}» его не выбить` : 'Закреплён у ключевого заказчика'} (${s.top1_share}% его выручки, почти без снижения). Исключи из воронки, целься в регионы, где его нет.`
    case 'giant':
      return `Федеральный универсал (${s.region_count} регионов, ${moneyR(s.sum)}). В лоб по объёму не взять — конкурируй нишей, сроками и локальным присутствием.`
    case 'entrencher':
      return `Локальный монополист${s.regions[0] ? ` в регионе «${s.regions[0]}»` : ''} (${s.home_share}% дома). Не лезь на его поле — заходи в соседние регионы, где спрос есть, а его нет.`
    default:
      return `Разовый игрок (${s.contracts} ${s.contracts === 1 ? 'контракт' : 'контракта'}, без закрепления). Не системная угроза — планируй по более крупным конкурентам выше.`
  }
}

// Роза угрозы: радар 5 осей + силуэт медианы рынка; вершины плавно морфятся при смене конкурента.
function ThreatRose({ s }: { s: Supplier }) {
  const reduce = useReducedMotion()
  const R = 62, cx = 90, cy = 92
  const target = AXES.map((a) => s.axes[a.key])
  const [disp, setDisp] = useState(target)
  const raf = useRef(0)
  const cur = useRef(target)

  useEffect(() => {
    if (reduce) { cur.current = target; setDisp(target); return }
    const from = cur.current.slice()
    const t0 = performance.now()
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / 420)
      const e = 1 - Math.pow(1 - k, 3)
      const next = from.map((v, i) => v + (target[i] - v) * e)
      cur.current = next
      setDisp(next)
      if (k < 1) raf.current = requestAnimationFrame(tick)
    }
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.inn])

  const pt = (i: number, val: number) => {
    const ang = -Math.PI / 2 + (i / AXES.length) * Math.PI * 2
    const r = (val / 100) * R
    return [cx + Math.cos(ang) * r, cy + Math.sin(ang) * r]
  }
  const poly = (vals: number[]) => vals.map((v, i) => pt(i, v).map((n) => n.toFixed(1)).join(',')).join(' ')

  return (
    <svg viewBox="0 0 180 180" className="dos-rose">
      {[0.25, 0.5, 0.75, 1].map((g) => (
        <polygon key={g} points={poly(AXES.map(() => g * 100))} fill="none" stroke="rgba(148,163,191,.1)" />
      ))}
      {AXES.map((a, i) => {
        const [x, y] = pt(i, 100)
        const [lx, ly] = pt(i, 126)
        return (
          <g key={a.key}>
            <line x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(148,163,191,.1)" />
            <text x={lx} y={ly} className="dos-axis" textAnchor="middle" dominantBaseline="middle">{a.label}</text>
          </g>
        )
      })}
      <polygon points={poly(AXES.map(() => 50))} fill="none" stroke="#5B8DEF" strokeWidth={1} strokeDasharray="3 3" opacity={0.55} />
      <polygon points={poly(disp)} fill="rgba(242,169,59,.14)" stroke="#F2A93B" strokeWidth={1.8} />
      {AXES.map((a, i) => {
        const [x, y] = pt(i, disp[i])
        const spike = disp[i] >= 85
        return <circle key={a.key} cx={x} cy={y} r={spike ? 3.2 : 2} fill={spike ? '#E4728F' : '#F2A93B'} />
      })}
    </svg>
  )
}

function Metric({ label, value, tag, accent }: { label: string; value: string; tag: string; accent?: string }) {
  return (
    <div className="dos-metric">
      <span className="dos-mlbl">{label}</span>
      <span className="dos-mr">
        <span className="mono dos-mval" style={accent ? { color: accent } : undefined}>{value}</span>
        <span className="dos-mtag">{tag}</span>
      </span>
    </div>
  )
}
