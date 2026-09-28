export function targetSize(width: number, height: number, scale: number): { width: number; height: number } {
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 1
  const safeHeight = Number.isFinite(height) && height > 0 ? height : 1
  return {
    width: Math.max(1, Math.round(safeWidth * safeScale)),
    height: Math.max(1, Math.round(safeHeight * safeScale))
  }
}
