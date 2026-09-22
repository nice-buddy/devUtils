/**
 * DevUtils 信息编码与解码工具函数库
 * 包含 Base64（标准与 URL-Safe）、URL、Unicode、Hex、HTML 实体互转
 */

/**
 * 将 Uint8Array 转换为二进制字符串（针对大块数据避免 call stack 溢出）
 */
function uint8ArrayToBinaryString(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 8192
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode.apply(null, Array.from(chunk))
  }
  return binary
}

/**
 * Base64 编码（UTF-8 安全，支持标准与 URL-Safe 模式）
 */
export function base64Encode(text: string, options?: { urlSafe?: boolean }): string {
  if (!text) return ''
  const bytes = new TextEncoder().encode(text)
  const binary = uint8ArrayToBinaryString(bytes)
  let base64 = btoa(binary)
  if (options?.urlSafe) {
    base64 = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }
  return base64
}

/**
 * Base64 解码（UTF-8 安全，支持标准与 URL-Safe 模式）
 */
export function base64Decode(text: string, options?: { urlSafe?: boolean }): string {
  if (!text) return ''
  let normalized = text.trim()
  if (options?.urlSafe || normalized.includes('-') || normalized.includes('_')) {
    normalized = normalized.replace(/-/g, '+').replace(/_/g, '/')
    while (normalized.length % 4 !== 0) {
      normalized += '='
    }
  }
  try {
    const binary = atob(normalized)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return new TextDecoder().decode(bytes)
  } catch (err: any) {
    throw new Error(`Base64 解码失败: ${err?.message || '非法 Base64 字符'}`)
  }
}

/**
 * URL 编码（支持 component 与 uri 模式）
 */
export function urlEncode(text: string, options?: { mode?: 'component' | 'uri' }): string {
  if (!text) return ''
  return options?.mode === 'uri' ? encodeURI(text) : encodeURIComponent(text)
}

/**
 * URL 解码（支持 component 与 uri 模式）
 */
export function urlDecode(text: string, options?: { mode?: 'component' | 'uri' }): string {
  if (!text) return ''
  try {
    return options?.mode === 'uri' ? decodeURI(text) : decodeURIComponent(text)
  } catch (err: any) {
    throw new Error(`URL 解码失败: ${err?.message || '非法 URL 百分号转义序列'}`)
  }
}

/**
 * Unicode 编码（将字符转换为 \uXXXX 格式）
 */
export function unicodeEncode(text: string, options?: { escapeAll?: boolean }): string {
  if (!text) return ''
  let result = ''
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (options?.escapeAll || code > 127) {
      result += '\\u' + code.toString(16).padStart(4, '0')
    } else {
      result += text[i]
    }
  }
  return result
}

/**
 * Unicode 解码（将 \uXXXX 或 \u{XXXX} 还原为字符串）
 */
export function unicodeDecode(text: string): string {
  if (!text) return ''
  return text
    .replace(/\\u\{([0-9a-fA-F]+)\}/g, (_, hex) => {
      try {
        return String.fromCodePoint(parseInt(hex, 16))
      } catch {
        return _
      }
    })
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => {
      try {
        return String.fromCharCode(parseInt(hex, 16))
      } catch {
        return _
      }
    })
}

/**
 * Hex 编码（将字符串的 UTF-8 字节转换为十六进制）
 */
export function hexEncode(
  text: string,
  options?: { delimiter?: string; uppercase?: boolean }
): string {
  if (!text) return ''
  const delimiter = options?.delimiter ?? ''
  const bytes = new TextEncoder().encode(text)
  const hexParts: string[] = []
  for (let i = 0; i < bytes.length; i++) {
    let hex = bytes[i].toString(16).padStart(2, '0')
    if (options?.uppercase) {
      hex = hex.toUpperCase()
    }
    hexParts.push(hex)
  }
  return hexParts.join(delimiter)
}

/**
 * Hex 解码（将十六进制还原为 UTF-8 字符串）
 */
export function hexDecode(hexText: string): string {
  if (!hexText) return ''
  // 移除常见的前缀 0x / 0X 与空白、分号、冒号、减号等分隔符
  let cleaned = hexText
    .replace(/0x|0X/g, '')
    .replace(/[\s,:\-_]/g, '')
    .trim()

  if (cleaned.length === 0) return ''

  if (cleaned.length % 2 !== 0) {
    throw new Error('十六进制字符串长度必须为偶数')
  }

  if (!/^[0-9a-fA-F]+$/.test(cleaned)) {
    throw new Error('包含非法的十六进制字符')
  }

  const byteLength = cleaned.length / 2
  const bytes = new Uint8Array(byteLength)
  for (let i = 0; i < byteLength; i++) {
    const byteHex = cleaned.slice(i * 2, i * 2 + 2)
    bytes[i] = parseInt(byteHex, 16)
  }

  try {
    return new TextDecoder().decode(bytes)
  } catch (err: any) {
    throw new Error(`Hex 解码 UTF-8 失败: ${err?.message || '非法字符'}`)
  }
}

/**
 * HTML 实体转义编码
 */
export function htmlEncode(text: string): string {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * HTML 实体解码还原
 */
export function htmlDecode(text: string): string {
  if (!text) return ''
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      try {
        return String.fromCodePoint(parseInt(hex, 16))
      } catch {
        return _
      }
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      try {
        return String.fromCodePoint(parseInt(dec, 10))
      } catch {
        return _
      }
    })
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}
