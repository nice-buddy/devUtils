import { describe, expect, it } from 'vitest'
import { buildUrl, parseQuery, parseUrl } from '../utils/urlParser'

describe('url-parser 解析与构造', () => {
  it('拆解复杂 URL 的各个部分并保留重复 key 与无值参数', () => {
    const parsed = parseUrl('https://user:pass@example.com:8443/a/b?x=1&x=2&flag#frag')
    expect(parsed.valid).toBe(true)
    expect(parsed.protocol).toBe('https')
    expect(parsed.username).toBe('user')
    expect(parsed.password).toBe('pass')
    expect(parsed.host).toBe('example.com')
    expect(parsed.port).toBe('8443')
    expect(parsed.path).toBe('/a/b')
    expect(parsed.hash).toBe('frag')
    expect(parsed.entries).toEqual([
      { key: 'x', value: '1', enabled: true, hasEquals: true },
      { key: 'x', value: '2', enabled: true, hasEquals: true },
      { key: 'flag', value: '', enabled: true, hasEquals: false }
    ])
  })

  it('缺协议时按 https 试解析并打标', () => {
    const parsed = parseUrl('example.com/p?q=1')
    expect(parsed.valid).toBe(true)
    expect(parsed.schemeInserted).toBe(true)
    expect(parsed.protocol).toBe('https')
    expect(parsed.host).toBe('example.com')
  })

  it('支持 IPv6 主机与端口', () => {
    const parsed = parseUrl('https://[2001:db8::1]:8080/p')
    expect(parsed.host).toBe('2001:db8::1')
    expect(buildUrl(parsed)).toBe('https://[2001:db8::1]:8080/p')
  })

  it('非法 URL 返回错误标记而不是抛异常', () => {
    const parsed = parseUrl('http://')
    expect(parsed.valid).toBe(false)
    expect(parsed.error).toBeTruthy()
  })

  it('解码后的值重新拼装是幂等的', () => {
    const raw = 'https://example.com/search?q=a+b&tag=%E4%B8%AD%E6%96%87#top'
    const once = parseUrl(raw)
    expect(once.entries[0]).toEqual({ key: 'q', value: 'a b', enabled: true, hasEquals: true })
    expect(parseUrl(buildUrl(once))).toEqual(once)
  })

  it('字面量 %20 不会被当成已编码序列放行', () => {
    const parsed = parseUrl('https://example.com/?q=foo%2520bar')
    expect(parsed.entries[0].value).toBe('foo%20bar')
    expect(buildUrl(parsed)).toBe('https://example.com/?q=foo%2520bar')
  })

  it('autoDecode=false 时原样保留编码文本', () => {
    const parsed = parseUrl('https://example.com/?q=a%20b', false)
    expect(parsed.entries[0].value).toBe('a%20b')
    expect(buildUrl(parsed, false)).toBe('https://example.com/?q=a%20b')
  })

  it('停用的参数不参与拼装，无值参数保持不带等号', () => {
    const parsed = parseUrl('https://example.com/?a=1&flag')
    parsed.entries[0].enabled = false
    expect(buildUrl(parsed)).toBe('https://example.com/?flag')
  })

  it('空 query 与空输入都有确定行为', () => {
    expect(parseQuery('', true)).toEqual([])
    expect(parseUrl('').valid).toBe(true)
    expect(buildUrl(parseUrl(''))).toBe('')
  })
})
