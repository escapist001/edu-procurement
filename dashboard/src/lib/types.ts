// Одна строка выборки из rows.json (короткие ключи ради размера файла).
export interface Row {
  n: string          // номер закупки в ЕИС
  law: '44' | '223'  // закон
  mt: string         // способ закупки (короткий ярлык)
  p: number | null   // НМЦК, ₽
  fp: number | null  // финальная цена (предложение победителя), ₽ — реальный исход
  dp: number | null  // снижение цены на торгах, % — реальная конкуренция ex-post
  rg: string | null  // регион (по адресу/ИНН заказчика — структурный код, не эвристика)
  mo: string | null  // месяц размещения, 'YYYY-MM'
  st: string         // стадия процедуры
  c: string          // заказчик (сокращённо)
  sup: string | null // поставщик-победитель (из реестра контрактов), если известен
}

export interface RowsFile {
  source: string
  generated_period: [string, string]
  rows: Row[]
}
