import { describe, expect, it } from 'vitest'
import { validateToml } from '../utils/tomlValidator'

describe('toml-validator 校验与格式化', () => {
  it('合法 TOML 通过校验并输出规范化结果', () => {
    const result = validateToml('[a]\nb=1')
    expect(result.valid).toBe(true)
    expect(result.error).toBeUndefined()
    expect(result.output).toContain('[a]')
    expect(result.output).toContain('b = 1')
  })

  it('支持内联表与数组表', () => {
    const result = validateToml('point = { x = 1, y = 2 }\n\n[[items]]\nid = 1')
    expect(result.valid).toBe(true)
    expect(result.output).toContain('x = 1')
    expect(result.output).toContain('[[items]]')
  })

  it('未闭合字符串报错并定位', () => {
    const result = validateToml('a = "unterminated')
    expect(result.valid).toBe(false)
    expect(result.error).toBeTruthy()
    expect(typeof result.line).toBe('number')
    expect(result.output).toBe('')
  })

  it('重复键报错', () => {
    const result = validateToml('[a]\nb = 1\nb = 2')
    expect(result.valid).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('空输入通过校验且不产出内容', () => {
    const result = validateToml('   ')
    expect(result.valid).toBe(true)
    expect(result.output).toBe('')
  })
})
