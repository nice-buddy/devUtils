import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { formatJson, minifyJson } from '../utils/losslessJson'
import { repairJson } from '../utils/jsonRepair'
import { queryJsonPath } from '../utils/jsonPath'

describe('JSON 深度套件', () => {
  it('在数组与深层嵌套中 100% 精确保留 19 位雪花数值字面量', () => {
    const input = '{"ids":[1892837482910293847,1892837482910293848],"nested":{"order":9223372036854775807}}'
    const formatted = formatJson(input, 2, false)
    expect(formatted).toContain('1892837482910293847')
    expect(formatted).toContain('9223372036854775807')
    expect(formatted).not.toContain('1892837482910293800')

    const minified = minifyJson(formatted)
    expect(minified).toContain('1892837482910293847')
  })

  it('支持按键名首字母递归排序 (sortKeys)', () => {
    const input = '{"z": 1, "a": {"d": 4, "b": 2}, "id": 1892837482910293847}'
    const formatted = formatJson(input, 2, true)
    const lines = formatted.split('\n').map(l => l.trim())
    const firstKeyIndex = lines.findIndex(l => l.startsWith('"a":'))
    const idKeyIndex = lines.findIndex(l => l.startsWith('"id":'))
    const zKeyIndex = lines.findIndex(l => l.startsWith('"z":'))
    expect(firstKeyIndex).toBeLessThan(idKeyIndex)
    expect(idKeyIndex).toBeLessThan(zKeyIndex)
    expect(formatted).toContain('1892837482910293847')
  })

  it('智能容错修复单引号与尾随逗号', () => {
    const invalid = "{ 'name': 'devutils', 'tags': ['tool',], }"
    const repaired = repairJson(invalid)
    expect(() => JSON.parse(repaired)).not.toThrow()
    expect(repaired).toContain('"name": "devutils"')
  })

  it('智能清除单行与多行注释', () => {
    const withComments = `
      // 单行配置说明
      {
        /* 多行
           配置说明 */
        "url": "http://localhost:8080//api", // 行尾注释
        'enabled': true,
      }
    `
    const repaired = repairJson(withComments)
    expect(() => JSON.parse(repaired)).not.toThrow()
    const parsed = JSON.parse(repaired)
    expect(parsed.url).toBe('http://localhost:8080//api')
    expect(parsed.enabled).toBe(true)
  })

  it('精准执行简易 JSONPath 属性提取', () => {
    const json = '{"user":{"profile":{"name":"alice"}}}'
    const res = queryJsonPath(json, '$.user.profile.name')
    expect(res).toBe('"alice"')
  })

  it('JSONPath 支持数组下标与大整数子树无损提取', () => {
    const json = '{"items":[{"id":1892837482910293847,"label":"item1"},{"id":1892837482910293848,"label":"item2"}]}'
    const resId = queryJsonPath(json, '$.items[0].id')
    expect(resId).toBe('1892837482910293847')

    const resSubtree = queryJsonPath(json, '$.items[0]')
    expect(resSubtree).toContain('1892837482910293847')
    expect(resSubtree).toContain('"label": "item1"')

    const resArray = queryJsonPath(json, '$.items[*].id')
    expect(resArray).toContain('1892837482910293847')
    expect(resArray).toContain('1892837482910293848')
  })

  it('CodeMirror readOnly 状态支持程序化 dispatch 事务更新并保持只读配置', () => {
    const state = EditorState.create({
      doc: '{"initial": 1}',
      extensions: [EditorState.readOnly.of(true)]
    })
    expect(state.readOnly).toBe(true)

    const tr = state.update({
      changes: { from: 0, to: state.doc.length, insert: '{"updated": 2}' }
    })
    expect(tr.state.doc.toString()).toBe('{"updated": 2}')
    expect(tr.state.readOnly).toBe(true)
  })
})
