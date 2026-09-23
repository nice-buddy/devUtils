import { describe, expect, it } from 'vitest'
import { parseProperties, stringifyProperties } from '../utils/properties'

describe('yaml-prop-json 的 Properties 解析', () => {
  it('点分键展开为嵌套对象', () => {
    const { value, error } = parseProperties('a.b.c=1')
    expect(error).toBeUndefined()
    expect(value).toEqual({ a: { b: { c: '1' } } })
  })

  it('中括号与纯数字两种数组写法等价', () => {
    const bracket = parseProperties('servers[0].url=a\nservers[1].url=b')
    const dotted = parseProperties('servers.0.url=a\nservers.1.url=b')
    expect(bracket.value).toEqual({ servers: [{ url: 'a' }, { url: 'b' }] })
    expect(dotted.value).toEqual(bracket.value)
  })

  it('忽略注释行并统计被丢弃的行数', () => {
    const { value, warnings } = parseProperties('# c1\n! c2\na=1')
    expect(value).toEqual({ a: '1' })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('2')
  })

  it('无等号键按空值处理，转义点号不拆层', () => {
    expect(parseProperties('flag').value).toEqual({ flag: '' })
    expect(parseProperties('a\\.b=1').value).toEqual({ 'a.b': '1' })
  })

  it('键冲突报错而不是覆盖', () => {
    const { error } = parseProperties('a=1\na.b=2')
    expect(error).toBeTruthy()
  })

  it('值一律保持字符串，不做类型推断', () => {
    expect(parseProperties('n=123\nb=true').value).toEqual({ n: '123', b: 'true' })
  })

  it('空输入返回空对象', () => {
    expect(parseProperties('   ').value).toEqual({})
  })
})

describe('yaml-prop-json 的 Properties 生成', () => {
  it('嵌套对象压平为点分键', () => {
    expect(stringifyProperties({ a: { b: '1' } })).toBe('a.b=1')
  })

  it('数组统一输出中括号风格', () => {
    expect(stringifyProperties({ servers: [{ url: 'a' }, { url: 'b' }] })).toBe(
      'servers[0].url=a\nservers[1].url=b'
    )
  })

  it('往返无损', () => {
    const text = 'a.b=1\nservers[0].url=x\nflag='
    expect(stringifyProperties(parseProperties(text).value)).toBe(text)
  })

  it('空对象与空值都有确定输出', () => {
    expect(stringifyProperties({})).toBe('')
    expect(stringifyProperties({ a: '' })).toBe('a=')
  })
})
