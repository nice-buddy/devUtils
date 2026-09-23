import { describe, expect, it } from 'vitest'
import { convertAllCases, splitWords, toCase } from '../utils/caseConvert'

describe('radix-case 命名风格', () => {
  it('按标准边界切词', () => {
    expect(splitWords('HTTPServer')).toEqual(['HTTP', 'Server'])
    expect(splitWords('getHTTPResponse')).toEqual(['get', 'HTTP', 'Response'])
    expect(splitWords('XML2JSON')).toEqual(['XML2', 'JSON'])
    expect(splitWords('user2Id')).toEqual(['user2', 'Id'])
    // 规则 3 优先：IPv4 按连续大写规则切为 I + Pv4（spec 5.7 的 ip_v4_address 已作废）。
    expect(splitWords('IPv4Address')).toEqual(['I', 'Pv4', 'Address'])
    expect(splitWords('snake_case-name.dot')).toEqual(['snake', 'case', 'name', 'dot'])
  })

  it('输出七种命名风格', () => {
    const result = convertAllCases('HTTPServer')
    expect(result.map(item => item.value)).toEqual([
      'httpServer',
      'HttpServer',
      'http_server',
      'HTTP_SERVER',
      'http-server',
      'http.server',
      'Http Server'
    ])
  })

  it('空输入返回空字符串', () => {
    expect(toCase('', 'snake')).toBe('')
    expect(convertAllCases('   ').every(item => item.value === '')).toBe(true)
  })
})
