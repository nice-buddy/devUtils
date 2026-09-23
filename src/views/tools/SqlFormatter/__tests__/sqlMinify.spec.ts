import { describe, expect, it } from 'vitest'
import { minifySql } from '../utils/sqlMinify'

describe('sqlMinify 压缩器', () => {
  it('剥离行注释与块注释', () => {
    expect(minifySql('SELECT 1 -- 注释\nFROM t')).toBe('SELECT 1 FROM t')
    expect(minifySql('SELECT /* 块注释 */ 1')).toBe('SELECT 1')
  })

  it('字符串字面量内的注释符号原样保留', () => {
    expect(minifySql("SELECT '-- not comment'")).toBe("SELECT '-- not comment'")
    expect(minifySql("SELECT '/* x */'")).toBe("SELECT '/* x */'")
  })

  it('无空白的双减号不当作注释', () => {
    expect(minifySql('SELECT a--b FROM t')).toBe('SELECT a--b FROM t')
  })

  it('美元引用内部原样保留', () => {
    expect(minifySql('SELECT $$a  -- b$$')).toBe('SELECT $$a  -- b$$')
    expect(minifySql('SELECT $tag$ x  y $tag$')).toBe('SELECT $tag$ x  y $tag$')
  })

  it('保留 MySQL 可执行版本注释', () => {
    expect(minifySql('SELECT /*!40000 SQL_NO_CACHE */ 1')).toBe('SELECT /*!40000 SQL_NO_CACHE */ 1')
  })

  it('反引号与双引号标识符原样保留', () => {
    expect(minifySql('SELECT `a  b` FROM "c  d"')).toBe('SELECT `a  b` FROM "c  d"')
  })

  it('折叠空白并 trim', () => {
    expect(minifySql('SELECT\n    1\nFROM   t')).toBe('SELECT 1 FROM t')
    expect(minifySql('   SELECT 1   ')).toBe('SELECT 1')
  })

  it('单引号内的转义引号不提前结束字符串', () => {
    expect(minifySql("SELECT 'it''s  ok'")).toBe("SELECT 'it''s  ok'")
  })

  it('空输入返回空串', () => {
    expect(minifySql('   ')).toBe('')
  })
})
