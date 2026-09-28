import { inferCell, type CellValue } from './inferType'

export type SqlInsertDialect = 'sql' | 'mysql' | 'postgresql' | 'sqlite' | 'transactsql' | 'plsql'

const QUOTE_PAIRS: Record<SqlInsertDialect, [string, string]> = {
  sql: ['"', '"'],
  mysql: ['`', '`'],
  postgresql: ['"', '"'],
  sqlite: ['"', '"'],
  transactsql: ['[', ']'],
  plsql: ['"', '"']
}

const BOOL_LITERALS: Record<SqlInsertDialect, [string, string]> = {
  sql: ['1', '0'],
  mysql: ['TRUE', 'FALSE'],
  postgresql: ['TRUE', 'FALSE'],
  sqlite: ['TRUE', 'FALSE'],
  transactsql: ['1', '0'],
  plsql: ['1', '0']
}

function quoteIdentifier(dialect: SqlInsertDialect, name: string): string {
  const [open, close] = QUOTE_PAIRS[dialect]
  if (dialect === 'transactsql') return `${open}${name.replace(/]/g, ']]')}${close}`
  const escaped = name.split(open).join(open + open)
  return `${open}${escaped}${close}`
}

function quoteString(dialect: SqlInsertDialect, value: string): string {
  let escaped = value.split("'").join("''")
  if (dialect === 'mysql') escaped = escaped.split('\\').join('\\\\')
  return `'${escaped}'`
}

function renderValue(dialect: SqlInsertDialect, value: CellValue): string {
  if (value === null) return 'NULL'
  if (typeof value === 'boolean') return value ? BOOL_LITERALS[dialect][0] : BOOL_LITERALS[dialect][1]
  if (typeof value === 'number') return String(value)
  return quoteString(dialect, value)
}

export function rowsToInsertSql(
  dialect: SqlInsertDialect,
  table: string,
  headers: string[],
  rows: string[][],
  options: { multiRow: boolean; batchSize?: number }
): string {
  const target = table.trim() || 'my_table'
  const columns = headers.map(header => quoteIdentifier(dialect, header)).join(', ')
  const prefix = `INSERT INTO ${quoteIdentifier(dialect, target)} (${columns}) VALUES `
  const renderRow = (row: string[]) =>
    `(${headers.map((_, index) => renderValue(dialect, inferCell(row[index] ?? '', { emptyAsNull: true }))).join(', ')})`

  if (!options.multiRow) {
    return rows.map(row => `${prefix}${renderRow(row)};`).join('\n')
  }

  const batchSize = options.batchSize ?? 100
  const statements: string[] = []
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize).map(renderRow).join(', ')
    statements.push(`${prefix}${chunk};`)
  }
  return statements.join('\n')
}
