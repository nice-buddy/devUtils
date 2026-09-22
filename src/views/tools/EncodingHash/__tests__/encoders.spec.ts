import { describe, it, expect } from 'vitest'
import {
  base64Encode,
  base64Decode,
  urlEncode,
  urlDecode,
  unicodeEncode,
  unicodeDecode,
  hexEncode,
  hexDecode,
  htmlEncode,
  htmlDecode
} from '../utils/encoders'

describe('Base64 Encoders', () => {
  it('encodes and decodes standard ASCII', () => {
    const raw = 'Hello World!'
    const encoded = base64Encode(raw)
    expect(encoded).toBe('SGVsbG8gV29ybGQh')
    expect(base64Decode(encoded)).toBe(raw)
  })

  it('handles UTF-8 multi-byte characters and emojis without garbling', () => {
    const raw = 'DevUtils 开发者工具箱 🚀 跨平台'
    const encoded = base64Encode(raw)
    expect(base64Decode(encoded)).toBe(raw)
  })

  it('supports URL-Safe Base64 mode without padding', () => {
    // String whose standard base64 contains '+' or '/' and '='
    const raw = 'subjects?_d=1&test=true'
    const standard = base64Encode(raw, { urlSafe: false })
    const urlSafe = base64Encode(raw, { urlSafe: true })

    expect(standard).toContain('/')
    expect(standard).toContain('=')
    expect(urlSafe).toContain('_')
    expect(urlSafe).not.toContain('/')
    expect(urlSafe).not.toContain('=')

    expect(base64Decode(urlSafe, { urlSafe: true })).toBe(raw)
    // Should also auto-detect and decode url-safe even without flag
    expect(base64Decode(urlSafe)).toBe(raw)
  })

  it('handles empty string gracefully', () => {
    expect(base64Encode('')).toBe('')
    expect(base64Decode('')).toBe('')
  })

  it('throws on invalid base64 input', () => {
    expect(() => base64Decode('~~~not-base64~~~')).toThrow()
  })
})

describe('URL Encoders', () => {
  it('encodes and decodes in component mode', () => {
    const raw = 'https://devutils.app/search?query=开发者 工具&filter=true#anchor'
    const encoded = urlEncode(raw, { mode: 'component' })
    expect(encoded).toContain('%3A%2F%2F')
    expect(urlDecode(encoded, { mode: 'component' })).toBe(raw)
  })

  it('encodes and decodes in URI mode (preserving protocol/host/path syntax)', () => {
    const raw = 'https://devutils.app/search?query=开发者 工具'
    const encoded = urlEncode(raw, { mode: 'uri' })
    expect(encoded).toContain('https://devutils.app/search?query=')
    expect(encoded).toContain('%E5%BC%80%E5%8F%91%E8%80%85')
    expect(urlDecode(encoded, { mode: 'uri' })).toBe(raw)
  })

  it('handles empty input', () => {
    expect(urlEncode('')).toBe('')
    expect(urlDecode('')).toBe('')
  })
})

describe('Unicode Encoders', () => {
  it('escapes non-ASCII characters to \\uXXXX by default', () => {
    const raw = 'Hi 中文'
    const encoded = unicodeEncode(raw, { escapeAll: false })
    expect(encoded).toBe('Hi \\u4e2d\\u6587')
    expect(unicodeDecode(encoded)).toBe(raw)
  })

  it('escapes all characters when escapeAll is true', () => {
    const raw = 'Dev'
    const encoded = unicodeEncode(raw, { escapeAll: true })
    expect(encoded).toBe('\\u0044\\u0065\\u0076')
    expect(unicodeDecode(encoded)).toBe(raw)
  })

  it('decodes both upper and lower case \\uXXXX and \\u{XXXX} format', () => {
    expect(unicodeDecode('\\u4E2D\\u6587')).toBe('中文')
    expect(unicodeDecode('\\u{4e2d}\\u{6587}')).toBe('中文')
  })

  it('handles empty input', () => {
    expect(unicodeEncode('')).toBe('')
    expect(unicodeDecode('')).toBe('')
  })
})

describe('Hex Encoders', () => {
  it('encodes and decodes string to hex', () => {
    const raw = 'Hello!'
    const hex = hexEncode(raw)
    expect(hex).toBe('48656c6c6f21')
    expect(hexDecode(hex)).toBe(raw)
  })

  it('supports space delimiter and uppercase formatting', () => {
    const raw = 'Hi'
    const hex = hexEncode(raw, { delimiter: ' ', uppercase: true })
    expect(hex).toBe('48 69')
    expect(hexDecode(hex)).toBe(raw)
  })

  it('handles UTF-8 strings with Chinese and emojis', () => {
    const raw = '你好 🦀'
    const hex = hexEncode(raw)
    expect(hexDecode(hex)).toBe(raw)
  })

  it('decodes hex with 0x prefixes and arbitrary whitespace', () => {
    const hex = '0x48 0x65 0x6c 0x6c 0x6f'
    expect(hexDecode(hex)).toBe('Hello')
  })

  it('throws on invalid hex characters or odd length', () => {
    expect(() => hexDecode('48656G')).toThrow()
    expect(() => hexDecode('48656')).toThrow()
  })

  it('handles empty input', () => {
    expect(hexEncode('')).toBe('')
    expect(hexDecode('')).toBe('')
  })
})

describe('HTML Entity Encoders', () => {
  it('encodes HTML special characters', () => {
    const raw = '<div class="test" data-val=\'demo\'>Fish & Chips</div>'
    const encoded = htmlEncode(raw)
    expect(encoded).toBe(
      '&lt;div class=&quot;test&quot; data-val=&#39;demo&#39;&gt;Fish &amp; Chips&lt;/div&gt;'
    )
    expect(htmlDecode(encoded)).toBe(raw)
  })

  it('decodes numeric and hex HTML entities', () => {
    expect(htmlDecode('&#60;hello&#62; &apos;world&apos; &#x26;')).toBe("<hello> 'world' &")
  })

  it('handles empty input', () => {
    expect(htmlEncode('')).toBe('')
    expect(htmlDecode('')).toBe('')
  })
})
