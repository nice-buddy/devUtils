export interface KeyValuePair {
  key: string
  value: string
  enabled?: boolean
  description?: string
}

export interface ParsedCurl {
  method: string
  url: string
  headers: Record<string, string>
  body: string
  params: KeyValuePair[]
}

/**
 * Shell 参数分词器，处理单双引号、换行转义符及空格
 */
export function tokenizeShellArgs(cmd: string): string[] {
  // 处理行尾反斜杠折行
  const cleanCmd = cmd.replace(/\\\r?\n/g, ' ').trim()
  const tokens: string[] = []
  let current = ''
  let inSingleQuote = false
  let inDoubleQuote = false
  let isEscaped = false

  for (let i = 0; i < cleanCmd.length; i++) {
    const char = cleanCmd[i]

    if (isEscaped) {
      current += char
      isEscaped = false
      continue
    }

    if (char === '\\' && !inSingleQuote) {
      isEscaped = true
      continue
    }

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote
      continue
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote
      continue
    }

    if (/\s/.test(char) && !inSingleQuote && !inDoubleQuote) {
      if (current.length > 0) {
        tokens.push(current)
        current = ''
      }
      continue
    }

    current += char
  }

  if (current.length > 0) {
    tokens.push(current)
  }

  return tokens
}

/**
 * 解析 cURL 命令行字符串
 */
export function parseCurl(curlCommand: string): ParsedCurl {
  const tokens = tokenizeShellArgs(curlCommand)
  let method = ''
  let url = ''
  const headers: Record<string, string> = {}
  const bodyChunks: string[] = []
  let explicitMethod = false

  let i = 0
  if (tokens[0]?.toLowerCase() === 'curl') {
    i = 1
  }

  while (i < tokens.length) {
    const token = tokens[i]

    if (token === '-X' || token === '--request') {
      if (i + 1 < tokens.length) {
        method = tokens[i + 1].toUpperCase()
        explicitMethod = true
        i += 2
        continue
      }
    } else if (token === '-H' || token === '--header') {
      if (i + 1 < tokens.length) {
        const headerStr = tokens[i + 1]
        const colonIndex = headerStr.indexOf(':')
        if (colonIndex > -1) {
          const key = headerStr.substring(0, colonIndex).trim()
          const value = headerStr.substring(colonIndex + 1).trim()
          if (key) {
            headers[key] = value
          }
        }
        i += 2
        continue
      }
    } else if (
      token === '-d' ||
      token === '--data' ||
      token === '--data-raw' ||
      token === '--data-binary' ||
      token === '--data-urlencode'
    ) {
      if (i + 1 < tokens.length) {
        bodyChunks.push(tokens[i + 1])
        i += 2
        continue
      }
    } else if (token === '-u' || token === '--user') {
      if (i + 1 < tokens.length) {
        const authStr = tokens[i + 1]
        try {
          // Base64 编码
          const encoded = typeof btoa === 'function' ? btoa(authStr) : Buffer.from(authStr).toString('base64')
          headers['Authorization'] = `Basic ${encoded}`
        } catch {
          // ignore
        }
        i += 2
        continue
      }
    } else if (token === '--url') {
      if (i + 1 < tokens.length) {
        url = tokens[i + 1]
        i += 2
        continue
      }
    } else if (!token.startsWith('-') && !url) {
      url = token
    }

    i++
  }

  const body = bodyChunks.join('&')
  if (!explicitMethod) {
    method = bodyChunks.length > 0 ? 'POST' : 'GET'
  }

  // 提取 URL 中的 Query Params
  const params: KeyValuePair[] = []
  if (url && url.includes('?')) {
    const queryString = url.split('?')[1]
    if (queryString) {
      const searchParams = new URLSearchParams(queryString)
      searchParams.forEach((value, key) => {
        params.push({ key, value, enabled: true })
      })
    }
  }

  return {
    method: method || 'GET',
    url,
    headers,
    body,
    params
  }
}

export interface ExportCurlOptions {
  method: string
  url: string
  headers?: Record<string, string> | KeyValuePair[]
  body?: string
  bodyType?: string
  auth?: {
    type: string
    bearerToken?: string
    basicUsername?: string
    basicPassword?: string
    apiKeyName?: string
    apiKeyValue?: string
    apiKeyAddTo?: 'header' | 'query'
  }
  formData?: KeyValuePair[]
  urlencodedData?: KeyValuePair[]
}

/**
 * 将当前请求参数导出为 cURL 命令行
 */
export function exportToCurl(req: ExportCurlOptions): string {
  const parts: string[] = ['curl']

  const method = (req.method || 'GET').toUpperCase()
  parts.push(`-X ${method}`)

  let url = req.url || 'http://localhost'

  // 处理 Query 参数型 API Key
  const auth = req.auth
  const authType = auth?.type?.toLowerCase()
  if (
    authType === 'apikey' &&
    auth?.apiKeyAddTo === 'query' &&
    auth.apiKeyName?.trim() &&
    auth.apiKeyValue?.trim()
  ) {
    const k = encodeURIComponent(auth.apiKeyName.trim())
    const v = encodeURIComponent(auth.apiKeyValue.trim())
    const sep = url.includes('?') ? '&' : '?'
    url = `${url}${sep}${k}=${v}`
  }

  parts.push(`"${url}"`)

  // 处理请求头
  const headerList: { key: string; value: string }[] = []
  if (req.headers) {
    if (Array.isArray(req.headers)) {
      for (const h of req.headers) {
        if (h.enabled !== false && h.key && h.key.trim()) {
          headerList.push({ key: h.key.trim(), value: h.value || '' })
        }
      }
    } else {
      for (const [k, v] of Object.entries(req.headers)) {
        if (k && k.trim()) {
          headerList.push({ key: k.trim(), value: v || '' })
        }
      }
    }
  }

  // 注入鉴权请求头
  if (authType === 'bearer' && auth?.bearerToken?.trim()) {
    headerList.push({
      key: 'Authorization',
      value: `Bearer ${auth.bearerToken.trim()}`
    })
  } else if (
    authType === 'basic' &&
    (auth?.basicUsername?.trim() || auth?.basicPassword?.trim())
  ) {
    const u = auth.basicUsername || ''
    const p = auth.basicPassword || ''
    const encoded =
      typeof btoa === 'function'
        ? btoa(`${u}:${p}`)
        : Buffer.from(`${u}:${p}`).toString('base64')
    headerList.push({
      key: 'Authorization',
      value: `Basic ${encoded}`
    })
  } else if (
    authType === 'apikey' &&
    auth?.apiKeyAddTo !== 'query' &&
    auth?.apiKeyName?.trim() &&
    auth?.apiKeyValue?.trim()
  ) {
    headerList.push({
      key: auth.apiKeyName.trim(),
      value: auth.apiKeyValue.trim()
    })
  }

  // 序列化 Body
  let bodyPayload = req.body || ''
  if (!bodyPayload) {
    if (req.bodyType === 'x-www-form-urlencoded' && req.urlencodedData?.length) {
      const activePairs = req.urlencodedData.filter(
        (item) => item.enabled !== false && item.key?.trim()
      )
      if (activePairs.length > 0) {
        bodyPayload = activePairs
          .map(
            (p) =>
              `${encodeURIComponent(p.key.trim())}=${encodeURIComponent(p.value || '')}`
          )
          .join('&')
        if (!headerList.some((h) => h.key.toLowerCase() === 'content-type')) {
          headerList.push({
            key: 'Content-Type',
            value: 'application/x-www-form-urlencoded'
          })
        }
      }
    } else if (req.bodyType === 'form-data' && req.formData?.length) {
      const activePairs = req.formData.filter(
        (item) => item.enabled !== false && item.key?.trim()
      )
      if (activePairs.length > 0) {
        bodyPayload = activePairs
          .map(
            (p) =>
              `${encodeURIComponent(p.key.trim())}=${encodeURIComponent(p.value || '')}`
          )
          .join('&')
      }
    }
  }

  for (const h of headerList) {
    parts.push(`-H "${h.key}: ${h.value}"`)
  }

  // 处理 Body 输出
  if (method !== 'GET' && method !== 'HEAD' && bodyPayload && bodyPayload.trim()) {
    const rawBody = bodyPayload.trim()
    const escaped = rawBody.replace(/'/g, `'\\''`)
    parts.push(`-d '${escaped}'`)
  }

  return parts.join(' ')
}
