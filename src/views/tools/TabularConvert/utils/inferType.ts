export type CellValue = string | number | boolean | null

const MAX_SAFE_DIGITS = 15

export function inferCell(raw: string, options: { emptyAsNull: boolean }): CellValue {
  const text = raw.trim()
  if (text === '') return options.emptyAsNull ? null : ''
  if (/^true$/i.test(text)) return true
  if (/^false$/i.test(text)) return false

  if (/^[+-]?\d+$/.test(text)) {
    const digits = text.replace(/^[+-]/, '')
    // 前导零、超 15 位有效数字、超安全整数一律保持字符串
    if (/^0\d/.test(digits) || digits.length > MAX_SAFE_DIGITS) return raw
    const value = Number(text)
    return Number.isSafeInteger(value) ? value : raw
  }

  if (/^[+-]?(\d+\.\d*|\.\d+)$/.test(text)) {
    const digits = text.replace(/^[+-]/, '').replace('.', '').replace(/^0+/, '')
    if (digits.length > MAX_SAFE_DIGITS) return raw
    return Number(text)
  }

  return raw
}
