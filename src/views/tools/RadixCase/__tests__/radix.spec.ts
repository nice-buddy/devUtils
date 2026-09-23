import { describe, expect, it } from 'vitest'
import { convertAll } from '../utils/radix'

describe('radix-case 进制转换', () => {
  it('同时输出四种进制，并支持前缀与大小写选项', () => {
    expect(convertAll('255', 10, { prefix: false, upper: false }).values).toEqual({
      2: '11111111',
      8: '377',
      10: '255',
      16: 'ff'
    })
    const prefixed = convertAll('255', 10, { prefix: true, upper: true })
    expect(prefixed.values[16]).toBe('0xFF')
    expect(prefixed.values[2]).toBe('0b11111111')
  })

  it('支持超过 64 位的大数与负数（数学符号表示）', () => {
    const big = convertAll('18446744073709551616', 10, { prefix: false, upper: false })
    expect(big.values[16]).toBe('10000000000000000')
    const negative = convertAll('-FF', 16, { prefix: true, upper: false })
    expect(negative.values[10]).toBe('-255')
    expect(negative.values[16]).toBe('-0xff')
  })

  it('容忍进制前缀与下划线分隔符', () => {
    expect(convertAll('0x_ff', 16, { prefix: false, upper: false }).values[10]).toBe('255')
  })

  it('非法字符给出错误信息且不输出结果', () => {
    const result = convertAll('12z', 10, { prefix: false, upper: false })
    expect(result.error).toContain('z')
    expect(result.errorIndex).toBe(2)
    expect(result.values[10]).toBe('')
  })

  it('空输入返回空结果且不报错', () => {
    const result = convertAll('   ', 10, { prefix: false, upper: false })
    expect(result.error).toBeUndefined()
    expect(result.values[10]).toBe('')
  })
})
