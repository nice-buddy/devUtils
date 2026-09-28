import { describe, expect, it } from 'vitest'
import { formatBytes, formatPercent } from '../metricsFormat'

describe('formatBytes', () => {
  it('小于 1KB 时按字节展示', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
  })

  it('按 1024 进制换算并保留一位小数', () => {
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB')
    expect(formatBytes(1024 * 1024 * 128)).toBe('128 MB')
    expect(formatBytes(1024 * 1024 * 1024 * 2)).toBe('2.0 GB')
  })

  it('非法输入回落为占位符', () => {
    expect(formatBytes(-1)).toBe('-')
    expect(formatBytes(Number.NaN)).toBe('-')
  })
})

describe('formatPercent', () => {
  it('小于 100% 时保留一位小数', () => {
    expect(formatPercent(0)).toBe('0.0%')
    expect(formatPercent(12.34)).toBe('12.3%')
  })

  it('超过 100% 时取整（多核场景）', () => {
    expect(formatPercent(150.6)).toBe('151%')
  })

  it('非法输入回落为占位符', () => {
    expect(formatPercent(-0.5)).toBe('-')
    expect(formatPercent(Number.POSITIVE_INFINITY)).toBe('-')
  })
})
