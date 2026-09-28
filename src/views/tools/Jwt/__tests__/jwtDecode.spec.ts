import { describe, expect, it } from 'vitest'
import { base64UrlToBytes, bytesToBase64Url, decodeJwt } from '../utils/jwtDecode'

// header {"alg":"HS256","typ":"JWT"} / payload {"sub":"1","exp":1700000000}
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwiZXhwIjoxNzAwMDAwMDAwfQ.abc-_123'

describe('jwtDecode', () => {
  it('解析三段式 token', () => {
    const { value, error } = decodeJwt(TOKEN)
    expect(error).toBeUndefined()
    expect(value?.header).toEqual({ alg: 'HS256', typ: 'JWT' })
    expect(value?.payload).toEqual({ sub: '1', exp: 1700000000 })
    expect(value?.signingInput).toBe('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwiZXhwIjoxNzAwMDAwMDAwfQ')
    expect(value?.rawSignature).toBe('abc-_123')
  })

  it('段数不是 3 时报错', () => {
    expect(decodeJwt('a.b').error).toContain('3 段')
    expect(decodeJwt('a.b.c.d').error).toContain('3 段')
  })

  it('非法 base64url 或非 JSON 时给出带段名的错误', () => {
    expect(decodeJwt('!!!.eyJzdWIiOiIxIn0.sig').error).toContain('Header')
    expect(decodeJwt('eyJhbGciOiJIUzI1NiJ9.bm90LWpzb24.sig').error).toContain('Payload')
  })

  it('base64url 往返一致，含 - 与 _', () => {
    const bytes = new Uint8Array([251, 255, 190, 0, 1])
    const encoded = bytesToBase64Url(bytes)
    expect(encoded).not.toContain('+')
    expect(encoded).not.toContain('/')
    expect(Array.from(base64UrlToBytes(encoded))).toEqual([251, 255, 190, 0, 1])
  })

  it('缺 padding 的段也能解码', () => {
    expect(new TextDecoder().decode(base64UrlToBytes('eyJzdWIiOiIxIn0'))).toBe('{"sub":"1"}')
  })
})
