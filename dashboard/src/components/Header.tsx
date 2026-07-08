import { motion, useReducedMotion } from 'framer-motion'
import { money, num } from '../lib/format'

export function Header({ source, period, numbers, records, totalSum, withOutcome }: {
  source: string; period: [string, string]; numbers: string[]
  records: number; totalSum: number; withOutcome: number
}) {
  const reduce = useReducedMotion()
  const strip = numbers.slice(0, 60).join('   ')
  const years = period[0] && period[1] ? `${period[0].slice(0, 4)}–${period[1].slice(0, 4)}` : ''
  return (
    <header>
      <div className="marquee" aria-hidden>
        <motion.span
          animate={reduce ? undefined : { x: ['0%', '-50%'] }}
          transition={{ duration: 90, repeat: Infinity, ease: 'linear' }}
        >
          {strip + '   ' + strip}
        </motion.span>
      </div>
      <div className="wrap head-in">
        <div className="kicker">
          <span className="dot" />
          Радар госзаказа · ЕИС · учебное оборудование
        </div>
        <h1 className="title">
          Куда поставщику идти <span className="amber">за деньгами</span>
        </h1>
        <p className="lead">
          {num(records)} закупок учебного оборудования из ЕИС на <b>{money(totalSum)} ₽</b>, {years} годы. Для{' '}
          <b>{num(withOutcome)}</b> завершённых торгов добыт реальный исход — на сколько сбили цену. Один вопрос:
          в какой регион ехать, через какую процедуру заходить, с каким чеком и когда. Фильтруй — весь экран
          пересчитывается под твою гипотезу.
        </p>
        <div className="prov mono">
          источник: {source.split('·')[0].trim()} · сбор: python-конвейер · {num(records)} записей · период{' '}
          {period[0]} – {period[1]}
        </div>
      </div>
    </header>
  )
}
