import { describe, expect, it } from 'vitest'
import { applyReplace, buildSegments, compileRegex, runMatches } from '../utils/regexTester'
import { REGEX_PRESETS } from '../utils/regexPresets'

const must = (pattern: string, flags = '') => {
  const { regex, error } = compileRegex(pattern, flags)
  if (!regex) throw new Error(`编译失败: ${error}`)
  return regex
}

describe('regex 测试器', () => {
  it('非法正则返回 error 而不是抛异常', () => {
    const { regex, error } = compileRegex('([a-z', 'g')
    expect(regex).toBeUndefined()
    expect(error).toBeTruthy()
    expect(compileRegex('', 'g').error).toBe('请输入正则表达式')
  })

  it('未指定 g 时内部补 g，列出全部匹配', () => {
    const result = runMatches('a1 b2 c3', must('\\d'))
    expect(result.error).toBeUndefined()
    expect(result.matches.map(m => m.value)).toEqual(['1', '2', '3'])
    expect(result.matches.map(m => m.index)).toEqual([1, 4, 7])
  })

  it('收集编号与命名捕获组', () => {
    const result = runMatches('2026-09-28', must('(?<y>\\d{4})-(?<m>\\d{2})-(?<d>\\d{2})'))
    const groups = result.matches[0].groups
    expect(groups.find(g => g.index === 1)?.value).toBe('2026')
    expect(groups.find(g => g.name === 'm')?.value).toBe('09')
  })

  it('零长度匹配不会死循环', () => {
    const result = runMatches('abc', must('x*'))
    expect(result.matches.length).toBe(4)
    expect(result.truncated).toBe(false)
  })

  it('粘性 y 按连续语义匹配，遇到不连续即停止', () => {
    const result = runMatches('aaXaa', must('a', 'y'))
    expect(result.matches.map(m => m.index)).toEqual([0, 1])
  })

  it('超过上限时截断并标记 truncated', () => {
    const result = runMatches('aaaaaaaaaa', must('a'), 3)
    expect(result.matches).toHaveLength(3)
    expect(result.truncated).toBe(true)
  })

  it('空文本返回空结果且不报错', () => {
    expect(runMatches('', must('a'))).toEqual({ matches: [], truncated: false })
  })

  it('替换支持 $1 / $& / $$', () => {
    expect(applyReplace('a1b2', must('(\\d)'), '[$1]')).toBe('a[1]b[2]')
    expect(applyReplace('a1b2', must('\\d'), '<$&>')).toBe('a<1>b<2>')
    expect(applyReplace('a1', must('\\d'), '$$')).toBe('a$')
    expect(applyReplace('abc', must('\\d'), 'X')).toBe('abc')
  })

  it('buildSegments 拼回原文与输入完全一致', () => {
    for (const text of ['a1b22c', 'abc', '', ' 1 ']) {
      const matches = runMatches(text, must('\\d+')).matches
      const joined = buildSegments(text, matches).map(s => s.text).join('')
      expect(joined).toBe(text)
    }
  })

  it('内置规则库能匹配各自样例', () => {
    expect(REGEX_PRESETS.length).toBeGreaterThanOrEqual(4)
    for (const preset of REGEX_PRESETS) {
      const { regex, error } = compileRegex(preset.pattern, preset.flags)
      expect(error, preset.name).toBeUndefined()
      expect(regex?.test(preset.sample), preset.name).toBe(true)
    }
  })
})
