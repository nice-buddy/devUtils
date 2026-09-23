import { describe, expect, it } from 'vitest'
import { parseYamlSource, stringifyYamlSource } from '../yamlAdapter'

describe('yamlAdapter 解析', () => {
  it('解析普通 YAML 并把超限整数保留为 bigint', () => {
    const { value, error } = parseYamlSource('id: 1892837482910293847')
    expect(error).toBeUndefined()
    expect(value).toEqual({ id: 1892837482910293847n })
  })

  it('多文档只取第一个并给出 warning', () => {
    const { value, warnings } = parseYamlSource('a: 1\n---\nb: 2')
    expect(value).toEqual({ a: 1n })
    expect(warnings.some(item => item.includes('文档'))).toBe(true)
  })

  it('锚点与引用就地展开为独立副本', () => {
    const { value } = parseYamlSource('base: &b\n  x: 1\ncopy: *b')
    expect(value).toEqual({ base: { x: 1n }, copy: { x: 1n } })
  })

  it('非常规 tag 报错并给出行列定位', () => {
    const { value, error } = parseYamlSource('data: !!binary "aGk="')
    expect(value).toBeNull()
    expect(error).toBeTruthy()
    expect(error?.line).toBe(1)
    expect(typeof error?.column).toBe('number')
  })

  it('未知自定义 tag 同样被拦下', () => {
    const { error } = parseYamlSource('data: !custom foo')
    expect(error).toBeTruthy()
  })

  it('非法语法返回行列定位', () => {
    const { error } = parseYamlSource('a: [1, 2')
    expect(error).toBeTruthy()
    expect(error?.line).toBe(1)
  })

  it('空输入返回空值且不报错', () => {
    const { value, error, warnings } = parseYamlSource('   ')
    expect(value).toBeNull()
    expect(error).toBeUndefined()
    expect(warnings).toEqual([])
  })
})

describe('yamlAdapter 序列化', () => {
  it('pretty 模式输出多行缩进 YAML', () => {
    const out = stringifyYamlSource({ a: { b: 1 } }, 'pretty')
    expect(out).toBe('a:\n  b: 1')
  })

  it('compact 模式输出单行 flow 风格', () => {
    const out = stringifyYamlSource({ a: { b: [1, 2] } }, 'compact')
    expect(out.includes('\n')).toBe(false)
    expect(out).toContain('{')
  })

  it('bigint 能被正常序列化', () => {
    expect(stringifyYamlSource({ id: 1892837482910293847n }, 'pretty')).toBe('id: 1892837482910293847')
  })
})
