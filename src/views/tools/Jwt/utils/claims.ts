const TIME_CLAIMS = ['exp', 'iat', 'nbf']

function humanize(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  if (days > 0) return `${days} 天 ${hours} 小时`
  if (hours > 0) return `${hours} 小时 ${minutes} 分`
  if (minutes > 0) return `${minutes} 分 ${secs} 秒`
  return `${secs} 秒`
}

export function describeClaims(
  payload: Record<string, any>,
  now: number
): { key: string; value: string; iso?: string; relative?: string }[] {
  return Object.entries(payload).map(([key, raw]) => {
    const row: { key: string; value: string; iso?: string; relative?: string } = {
      key,
      value: JSON.stringify(raw)
    }
    if (TIME_CLAIMS.includes(key) && typeof raw === 'number' && Number.isFinite(raw)) {
      row.iso = new Date(raw * 1000).toISOString()
      const diff = Math.round(raw - now / 1000)
      row.relative = diff === 0 ? '就是现在' : diff > 0 ? `还剩 ${humanize(diff)}` : `已过去 ${humanize(-diff)}`
    }
    return row
  })
}
