import { describe, expect, it } from 'vitest'
import { convertFrom, formatIssue } from '../utils/convert'

describe('yaml-prop-json 三向转换', () => {
  it('JSON 源同时产出 YAML 与 Properties', () => {
    const out = convertFrom('json', '{"app":{"name":"devutils"},"port":8080}')
    expect(out.error).toBeUndefined()
    expect(out.yaml).toContain('name: devutils')
    expect(out.properties).toBe('app.name=devutils\nport=8080')
  })

  it('YAML 源同时产出 JSON 与 Properties', () => {
    const out = convertFrom('yaml', 'app:\n  name: devutils')
    expect(out.error).toBeUndefined()
    expect(out.json).toBe('{\n  "app": {\n    "name": "devutils"\n  }\n}')
    expect(out.properties).toBe('app.name=devutils')
  })

  it('Properties 源同时产出 JSON 与 YAML', () => {
    const out = convertFrom('properties', 'servers[0].url=https://a.example.com')
    expect(out.error).toBeUndefined()
    expect(out.json).toContain('https://a.example.com')
    expect(out.yaml).toContain('- url: https://a.example.com')
  })

  it('YAML 超限整数在 JSON 侧原样保留为数字字面量', () => {
    const out = convertFrom('yaml', 'id: 1892837482910293847')
    expect(out.error).toBeUndefined()
    expect(out.json).toContain('1892837482910293847')
    expect(out.json).not.toContain('"1892837482910293847"')
  })

  it('JSON 超限整数经 YAML 往返后类型与数值都不变', () => {
    const once = convertFrom('json', '{"id":1892837482910293847}')
    const back = convertFrom('yaml', once.yaml)
    expect(back.error).toBeUndefined()
    expect(back.json).toBe('{\n  "id": 1892837482910293847\n}')
  })

  it('多文档与注释分别给出 warning', () => {
    const yamlOut = convertFrom('yaml', 'a: 1\n---\nb: 2')
    expect(yamlOut.warnings.some(item => item.includes('文档'))).toBe(true)
    const propOut = convertFrom('properties', '# note\na=1')
    expect(propOut.warnings.some(item => item.includes('注释'))).toBe(true)
  })

  it('非法输入返回 error 且不产出内容', () => {
    const bad = convertFrom('json', '{"a":}')
    expect(bad.error).toBeTruthy()
    expect(bad.yaml).toBe('')
    expect(bad.properties).toBe('')
  })

  it('非法 YAML 的错误信息带行列', () => {
    const bad = convertFrom('yaml', 'a: [1, 2')
    expect(bad.error).toContain('第 1 行')
  })

  it('非常规 tag 被拦下', () => {
    const bad = convertFrom('yaml', 'data: !!binary "aGk="')
    expect(bad.error).toBeTruthy()
    expect(bad.json).toBe('')
  })

  it('空输入返回空结果且不报错', () => {
    const out = convertFrom('json', '   ')
    expect(out.error).toBeUndefined()
    expect(out.json).toBe('')
    expect(out.warnings).toEqual([])
  })

  it('formatIssue 组合行列信息', () => {
    expect(formatIssue('缩进错误', 3, 5)).toBe('第 3 行第 5 列：缩进错误')
    expect(formatIssue('缩进错误', 3)).toBe('第 3 行：缩进错误')
    expect(formatIssue('缩进错误')).toBe('缩进错误')
  })
})
