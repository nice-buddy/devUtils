import { describe, expect, it } from 'vitest'
import { detectDelimiter } from '../utils/delimiter'
import { parseDelimitedText } from '../utils/parseTable'

describe('tabular-convert 解析', () => {
  it('探测制表符 / 逗号 / 分号 / 竖线', () => {
    expect(detectDelimiter('a\tb\nc\td')).toBe('\t')
    expect(detectDelimiter('a,b\nc,d')).toBe(',')
    expect(detectDelimiter('a;b\nc;d')).toBe(';')
    expect(detectDelimiter('a|b\nc|d')).toBe('|')
  })

  it('单列文本不误判为多列', () => {
    expect(parseDelimitedText('name\n张三\n李四', { hasHeader: true }).headers).toEqual(['name'])
  })

  it('解析带引号字段与 "" 转义', () => {
    const table = parseDelimitedText('a,b\n"x,1","say ""hi"""', { delimiter: ',', hasHeader: true })
    expect(table.rows).toEqual([['x,1', 'say "hi"']])
  })

  it('字段内换行与 CRLF 被正确处理', () => {
    const table = parseDelimitedText('a,b\r\n"line1\nline2",2\r\n', { delimiter: ',', hasHeader: true })
    expect(table.rows).toEqual([['line1\nline2', '2']])
  })

  it('跳过完全空行并计数', () => {
    const table = parseDelimitedText('a,b\n\n1,2\n\n', { delimiter: ',', hasHeader: true })
    expect(table.rows).toEqual([['1', '2']])
    expect(table.skippedBlankLines).toBeGreaterThanOrEqual(1)
  })

  it('列数不足按空值补齐，列数超出记告警', () => {
    const table = parseDelimitedText('a,b,c\n1,2\n1,2,3,4', { delimiter: ',', hasHeader: true })
    expect(table.rows[0]).toEqual(['1', '2', ''])
    expect(table.warnings[0].message).toContain('列数')
  })

  it('表头为空回退 colN，重复表头追加 _2', () => {
    const table = parseDelimitedText('a,,a\n1,2,3', { delimiter: ',', hasHeader: true })
    expect(table.headers).toEqual(['a', 'col2', 'a_2'])
  })

  it('关闭表头开关时列名为 col1..colN', () => {
    const table = parseDelimitedText('1,2\n3,4', { delimiter: ',', hasHeader: false })
    expect(table.headers).toEqual(['col1', 'col2'])
    expect(table.rows).toHaveLength(2)
  })
})
