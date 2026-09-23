import { describe, expect, it } from 'vitest'
import { DIALECTS, formatSql } from '../utils/sqlFormat'

describe('sqlFormat 格式化', () => {
  it('暴露 6 种常用方言', () => {
    expect(DIALECTS.map(d => d.value)).toEqual(['sql', 'mysql', 'postgresql', 'sqlite', 'transactsql', 'plsql'])
  })

  it('按方言格式化并大写关键字', () => {
    const result = formatSql('select id, name from users where id=1', 'mysql', 'upper')
    expect(result.error).toBeUndefined()
    expect(result.output).toContain('SELECT')
    expect(result.output).toContain('FROM')
    expect(result.output).toContain('WHERE')
    expect(result.output.split('\n').length).toBeGreaterThan(1)
  })

  it('关键字小写', () => {
    const result = formatSql('SELECT 1', 'sql', 'lower')
    expect(result.output).toContain('select')
  })

  it('关键字保持原样', () => {
    const result = formatSql('Select 1', 'sql', 'preserve')
    expect(result.output).toContain('Select')
  })

  it('六种方言都能格式化同一段 SQL', () => {
    for (const dialect of DIALECTS.map(d => d.value)) {
      const result = formatSql('select a from t', dialect, 'upper')
      expect(result.error).toBeUndefined()
      expect(result.output).toContain('SELECT')
    }
  })

  it('无法解析的输入返回 error 而不是抛异常', () => {
    const result = formatSql("SELECT 'unterminated", 'sql', 'upper')
    expect(result.error).toBeTruthy()
    expect(result.output).toBe('')
  })

  it('空输入返回空结果且不报错', () => {
    expect(formatSql('   ', 'sql', 'upper')).toEqual({ output: '' })
  })
})
