export interface WsLogEntry {
  id: number
  direction: 'in' | 'out' | 'system'
  kind: 'text' | 'binary'
  payload: string
  size: number
  timestamp: number
}

export const LOG_LIMIT = 2000

const encoder = new TextEncoder()

export function byteSize(text: string): number {
  return encoder.encode(text).length
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

export function appendLog(entries: WsLogEntry[], entry: WsLogEntry, limit = LOG_LIMIT): WsLogEntry[] {
  const next = [...entries, entry]
  return next.length > limit ? next.slice(next.length - limit) : next
}

export function filterLog(
  entries: WsLogEntry[],
  options: { keyword: string; direction: 'all' | 'in' | 'out' | 'system' }
): WsLogEntry[] {
  const keyword = options.keyword.trim().toLowerCase()
  return entries.filter(entry => {
    if (options.direction !== 'all' && entry.direction !== options.direction) return false
    if (!keyword) return true
    return entry.payload.toLowerCase().includes(keyword)
  })
}
