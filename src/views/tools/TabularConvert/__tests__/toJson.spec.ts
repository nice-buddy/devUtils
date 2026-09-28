import { describe, expect, it } from 'vitest'
import { rowsToArrayOfArrays, rowsToJsonArray } from '../utils/toJson'

describe('tabular-convert JSON 输出', () => {
  it('对象数组按表头为键', () => {
    const output = rowsToJsonArray(['id', 'name'], [['1', '张三']], { emptyAsNull: true })
    expect(output).toBe('[\n  {\n    "id": 1,\n    "name": "张三"\n  }\n]')
  })

  it('数组的数组可选输出表头', () => {
    expect(rowsToArrayOfArrays([['1', '2']], { emptyAsNull: true, includeHeader: false })).toBe('[\n  [\n    1,\n    2\n  ]\n]')
    expect(rowsToArrayOfArrays([['1', '2']], { emptyAsNull: true, includeHeader: true, headers: ['a', 'b'] })).toBe('[\n  [\n    "a",\n    "b"\n  ],\n  [\n    1,\n    2\n  ]\n]')
  })
})
