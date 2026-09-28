import { describe, expect, it } from 'vitest'
import { hslToRgb, parseColor, rgbToHsl, toHex, toHslString, toRgbString } from '../utils/colorConvert'

const ok = (input: string) => {
  const r = parseColor(input)
  if (!r.value) throw new Error(`解析失败: ${input} -> ${r.error}`)
  return r.value
}

describe('color-converter 颜色转换', () => {
  it('解析 6 位与 3 位 HEX，输出统一小写', () => {
    expect(ok('#FF0000')).toEqual({ r: 255, g: 0, b: 0, a: 1 })
    expect(ok('#f00')).toEqual({ r: 255, g: 0, b: 0, a: 1 })
    expect(toHex(ok('#FF0000'))).toBe('#ff0000')
  })

  it('解析 8 位与 4 位 HEX 的 alpha 通道', () => {
    expect(ok('#ff000080').a).toBeCloseTo(128 / 255, 5)
    expect(ok('#f008').a).toBeCloseTo(136 / 255, 5)
    expect(toHex(ok('#ff000080'))).toBe('#ff000080')
  })

  it('解析 rgb() 与 rgba()，支持百分比分量', () => {
    expect(ok('rgb(255, 0, 0)')).toEqual({ r: 255, g: 0, b: 0, a: 1 })
    expect(ok('rgb(100%, 0%, 0%)')).toEqual({ r: 255, g: 0, b: 0, a: 1 })
    expect(ok('rgba(0, 0, 255, 0.5)')).toEqual({ r: 0, g: 0, b: 255, a: 0.5 })
  })

  it('解析 hsl() 与 hsla()，H=360 与 H=0 等价', () => {
    expect(ok('hsl(0, 100%, 50%)')).toEqual({ r: 255, g: 0, b: 0, a: 1 })
    expect(ok('hsl(360, 100%, 50%)')).toEqual(ok('hsl(0, 100%, 50%)'))
    expect(ok('hsla(240, 100%, 50%, 0.25)').a).toBe(0.25)
  })

  it('解析 16 个基础命名色', () => {
    expect(ok('red')).toEqual({ r: 255, g: 0, b: 0, a: 1 })
    expect(ok('white')).toEqual({ r: 255, g: 255, b: 255, a: 1 })
    expect(parseColor('chartreuse').error).toBeTruthy()
  })

  it('往返：锚定色 HEX -> RGB -> HSL -> RGB -> HEX 完全一致', () => {
    for (const hex of ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff']) {
      const c = ok(hex)
      const hsl = rgbToHsl(c)
      const back = hslToRgb(hsl.h, hsl.s, hsl.l, c.a)
      expect(toHex(back)).toBe(hex)
    }
  })

  it('整数化 HSL 的往返误差限制在每通道 ±3 以内', () => {
    const c = ok('#123456')
    const hsl = rgbToHsl(c)
    const back = hslToRgb(hsl.h, hsl.s, hsl.l, c.a)
    expect(Math.abs(back.r - c.r)).toBeLessThanOrEqual(3)
    expect(Math.abs(back.g - c.g)).toBeLessThanOrEqual(3)
    expect(Math.abs(back.b - c.b)).toBeLessThanOrEqual(3)
  })

  it('格式化：alpha 为 1 时省略 alpha 通道', () => {
    expect(toRgbString(ok('#ff0000'))).toBe('rgb(255, 0, 0)')
    expect(toRgbString(ok('rgba(255, 0, 0, 0.5)'))).toBe('rgba(255, 0, 0, 0.5)')
    expect(toHslString(ok('#ff0000'))).toBe('hsl(0, 100%, 50%)')
    expect(toHslString(ok('rgba(255, 0, 0, 0.5)'))).toBe('hsla(0, 100%, 50%, 0.5)')
  })

  it('非法输入返回 error 而不是抛异常', () => {
    for (const bad of ['#12345', 'rgb(300, 0, 0)', 'hsl(400, 50%, 50%)', 'rgb(1,2)', '', '  ', '#gg0000']) {
      expect(parseColor(bad).error, bad).toBeTruthy()
      expect(parseColor(bad).value).toBeUndefined()
    }
  })
})
