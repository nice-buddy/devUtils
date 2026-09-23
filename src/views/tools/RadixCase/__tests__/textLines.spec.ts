import { describe, expect, it } from 'vitest'
import { DEFAULT_LINE_OPTIONS, processLines, type LineOptions } from '../utils/textLines'

const base: LineOptions = { ...DEFAULT_LINE_OPTIONS, trimEdge: false, dropBlank: false }

describe('radix-case 文本行处理', () => {
  it('兼容 CRLF 与 LF，输出统一为 LF', () => {
    const result = processLines('a\r\nb\nc', base)
    expect(result.text).toBe('a\nb\nc')
    expect(result.inputCount).toBe(3)
  })

  it('管道顺序为 trimEdge → dropBlank → dedupe → sort → 拼接前后缀', () => {
    const result = processLines('  b  \r\n\r\n  a  \r\n  a  \r\n', {
      ...base,
      trimEdge: true,
      dropBlank: true,
      dedupe: true,
      sort: 'asc',
      prefix: '-',
      suffix: '!'
    })
    expect(result.lines).toEqual(['-a!', '-b!'])
    expect(result.outputCount).toBe(2)
  })

  it('去重与排序受 ignoreCase 控制', () => {
    expect(processLines('b\nA\na', { ...base, dedupe: true, ignoreCase: true }).lines).toEqual(['b', 'A'])
    expect(processLines('b\nA\na', { ...base, sort: 'asc', ignoreCase: true }).lines).toEqual(['A', 'a', 'b'])
  })

  it('降序排序与空输入都有确定行为', () => {
    expect(processLines('a\nc\nb', { ...base, sort: 'desc' }).lines).toEqual(['c', 'b', 'a'])
    expect(processLines('', base).text).toBe('')
    expect(processLines('', base).inputCount).toBe(0)
  })
})
