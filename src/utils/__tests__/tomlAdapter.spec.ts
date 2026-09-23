import { describe, expect, it } from 'vitest'
import { parseTomlSource, stringifyTomlSource } from '../tomlAdapter'

describe('tomlAdapter', () => {
  it('解析 TOML 表与数组表', () => {
    const { value, error } = parseTomlSource('[a]\nb = 1\n\n[[c]]\nd = 2')
    expect(error).toBeUndefined()
    expect(value).toEqual({ a: { b: 1 }, c: [{ d: 2 }] })
  })

  it('非法语法返回行列定位', () => {
    const { error } = parseTomlSource('a = ')
    expect(error).toBeTruthy()
    expect(typeof error?.line).toBe('number')
  })

  it('空输入返回空值且不报错', () => {
    const { value, error } = parseTomlSource('   ')
    expect(value).toBeNull()
    expect(error).toBeUndefined()
  })

  it('序列化输出规范化 TOML', () => {
    const out = stringifyTomlSource({ a: { b: 1 } })
    expect(out).toContain('[a]')
    expect(out).toContain('b = 1')
  })
})
