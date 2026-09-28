export interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

const NAMED: Record<string, string> = {
  black: '#000000',
  silver: '#c0c0c0',
  gray: '#808080',
  white: '#ffffff',
  maroon: '#800000',
  red: '#ff0000',
  purple: '#800080',
  fuchsia: '#ff00ff',
  green: '#008000',
  lime: '#00ff00',
  olive: '#808000',
  yellow: '#ffff00',
  navy: '#000080',
  blue: '#0000ff',
  teal: '#008080',
  aqua: '#00ffff'
}

function clamp255(n: number): number {
  return Math.min(255, Math.max(0, Math.round(n)))
}

function parseHex(raw: string): Rgba | null {
  const match = /^#?([0-9a-f]+)$/i.exec(raw.trim())
  if (!match) return null
  const hex = match[1]
  if (![3, 4, 6, 8].includes(hex.length)) return null
  const one = (c: string) => parseInt(c + c, 16)
  if (hex.length === 3 || hex.length === 4) {
    return {
      r: one(hex[0]),
      g: one(hex[1]),
      b: one(hex[2]),
      a: hex.length === 4 ? one(hex[3]) / 255 : 1
    }
  }
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
    a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1
  }
}

// RGB 分量：0-255 或百分比
function parseChannel(raw: string): number | null {
  const text = raw.trim()
  if (!text) return null
  if (text.endsWith('%')) {
    const value = Number(text.slice(0, -1))
    if (!Number.isFinite(value) || value < 0 || value > 100) return null
    return (value / 100) * 255
  }
  const value = Number(text)
  if (!Number.isFinite(value) || value < 0 || value > 255) return null
  return value
}

// alpha：0-1 或百分比
function parseAlpha(raw: string): number | null {
  const text = raw.trim()
  if (!text) return null
  if (text.endsWith('%')) {
    const value = Number(text.slice(0, -1))
    if (!Number.isFinite(value) || value < 0 || value > 100) return null
    return value / 100
  }
  const value = Number(text)
  if (!Number.isFinite(value) || value < 0 || value > 1) return null
  return value
}

// HSL 的 S/L：0-100 百分比
function parsePercent(raw: string): number | null {
  const text = raw.trim().replace(/%$/, '')
  const value = Number(text)
  if (!Number.isFinite(value) || value < 0 || value > 100) return null
  return value
}

function splitArgs(body: string): string[] {
  return body.split(',').map(part => part.trim())
}

function parseRgbFunction(text: string): Rgba | null {
  const match = /^rgba?\(([^)]*)\)$/.exec(text)
  if (!match) return null
  const parts = splitArgs(match[1])
  if (parts.length !== 3 && parts.length !== 4) return null
  const [r, g, b] = parts.slice(0, 3).map(parseChannel)
  if (r === null || g === null || b === null) return null
  const a = parts.length === 4 ? parseAlpha(parts[3]) : 1
  if (a === null) return null
  return { r, g, b, a }
}

function parseHslFunction(text: string): Rgba | null {
  const match = /^hsla?\(([^)]*)\)$/.exec(text)
  if (!match) return null
  const parts = splitArgs(match[1])
  if (parts.length !== 3 && parts.length !== 4) return null
  const hueText = parts[0].replace(/deg$/i, '').trim()
  const h = Number(hueText)
  if (!Number.isFinite(h) || h < 0 || h > 360) return null
  const s = parsePercent(parts[1])
  const l = parsePercent(parts[2])
  if (s === null || l === null) return null
  const a = parts.length === 4 ? parseAlpha(parts[3]) : 1
  if (a === null) return null
  return hslToRgb(h, s, l, a)
}

export function parseColor(input: string): { value?: Rgba; error?: string } {
  const text = input.trim().toLowerCase()
  if (!text) return { error: '请输入颜色值' }
  if (NAMED[text]) return { value: parseHex(NAMED[text]) as Rgba }
  if (text.startsWith('#')) {
    const value = parseHex(text)
    return value ? { value } : { error: `无法解析的 HEX 颜色：${input}` }
  }
  const rgb = parseRgbFunction(text)
  if (rgb) return { value: rgb }
  const hsl = parseHslFunction(text)
  if (hsl) return { value: hsl }
  return { error: `无法识别的颜色格式：${input}` }
}

export function rgbToHsl(c: Rgba): { h: number; s: number; l: number } {
  const r = clamp255(c.r) / 255
  const g = clamp255(c.g) / 255
  const b = clamp255(c.b) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  let h = 0
  let s = 0
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1))
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) }
}

export function hslToRgb(h: number, s: number, l: number, a = 1): Rgba {
  const sn = s / 100
  const ln = l / 100
  const c = (1 - Math.abs(2 * ln - 1)) * sn
  const hp = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let r = 0
  let g = 0
  let b = 0
  if (hp < 1) [r, g, b] = [c, x, 0]
  else if (hp < 2) [r, g, b] = [x, c, 0]
  else if (hp < 3) [r, g, b] = [0, c, x]
  else if (hp < 4) [r, g, b] = [0, x, c]
  else if (hp < 5) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const m = ln - c / 2
  return { r: clamp255((r + m) * 255), g: clamp255((g + m) * 255), b: clamp255((b + m) * 255), a }
}

function hex2(n: number): string {
  return clamp255(n).toString(16).padStart(2, '0')
}

function alphaSuffix(a: number): string {
  return String(Math.round(a * 100) / 100)
}

export function toHex(c: Rgba): string {
  const base = `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`
  if (c.a >= 1) return base
  return `${base}${hex2(c.a * 255)}`
}

export function toRgbString(c: Rgba): string {
  const r = clamp255(c.r)
  const g = clamp255(c.g)
  const b = clamp255(c.b)
  if (c.a >= 1) return `rgb(${r}, ${g}, ${b})`
  return `rgba(${r}, ${g}, ${b}, ${alphaSuffix(c.a)})`
}

export function toHslString(c: Rgba): string {
  const { h, s, l } = rgbToHsl(c)
  if (c.a >= 1) return `hsl(${h}, ${s}%, ${l}%)`
  return `hsla(${h}, ${s}%, ${l}%, ${alphaSuffix(c.a)})`
}
