interface ScrollMetrics {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

export function scrollRatio(el: ScrollMetrics): number {
  const max = el.scrollHeight - el.clientHeight
  if (max <= 0) return 0
  return clamp01(el.scrollTop / max)
}

export function targetScrollTop(el: { scrollHeight: number; clientHeight: number }, ratio: number): number {
  const max = el.scrollHeight - el.clientHeight
  if (max <= 0) return 0
  return clamp01(ratio) * max
}
