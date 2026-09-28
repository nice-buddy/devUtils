import { describe, expect, it } from 'vitest'
import { DEFAULT_QR_OPTIONS, contrastRatio, normalizeQrOptions } from '../utils/qrOptions'

describe('normalizeQrOptions', () => {
  it('越界尺寸被钳制到边界', () => {
    expect(normalizeQrOptions({ size: 64 }).size).toBe(128)
    expect(normalizeQrOptions({ size: 4096 }).size).toBe(1024)
  })

  it('边距越界被钳制，小数被取整', () => {
    expect(normalizeQrOptions({ margin: -3 }).margin).toBe(0)
    expect(normalizeQrOptions({ margin: 99 }).margin).toBe(8)
    expect(normalizeQrOptions({ margin: 3.6 }).margin).toBe(4)
  })

  it('非法颜色与非法纠错等级回落默认值', () => {
    expect(normalizeQrOptions({ fg: 'red' }).fg).toBe(DEFAULT_QR_OPTIONS.fg)
    expect(normalizeQrOptions({ bg: '' }).bg).toBe(DEFAULT_QR_OPTIONS.bg)
    expect(normalizeQrOptions({ ecc: 'X' as never }).ecc).toBe('M')
  })

  it('颜色统一归一化为大写 #RRGGBB', () => {
    expect(normalizeQrOptions({ fg: '00ff00' }).fg).toBe('#00FF00')
    expect(normalizeQrOptions({ bg: '#abcdef' }).bg).toBe('#ABCDEF')
  })

  it('空对象返回默认值', () => {
    expect(normalizeQrOptions()).toEqual(DEFAULT_QR_OPTIONS)
  })
})

describe('contrastRatio', () => {
  it('黑白对比度为 21', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1)
  })

  it('同色对比度为 1', () => {
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5)
  })
})
