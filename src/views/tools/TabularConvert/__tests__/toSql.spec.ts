import { describe, expect, it } from 'vitest'
import { rowsToInsertSql } from '../utils/toSql'

const headers = ['id', 'name']
const rows = [['1', 'a'], ['2', 'b']]

describe('tabular-convert SQL 输出', () => {
  it('MySQL 用反引号引用标识符，布尔用 TRUE/FALSE', () => {
    expect(rowsToInsertSql('mysql', 't', ['flag'], [['true']], { multiRow: false })).toBe('INSERT INTO `t` (`flag`) VALUES (TRUE);')
  })

  it('SQL Server 用方括号引用标识符，布尔用 1/0', () => {
    expect(rowsToInsertSql('transactsql', 't', ['flag'], [['false']], { multiRow: false })).toBe('INSERT INTO [t] ([flag]) VALUES (0);')
  })

  it('PostgreSQL 用双引号，null 输出 NULL', () => {
    expect(rowsToInsertSql('postgresql', 't', ['a'], [['']], { multiRow: false })).toBe('INSERT INTO "t" ("a") VALUES (NULL);')
  })

  it('单引号双写，MySQL 额外转义反斜杠', () => {
    expect(rowsToInsertSql('sqlite', 't', ['a'], [["it's"]], { multiRow: false })).toBe("INSERT INTO \"t\" (\"a\") VALUES ('it''s');")
    expect(rowsToInsertSql('mysql', 't', ['a'], [['a\\b']], { multiRow: false })).toBe("INSERT INTO `t` (`a`) VALUES ('a\\\\b');")
  })

  it('标识符内的引用符按方言双写', () => {
    expect(rowsToInsertSql('postgresql', 't', ['a"b'], [['1']], { multiRow: false })).toBe('INSERT INTO "t" ("a""b") VALUES (1);')
    expect(rowsToInsertSql('transactsql', 't', ['a]b'], [['1']], { multiRow: false })).toBe('INSERT INTO [t] ([a]]b]) VALUES (1);')
  })

  it('多行批量按 batchSize 分块', () => {
    const sql = rowsToInsertSql('mysql', 't', headers, rows, { multiRow: true, batchSize: 2 })
    expect(sql).toBe('INSERT INTO `t` (`id`, `name`) VALUES (1, \'a\'), (2, \'b\');')
  })

  it('六种方言都能生成语句', () => {
    for (const dialect of ['sql', 'mysql', 'postgresql', 'sqlite', 'transactsql', 'plsql'] as const) {
      const sql = rowsToInsertSql(dialect, 't', headers, [rows[0]], { multiRow: false })
      expect(sql.startsWith('INSERT INTO')).toBe(true)
      expect(sql.endsWith(';')).toBe(true)
    }
  })
})
