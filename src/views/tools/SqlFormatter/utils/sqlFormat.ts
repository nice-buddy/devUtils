import { format } from 'sql-formatter'

export type SqlDialect = 'sql' | 'mysql' | 'postgresql' | 'sqlite' | 'transactsql' | 'plsql'

export type KeywordCase = 'upper' | 'lower' | 'preserve'

export const DIALECTS: { label: string; value: SqlDialect }[] = [
  { label: '标准 SQL', value: 'sql' },
  { label: 'MySQL', value: 'mysql' },
  { label: 'PostgreSQL', value: 'postgresql' },
  { label: 'SQLite', value: 'sqlite' },
  { label: 'SQL Server', value: 'transactsql' },
  { label: 'Oracle', value: 'plsql' }
]

export const KEYWORD_CASES: { label: string; value: KeywordCase }[] = [
  { label: '大写', value: 'upper' },
  { label: '小写', value: 'lower' },
  { label: '保持原样', value: 'preserve' }
]

export function formatSql(
  text: string,
  dialect: SqlDialect,
  keywordCase: KeywordCase
): { output: string; error?: string } {
  if (!text.trim()) return { output: '' }
  try {
    const output = format(text, {
      language: dialect,
      keywordCase,
      tabWidth: 2,
      linesBetweenQueries: 2
    })
    return { output }
  } catch (err) {
    return { output: '', error: err instanceof Error ? err.message : 'SQL 格式化失败' }
  }
}
