import { describe, expect, it } from 'vitest'
import { targetSize } from '../utils/imageResize'

describe('targetSize', () => {
  it('按比例等比缩放并取整', () => {
    expect(targetSize(1000, 500, 0.5)).toEqual({ width: 500, height: 250 })
    expect(targetSize(101, 51, 0.5)).toEqual({ width: 51, height: 26 })
  })

  it('scale 为 1 时不变', () => {
    expect(targetSize(800, 600, 1)).toEqual({ width: 800, height: 600 })
  })

  it('极端长宽比不会产生 0', () => {
    expect(targetSize(10000, 3, 0.01)).toEqual({ width: 100, height: 1 })
  })

  it('非法输入被规整', () => {
    expect(targetSize(0, 0, 0.5)).toEqual({ width: 1, height: 1 })
    expect(targetSize(100, 100, 2)).toEqual({ width: 200, height: 200 })
  })
})
