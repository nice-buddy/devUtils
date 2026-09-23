import { describe, expect, it } from 'vitest'
import {
  containsBigInt,
  containsOutOfInt64,
  fitsInt64,
  inferFromJson,
  inferType,
  mergeTypes
} from '../utils/typeInfer'

describe('json-to-types 类型推导', () => {
  it('区分整数与小数，并按 bigint 判定超大整数', () => {
    expect(inferType(7)).toEqual({ kind: 'primitive', name: 'integer', maxAbs: '7' })
    expect(inferType(7.5)).toEqual({ kind: 'primitive', name: 'number' })
    expect(inferType(true)).toEqual({ kind: 'primitive', name: 'boolean' })
    expect(inferType('a')).toEqual({ kind: 'primitive', name: 'string' })
    expect(inferType(10n ** 30n)).toEqual({
      kind: 'primitive',
      name: 'integer',
      big: true,
      maxAbs: '1000000000000000000000000000000'
    })
  })

  it('从 JSON 文本推导时能识别 19 位雪花 ID 为 bigint 分支', () => {
    const { root, error } = inferFromJson('{"id":1892837482910293847}')
    expect(error).toBeUndefined()
    expect(root).toEqual({
      kind: 'object',
      fields: [
        {
          key: 'id',
          type: { kind: 'primitive', name: 'integer', big: true, maxAbs: '1892837482910293847' },
          optional: false
        }
      ]
    })
  })

  it('数组全量合并元素，缺 key 的字段标记为可选', () => {
    const { root } = inferFromJson('[{"a":1},{"b":"x"}]')
    expect(root).toEqual({
      kind: 'array',
      element: {
        kind: 'object',
        fields: [
          { key: 'a', type: { kind: 'primitive', name: 'integer', maxAbs: '1' }, optional: true },
          { key: 'b', type: { kind: 'primitive', name: 'string' }, optional: true }
        ]
      }
    })
  })

  it('类型冲突得到联合类型，integer 与 number 收敛为 number', () => {
    const { root: mixed } = inferFromJson('[1,"a"]')
    expect(mixed).toEqual({
      kind: 'array',
      element: {
        kind: 'union',
        options: [
          { kind: 'primitive', name: 'integer', maxAbs: '1' },
          { kind: 'primitive', name: 'string' }
        ]
      }
    })

    const { root: numeric } = inferFromJson('[1,1.5]')
    expect(numeric).toEqual({ kind: 'array', element: { kind: 'primitive', name: 'number' } })
  })

  it('null 不单独成类型，转成可选字段并附注释', () => {
    const { root } = inferFromJson('{"a":null}')
    expect(root).toEqual({
      kind: 'object',
      fields: [{ key: 'a', type: { kind: 'primitive', name: 'any' }, optional: true, note: '可能为 null' }]
    })

    const { root: arrayWithNull } = inferFromJson('[1,null]')
    expect(arrayWithNull).toEqual({
      kind: 'array',
      element: { kind: 'primitive', name: 'integer', maxAbs: '1' }
    })
  })

  it('空数组与空对象退化为 any / 空字段表', () => {
    const { root: emptyArray } = inferFromJson('[]')
    expect(emptyArray).toEqual({ kind: 'array', element: { kind: 'primitive', name: 'any' } })
    const { root: emptyObject } = inferFromJson('{}')
    expect(emptyObject).toEqual({ kind: 'object', fields: [] })
  })

  it('合并时保留 big 标记与最大绝对值', () => {
    const merged = mergeTypes(
      { kind: 'primitive', name: 'integer', maxAbs: '7' },
      { kind: 'primitive', name: 'integer', big: true, maxAbs: '9223372036854775808' }
    )
    expect(merged).toEqual({
      kind: 'primitive',
      name: 'integer',
      big: true,
      maxAbs: '9223372036854775808'
    })
  })

  it('非法 JSON 返回错误而不是抛异常', () => {
    expect(inferFromJson('{"a":}').error).toBeTruthy()
    expect(inferFromJson('   ')).toEqual({ root: null })
  })

  it('int64 范围判断与 big 识别走十进制字符串', () => {
    expect(fitsInt64('9223372036854775807')).toBe(true)
    expect(fitsInt64('9223372036854775808')).toBe(false)
    expect(fitsInt64(undefined)).toBe(true)
    expect(containsBigInt({ kind: 'primitive', name: 'integer', big: true, maxAbs: '1' })).toBe(true)
    expect(containsOutOfInt64({ kind: 'primitive', name: 'integer', big: true, maxAbs: '7' })).toBe(false)
    expect(
      containsOutOfInt64({
        kind: 'array',
        element: { kind: 'primitive', name: 'integer', big: true, maxAbs: '9223372036854775808' }
      })
    ).toBe(true)
  })
})
