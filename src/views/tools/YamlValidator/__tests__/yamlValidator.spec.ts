import { describe, expect, it } from 'vitest'
import { validateYaml } from '../utils/yamlValidator'

describe('yaml-validator 校验与格式化', () => {
  it('合法 YAML 通过校验并输出规范化结果', () => {
    const result = validateYaml('a:   1\nb:\n    c: 2')
    expect(result.valid).toBe(true)
    expect(result.error).toBeUndefined()
    expect(result.output).toBe('a: 1\nb:\n  c: 2')
  })

  it('非法 YAML 返回行列定位且不输出内容', () => {
    const result = validateYaml('a: [1, 2')
    expect(result.valid).toBe(false)
    expect(result.error).toBeTruthy()
    expect(result.line).toBe(1)
    expect(result.output).toBe('')
  })

  it('缩进错误能被定位到具体行', () => {
    const result = validateYaml('a:\n  b: 1\n c: 2')
    expect(result.valid).toBe(false)
    expect(typeof result.line).toBe('number')
  })

  it('非常规 tag 被拦下', () => {
    const result = validateYaml('data: !!binary "aGk="')
    expect(result.valid).toBe(false)
    expect(result.error).toBeTruthy()
    expect(result.line).toBe(1)
  })

  it('compact 模式输出单行 flow 风格', () => {
    const result = validateYaml('a:\n  b:\n    - 1\n    - 2', 'compact')
    expect(result.valid).toBe(true)
    expect(result.output.includes('\n')).toBe(false)
  })

  it('多文档给出 warning 并只校验首个', () => {
    const result = validateYaml('a: 1\n---\nb: 2')
    expect(result.valid).toBe(true)
    expect(result.warnings.some(item => item.includes('文档'))).toBe(true)
  })

  it('空输入通过校验且不产出内容', () => {
    const result = validateYaml('   ')
    expect(result.valid).toBe(true)
    expect(result.output).toBe('')
    expect(result.warnings).toEqual([])
  })
})
