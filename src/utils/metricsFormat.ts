const BYTE_UNITS = ['KB', 'MB', 'GB', 'TB']

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '-'
  if (bytes < 1024) return `${Math.round(bytes)} B`
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  const rounded = value >= 100 ? String(Math.round(value)) : value.toFixed(1)
  return `${rounded} ${BYTE_UNITS[unitIndex]}`
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '-'
  const rounded = value >= 100 ? String(Math.round(value)) : value.toFixed(1)
  return `${rounded}%`
}
