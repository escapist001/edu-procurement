// Одна строка выборки из rows.json (короткие ключи ради размера файла).
export interface Row {
  n: string          // номер контракта в ЕИС
  law: '44' | '223'  // закон
  mt: string         // способ закупки (короткий ярлык)
  p: number | null   // НМЦК, ₽
  rg: string | null  // регион (эвристика)
  mo: string | null  // месяц размещения, 'YYYY-MM'
  st: string         // стадия процедуры
  c: string          // заказчик (сокращённо)
}

export interface RowsFile {
  source: string
  generated_period: [string, string]
  rows: Row[]
}
