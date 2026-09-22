import { describe, it, expect } from 'vitest'
import { parseCurl, exportToCurl } from '../utils/curlParser'

describe('cURL 命令行解析与导出', () => {
  it('正确解析 POST、请求头与 JSON Body', () => {
    const curl = `curl -X POST "https://api.example.com/login" -H "Content-Type: application/json" -d '{"user":"test"}'`
    const parsed = parseCurl(curl)
    expect(parsed.method).toBe('POST')
    expect(parsed.url).toBe('https://api.example.com/login')
    expect(parsed.headers['Content-Type']).toBe('application/json')
    expect(parsed.body).toBe('{"user":"test"}')
  })

  it('正确解析换行斜杠转义与多个请求头', () => {
    const curl = `curl 'https://httpbin.org/anything' \\
  -H 'accept: application/json' \\
  -H 'Authorization: Bearer my-secret-token' \\
  --data-raw '{"active":true}'`
    const parsed = parseCurl(curl)
    expect(parsed.method).toBe('POST') // 推导：有 data-raw 且未指定 -X 时推断为 POST
    expect(parsed.url).toBe('https://httpbin.org/anything')
    expect(parsed.headers['accept']).toBe('application/json')
    expect(parsed.headers['Authorization']).toBe('Bearer my-secret-token')
    expect(parsed.body).toBe('{"active":true}')
  })

  it('正确解析简单 GET 请求与 Query 参数', () => {
    const curl = `curl "https://httpbin.org/get?page=1&limit=20"`
    const parsed = parseCurl(curl)
    expect(parsed.method).toBe('GET')
    expect(parsed.url).toBe('https://httpbin.org/get?page=1&limit=20')
    expect(parsed.body).toBe('')
  })

  it('正确导出为标准 cURL 命令', () => {
    const exported = exportToCurl({
      method: 'POST',
      url: 'https://api.example.com/items',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer 123456'
      },
      body: '{"name":"item1"}'
    })

    expect(exported).toContain('curl -X POST "https://api.example.com/items"')
    expect(exported).toContain('-H "Content-Type: application/json"')
    expect(exported).toContain('-H "Authorization: Bearer 123456"')
    expect(exported).toContain(`-d '{"name":"item1"}'`)
  })

  it('正确处理没有 body 且为 GET 的导出', () => {
    const exported = exportToCurl({
      method: 'GET',
      url: 'https://api.example.com/items',
      headers: [{ key: 'Accept', value: 'application/json', enabled: true }]
    })
    expect(exported).toBe('curl -X GET "https://api.example.com/items" -H "Accept: application/json"')
  })

  it('正确跳过禁用的 Header', () => {
    const exported = exportToCurl({
      method: 'GET',
      url: 'https://api.example.com/items',
      headers: [
        { key: 'Accept', value: 'application/json', enabled: true },
        { key: 'Disabled-Header', value: 'test', enabled: false }
      ]
    })
    expect(exported).not.toContain('Disabled-Header')
  })

  it('导出 cURL 支持 Bearer 与 Basic 鉴权', () => {
    const bearerExport = exportToCurl({
      method: 'GET',
      url: 'https://api.example.com/me',
      auth: {
        type: 'bearer',
        bearerToken: 'secret-token-123'
      }
    })
    expect(bearerExport).toContain('-H "Authorization: Bearer secret-token-123"')

    const basicExport = exportToCurl({
      method: 'GET',
      url: 'https://api.example.com/me',
      auth: {
        type: 'basic',
        basicUsername: 'admin',
        basicPassword: 'password123'
      }
    })
    const expectedBase64 = Buffer.from('admin:password123').toString('base64')
    expect(basicExport).toContain(`-H "Authorization: Basic ${expectedBase64}"`)
  })

  it('导出 cURL 支持 API Key 注入 Header 与 Query', () => {
    const headerExport = exportToCurl({
      method: 'GET',
      url: 'https://api.example.com/data',
      auth: {
        type: 'apiKey',
        apiKeyName: 'X-API-KEY',
        apiKeyValue: 'my-key-value',
        apiKeyAddTo: 'header'
      }
    })
    expect(headerExport).toContain('-H "X-API-KEY: my-key-value"')

    const queryExport = exportToCurl({
      method: 'GET',
      url: 'https://api.example.com/data?page=1',
      auth: {
        type: 'apiKey',
        apiKeyName: 'api_key',
        apiKeyValue: 'query-key-123',
        apiKeyAddTo: 'query'
      }
    })
    expect(queryExport).toContain('https://api.example.com/data?page=1&api_key=query-key-123')
  })

  it('导出 cURL 正确序列化 urlencoded 与 form-data 请求体至 -d', () => {
    const urlencodedExport = exportToCurl({
      method: 'POST',
      url: 'https://api.example.com/form',
      bodyType: 'x-www-form-urlencoded',
      urlencodedData: [
        { key: 'user name', value: 'alice&bob', enabled: true },
        { key: 'role', value: 'admin', enabled: true },
        { key: 'ignored', value: 'skip', enabled: false }
      ]
    })
    expect(urlencodedExport).toContain(`-d 'user%20name=alice%26bob&role=admin'`)
    expect(urlencodedExport).toContain('-H "Content-Type: application/x-www-form-urlencoded"')

    const formExport = exportToCurl({
      method: 'POST',
      url: 'https://api.example.com/upload',
      bodyType: 'form-data',
      formData: [
        { key: 'field1', value: 'val1', enabled: true },
        { key: 'field2', value: 'val2', enabled: false }
      ]
    })
    expect(formExport).toContain(`-d 'field1=val1'`)
  })
})
