import { inferCell, type CellValue } from './inferType'

export function rowsToJsonArray(headers: string[], rows: string[][], options: { emptyAsNull: boolean }): string {
  const objects = rows.map(row => {
    const entry: Record<string, CellValue> = {}
    headers.forEach((header, index) => {
      entry[header] = inferCell(row[index] ?? '', options)
    })
    return entry
  })
  return JSON.stringify(objects, null, 2)
}

export function rowsToArrayOfArrays(
  rows: string[][],
  options: { emptyAsNull: boolean; includeHeader: boolean; headers?: string[] }
): string {
  const arrays: CellValue[][] = rows.map(row => row.map(cell => inferCell(cell, options)))
  if (options.includeHeader) arrays.unshift([...(options.headers ?? [])])
  return JSON.stringify(arrays, null, 2)
}
