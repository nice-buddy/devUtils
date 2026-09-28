import { detectDelimiter } from './delimiter'

export interface ParsedTable {
  headers: string[]
  rows: string[][]
  skippedBlankLines: number
  warnings: { line: number; message: string }[]
}

export function parseDelimitedText(text: string, options: { delimiter?: string; hasHeader: boolean }): ParsedTable {
  const normalized = text.replace(/\r\n?/g, '\n')
  const delimiter = options.delimiter || detectDelimiter(normalized)
  const rawRows: { cells: string[]; line: number }[] = []
  let field = ''
  let cells: string[] = []
  let inQuotes = false
  let line = 1
  let rowStartLine = 1
  let i = 0

  while (i < normalized.length) {
    const ch = normalized[i]
    if (inQuotes) {
      if (ch === '"') {
        if (normalized[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      if (ch === '\n') line += 1
      field += ch
      i += 1
      continue
    }
    if (ch === '"' && field === '') {
      inQuotes = true
      i += 1
      continue
    }
    if (ch === delimiter) {
      cells.push(field)
      field = ''
      i += 1
      continue
    }
    if (ch === '\n') {
      cells.push(field)
      rawRows.push({ cells, line: rowStartLine })
      cells = []
      field = ''
      line += 1
      rowStartLine = line
      i += 1
      continue
    }
    field += ch
    i += 1
  }
  if (field !== '' || cells.length > 0) {
    cells.push(field)
    rawRows.push({ cells, line: rowStartLine })
  }

  let skippedBlankLines = 0
  const rows = rawRows.filter(row => {
    if (row.cells.every(cell => cell === '')) {
      skippedBlankLines += 1
      return false
    }
    return true
  })

  const warnings: { line: number; message: string }[] = []
  const headerRow = options.hasHeader ? rows.shift() : undefined
  // 有表头时以表头宽度为准（超出的数据列截断并告警）；无表头时取最宽行
  const columnCount = headerRow
    ? headerRow.cells.length
    : rows.reduce((max, row) => Math.max(max, row.cells.length), 0)

  const headers: string[] = []
  const used = new Map<string, number>()
  for (let index = 0; index < columnCount; index += 1) {
    const raw = headerRow ? (headerRow.cells[index] ?? '').trim() : ''
    let name = raw || `col${index + 1}`
    const seen = used.get(name)
    if (seen === undefined) {
      used.set(name, 1)
    } else {
      used.set(name, seen + 1)
      name = `${name}_${seen + 1}`
      used.set(name, 1)
    }
    headers.push(name)
  }

  const normalizedRows = rows.map(row => {
    if (row.cells.length > columnCount) {
      warnings.push({ line: row.line, message: `第 ${row.line} 行列数（${row.cells.length}）超过表头列数（${columnCount}），多余列已忽略` })
      return row.cells.slice(0, columnCount)
    }
    if (row.cells.length < columnCount) {
      return [...row.cells, ...Array(columnCount - row.cells.length).fill('')]
    }
    return row.cells
  })

  return { headers, rows: normalizedRows, skippedBlankLines, warnings }
}
