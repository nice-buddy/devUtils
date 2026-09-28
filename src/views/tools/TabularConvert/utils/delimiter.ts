const CANDIDATES = ['\t', ',', ';', '|']

function median(values: number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// 取「首 20 个非空行的字段数中位数最大」的候选分隔符；都不足 2 列时返回 \t（按单列处理）
export function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== '').slice(0, 20)
  if (!lines.length) return '\t'
  let best = '\t'
  let bestScore = 0
  for (const candidate of CANDIDATES) {
    const score = median(lines.map(line => line.split(candidate).length))
    if (score > bestScore) {
      bestScore = score
      best = candidate
    }
  }
  return bestScore >= 2 ? best : '\t'
}
