import { motion, useReducedMotion } from 'framer-motion'
import { num } from '../lib/format'

export function Header({ source, period, numbers }: { source: string; period: [string, string]; numbers: string[] }) {
  const reduce = useReducedMotion()
  const strip = numbers.slice(0, 60).join('   ')
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
          1 000 контрактов с zakupki.gov.ru на <b>5,76 млрд ₽</b>, декабрь 2025 — июль 2026, собраны собственным
          парсером ЕИС. Один вопрос: в какой регион ехать, через какую процедуру заходить, с каким чеком и когда.
          Фильтруй — весь экран пересчитывается под твою гипотезу.
        </p>
        <div className="prov mono">
          источник: {source.split('·')[0].trim()} · парсер: python (requests + bs4) · {num(1000)} записей · период{' '}
          {period[0]} – {period[1]}
        </div>
      </div>
    </header>
  )
}
