import { describe, expect, it } from 'vitest'
import { inferCell } from '../utils/inferType'

const opts = { emptyAsNull: true }

describe('tabular-convert 类型推导', () => {
  it('布尔与空值', () => {
    expect(inferCell('true', opts)).toBe(true)
    expect(inferCell('FALSE', opts)).toBe(false)
    expect(inferCell('', opts)).toBe(null)
    expect(inferCell('', { emptyAsNull: false })).toBe('')
  })

  it('整数与小数转为数值', () => {
    expect(inferCell('42', opts)).toBe(42)
    expect(inferCell('-3.5', opts)).toBe(-3.5)
    expect(inferCell('+7', opts)).toBe(7)
  })

  it('大整数与带前导零的字符串保持字符串', () => {
    expect(inferCell('00123', opts)).toBe('00123')
    expect(inferCell('1892837482910293847', opts)).toBe('1892837482910293847')
    expect(inferCell('9007199254740993', opts)).toBe('9007199254740993')
    expect(inferCell('123456789012345', opts)).toBe(123456789012345)
  })

  it('科学计数法与普通文本保持字符串', () => {
    expect(inferCell('1e5', opts)).toBe('1e5')
    expect(inferCell('abc', opts)).toBe('abc')
  })
})
