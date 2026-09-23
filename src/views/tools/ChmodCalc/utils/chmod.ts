export interface PermBits {
  owner: number
  group: number
  other: number
  setuid: boolean
  setgid: boolean
  sticky: boolean
}

export const DEFAULT_BITS: PermBits = {
  owner: 6,
  group: 4,
  other: 4,
  setuid: false,
  setgid: false,
  sticky: false
}

export function octalToBits(octal: string): { bits: PermBits } | { error: string } {
  const text = octal.trim()
  if (!/^[0-7]{3,4}$/.test(text)) return { error: '八进制权限必须是 3 ~ 4 位、每位数 0-7' }
  const digits = text.padStart(4, '0')
  const special = Number(digits[0])
  return {
    bits: {
      owner: Number(digits[1]),
      group: Number(digits[2]),
      other: Number(digits[3]),
      setuid: (special & 4) !== 0,
      setgid: (special & 2) !== 0,
      sticky: (special & 1) !== 0
    }
  }
}

export function bitsToOctal(bits: PermBits): string {
  const special = (bits.setuid ? 4 : 0) + (bits.setgid ? 2 : 0) + (bits.sticky ? 1 : 0)
  const core = `${bits.owner}${bits.group}${bits.other}`
  return special ? `${special}${core}` : core
}

export function bitsToSymbolic(bits: PermBits, withType = true): string {
  const triplet = (value: number, hasSpecial: boolean, specialChar: 's' | 't') => {
    const read = (value & 4) !== 0 ? 'r' : '-'
    const write = (value & 2) !== 0 ? 'w' : '-'
    const executable = (value & 1) !== 0
    const execute = hasSpecial ? (executable ? specialChar : specialChar.toUpperCase()) : executable ? 'x' : '-'
    return `${read}${write}${execute}`
  }
  const body = [
    triplet(bits.owner, bits.setuid, 's'),
    triplet(bits.group, bits.setgid, 's'),
    triplet(bits.other, bits.sticky, 't')
  ].join('')
  return withType ? `-${body}` : body
}

export function symbolicToBits(symbolic: string): { bits: PermBits } | { error: string } {
  const text = symbolic.trim()
  const body = text.length === 10 ? text.slice(1) : text
  if (!/^[rwxstST-]{9}$/.test(body)) {
    return { error: '符号权限必须是 9 位（如 rwxr-xr-x）或 10 位（含首位类型字符）' }
  }
  const parseTriplet = (chunk: string, specialChar: 's' | 't') => {
    let value = 0
    if (chunk[0] === 'r') value += 4
    if (chunk[1] === 'w') value += 2
    const execute = chunk[2]
    const hasSpecial = execute === specialChar || execute === specialChar.toUpperCase()
    if (execute === 'x' || execute === specialChar) value += 1
    return { value, hasSpecial }
  }
  const owner = parseTriplet(body.slice(0, 3), 's')
  const group = parseTriplet(body.slice(3, 6), 's')
  const other = parseTriplet(body.slice(6, 9), 't')
  return {
    bits: {
      owner: owner.value,
      group: group.value,
      other: other.value,
      setuid: owner.hasSpecial,
      setgid: group.hasSpecial,
      sticky: other.hasSpecial
    }
  }
}

export function toCommand(bits: PermBits, options: { path?: string; recursive?: boolean }): string {
  const parts = ['chmod']
  if (options.recursive) parts.push('-R')
  parts.push(bitsToOctal(bits))
  const path = options.path?.trim()
  if (path) parts.push(/[\s'"]/.test(path) ? `'${path.replace(/'/g, "'\\''")}'` : path)
  return parts.join(' ')
}
