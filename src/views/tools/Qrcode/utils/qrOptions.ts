export type QrEcc = 'L' | 'M' | 'Q' | 'H'

export interface QrOptions {
  ecc: QrEcc
  size: number
  margin: number
  fg: string
  bg: string
}

export const DEFAULT_QR_OPTIONS: QrOptions = {
  ecc: 'M',
  size: 256,
  margin: 2,
  fg: '#000000',
  bg: '#FFFFFF'
}

const ECC_VALUES: QrEcc[] = ['L', 'M', 'Q', 'H']
const HEX_RE = /^#?([0-9a-fA-F]{6})$/

function normalizeHex(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const match = HEX_RE.exec(value.trim())
  return match ? `#${match[1].toUpperCase()}` : fallback
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.min(max, Math.max(min, Math.round(num)))
}

export function normalizeQrOptions(partial: Partial<QrOptions> = {}): QrOptions {
  const ecc = ECC_VALUES.includes(partial.ecc as QrEcc)
    ? (partial.ecc as QrEcc)
    : DEFAULT_QR_OPTIONS.ecc
  return {
    ecc,
    size: clampInt(partial.size, 128, 1024, DEFAULT_QR_OPTIONS.size),
    margin: clampInt(partial.margin, 0, 8, DEFAULT_QR_OPTIONS.margin),
    fg: normalizeHex(partial.fg, DEFAULT_QR_OPTIONS.fg),
    bg: normalizeHex(partial.bg, DEFAULT_QR_OPTIONS.bg)
  }
}

function srgbChannel(value: number): number {
  const channel = value / 255
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

function relativeLuminance(hex: string): number {
  const normalized = normalizeHex(hex, '#000000')
  const r = Number.parseInt(normalized.slice(1, 3), 16)
  const g = Number.parseInt(normalized.slice(3, 5), 16)
  const b = Number.parseInt(normalized.slice(5, 7), 16)
  return 0.2126 * srgbChannel(r) + 0.7152 * srgbChannel(g) + 0.0722 * srgbChannel(b)
}

export function contrastRatio(fg: string, bg: string): number {
  const first = relativeLuminance(fg)
  const second = relativeLuminance(bg)
  const lighter = Math.max(first, second)
  const darker = Math.min(first, second)
  return (lighter + 0.05) / (darker + 0.05)
}
