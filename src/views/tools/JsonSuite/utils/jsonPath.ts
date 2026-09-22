import { LosslessJSON } from './losslessJson'

type PathToken =
  | { type: 'prop'; key: string }
  | { type: 'index'; index: number }
  | { type: 'wildcard' }
  | { type: 'recursive' }

function parsePath(pathStr: string): PathToken[] {
  const trimmed = pathStr.trim()
  if (!trimmed || trimmed === '$') return []

  let s = trimmed
  if (s.startsWith('$')) {
    s = s.slice(1)
  }

  const tokens: PathToken[] = []
  let i = 0

  while (i < s.length) {
    if (s[i] === '.') {
      i++
      if (s[i] === '.') {
        tokens.push({ type: 'recursive' })
        i++
      }
      let prop = ''
      while (i < s.length && s[i] !== '.' && s[i] !== '[') {
        prop += s[i]
        i++
      }
      if (prop) {
        if (prop === '*') {
          tokens.push({ type: 'wildcard' })
        } else {
          tokens.push({ type: 'prop', key: prop })
        }
      }
    } else if (s[i] === '[') {
      i++
      let content = ''
      while (i < s.length && s[i] !== ']') {
        content += s[i]
        i++
      }
      i++ // Skip ']'
      content = content.trim()
      if (content === '*') {
        tokens.push({ type: 'wildcard' })
      } else if (/^-?\d+$/.test(content)) {
        tokens.push({ type: 'index', index: parseInt(content, 10) })
      } else {
        const unquoted = content.replace(/^['"]|['"]$/g, '')
        tokens.push({ type: 'prop', key: unquoted })
      }
    } else {
      let prop = ''
      while (i < s.length && s[i] !== '.' && s[i] !== '[') {
        prop += s[i]
        i++
      }
      if (prop) {
        if (prop === '*') {
          tokens.push({ type: 'wildcard' })
        } else {
          tokens.push({ type: 'prop', key: prop })
        }
      }
    }
  }

  return tokens
}

function collectAllDescendants(node: any): any[] {
  const result: any[] = []
  function recurse(curr: any) {
    if (curr === null || typeof curr !== 'object') return
    result.push(curr)
    if (Array.isArray(curr)) {
      for (const item of curr) {
        recurse(item)
      }
    } else {
      for (const key of Object.keys(curr)) {
        recurse(curr[key])
      }
    }
  }
  recurse(node)
  return result
}

function evaluateJsonPath(root: any, tokens: PathToken[]): any {
  if (tokens.length === 0) return root

  let current = [root]
  let isMultiple = false

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    const nextList: any[] = []

    if (token.type === 'recursive') {
      isMultiple = true
      const nextToken = tokens[i + 1]
      const candidates: any[] = []
      for (const item of current) {
        candidates.push(...collectAllDescendants(item))
      }
      if (nextToken && nextToken.type === 'prop') {
        for (const item of candidates) {
          if (item !== null && typeof item === 'object' && token.type && nextToken.key in item) {
            nextList.push(item[nextToken.key])
          }
        }
        i++ // consume next token as well
      } else {
        nextList.push(...candidates)
      }
    } else if (token.type === 'prop') {
      for (const item of current) {
        if (item !== null && typeof item === 'object') {
          if (token.key in item) {
            nextList.push(item[token.key])
          }
        }
      }
    } else if (token.type === 'index') {
      for (const item of current) {
        if (Array.isArray(item)) {
          const idx = token.index < 0 ? item.length + token.index : token.index
          if (idx >= 0 && idx < item.length) {
            nextList.push(item[idx])
          }
        }
      }
    } else if (token.type === 'wildcard') {
      isMultiple = true
      for (const item of current) {
        if (Array.isArray(item)) {
          nextList.push(...item)
        } else if (item !== null && typeof item === 'object') {
          nextList.push(...Object.values(item))
        }
      }
    }

    current = nextList
    if (current.length === 0) break
  }

  if (current.length === 0) return undefined
  if (isMultiple) return current
  return current[0]
}

export function queryJsonPath(raw: string, path: string): string {
  if (!raw || typeof raw !== 'string') return ''
  const trimmedPath = path ? path.trim() : ''
  const parsed = LosslessJSON.parse(raw)
  if (!trimmedPath || trimmedPath === '$') {
    return LosslessJSON.stringify(parsed, null, 2)
  }

  const tokens = parsePath(trimmedPath)
  const result = evaluateJsonPath(parsed, tokens)

  if (result === undefined) return ''
  return LosslessJSON.stringify(result, null, 2)
}
