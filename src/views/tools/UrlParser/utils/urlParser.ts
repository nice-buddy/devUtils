export interface QueryEntry {
  key: string
  value: string
  enabled: boolean
  hasEquals: boolean
}

export interface ParsedUrl {
  protocol: string
  username: string
  password: string
  host: string
  port: string
  path: string
  hash: string
  entries: QueryEntry[]
  valid: boolean
  error?: string
  schemeInserted: boolean
}

export const EMPTY_PARSED_URL: ParsedUrl = {
  protocol: '',
  username: '',
  password: '',
  host: '',
  port: '',
  path: '',
  hash: '',
  entries: [],
  valid: true,
  schemeInserted: false
}

const SCHEME_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//

function decodePart(text: string): string {
  try {
    return decodeURIComponent(text.replace(/\+/g, ' '))
  } catch {
    return text
  }
}

export function parseQuery(search: string, autoDecode: boolean): QueryEntry[] {
  const raw = search.startsWith('?') ? search.slice(1) : search
  if (!raw) return []
  return raw
    .split('&')
    .filter(part => part.length > 0)
    .map(part => {
      const eq = part.indexOf('=')
      if (eq < 0) {
        return { key: autoDecode ? decodePart(part) : part, value: '', enabled: true, hasEquals: false }
      }
      const key = part.slice(0, eq)
      const value = part.slice(eq + 1)
      return {
        key: autoDecode ? decodePart(key) : key,
        value: autoDecode ? decodePart(value) : value,
        enabled: true,
        hasEquals: true
      }
    })
}

export function parseUrl(input: string, autoDecode = true): ParsedUrl {
  const text = input.trim()
  if (!text) return { ...EMPTY_PARSED_URL, entries: [] }
  const hasScheme = SCHEME_PATTERN.test(text)
  let url: URL
  try {
    url = new URL(hasScheme ? text : `https://${text}`)
  } catch {
    return {
      ...EMPTY_PARSED_URL,
      entries: [],
      valid: false,
      error: 'URL 解析失败：请检查协议、主机与端口是否完整',
      schemeInserted: !hasScheme
    }
  }
  const segments = url.pathname.split('/')
  const path = autoDecode ? segments.map(segment => decodePart(segment)).join('/') : url.pathname
  return {
    protocol: url.protocol.replace(/:$/, ''),
    username: autoDecode ? decodePart(url.username) : url.username,
    password: autoDecode ? decodePart(url.password) : url.password,
    host: url.hostname.replace(/^\[|\]$/g, ''),
    port: url.port,
    path,
    hash: autoDecode ? decodePart(url.hash.replace(/^#/, '')) : url.hash.replace(/^#/, ''),
    entries: parseQuery(url.search, autoDecode),
    valid: true,
    schemeInserted: !hasScheme
  }
}

export function buildUrl(parts: ParsedUrl, autoDecode = true): string {
  const encode = (text: string) => (autoDecode ? encodeURIComponent(text) : text)
  let result = ''
  if (parts.protocol) result += `${parts.protocol}://`
  if (parts.username) {
    result += encode(parts.username)
    if (parts.password) result += `:${encode(parts.password)}`
    result += '@'
  }
  result += parts.host.includes(':') && !parts.host.startsWith('[') ? `[${parts.host}]` : parts.host
  if (parts.port) result += `:${parts.port}`
  const query = parts.entries
    .filter(entry => entry.enabled)
    .map(entry => (entry.hasEquals ? `${encode(entry.key)}=${encode(entry.value)}` : encode(entry.key)))
    .join('&')
  if (parts.path && parts.path !== '/') {
    const path = parts.path.startsWith('/') ? parts.path : `/${parts.path}`
    result += path.split('/').map(segment => encode(segment)).join('/')
  } else if (parts.host && (parts.path === '/' || query)) {
    result += '/'
  }
  if (query) result += `?${query}`
  if (parts.hash) result += `#${encode(parts.hash)}`
  return result
}
