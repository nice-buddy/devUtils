/**
 * 容错修复 JSON：
 * 1. 清除单行注释 // 与多行注释 /* ... * /
 * 2. 转换单引号字符串为双引号字符串，并正确转义
 * 3. 补全未加双引号的对象键名
 * 4. 移除对象或数组末尾的尾随逗号 (trailing comma)
 */

function stripComments(str: string): string {
  let result = ''
  let inString = false
  let stringChar = ''
  let i = 0

  while (i < str.length) {
    const ch = str[i]
    const next = str[i + 1]

    if (inString) {
      result += ch
      if (ch === '\\') {
        i++
        if (i < str.length) result += str[i]
      } else if (ch === stringChar) {
        inString = false
      }
    } else {
      if (ch === '"' || ch === "'") {
        inString = true
        stringChar = ch
        result += ch
      } else if (ch === '/' && next === '/') {
        i += 2
        while (i < str.length && str[i] !== '\n' && str[i] !== '\r') {
          i++
        }
        continue
      } else if (ch === '/' && next === '*') {
        i += 2
        while (i < str.length && !(str[i] === '*' && str[i + 1] === '/')) {
          i++
        }
        i += 2
        continue
      } else {
        result += ch
      }
    }
    i++
  }

  return result
}

function normalizeStrings(str: string): string {
  let result = ''
  let i = 0

  while (i < str.length) {
    const ch = str[i]
    if (ch === '"') {
      result += ch
      i++
      while (i < str.length) {
        const c = str[i]
        result += c
        if (c === '\\') {
          i++
          if (i < str.length) result += str[i]
        } else if (c === '"') {
          break
        }
        i++
      }
    } else if (ch === "'") {
      result += '"'
      i++
      while (i < str.length) {
        const c = str[i]
        if (c === '\\') {
          const next = str[i + 1]
          if (next === "'") {
            result += "'"
            i += 2
            continue
          } else {
            result += '\\'
            if (next !== undefined) {
              result += next
              i += 2
              continue
            }
          }
        } else if (c === '"') {
          result += '\\"'
        } else if (c === "'") {
          result += '"'
          break
        } else {
          result += c
        }
        i++
      }
    } else {
      result += ch
    }
    i++
  }

  return result
}

function fixUnquotedKeys(str: string): string {
  let result = ''
  let inString = false
  let i = 0

  while (i < str.length) {
    const ch = str[i]
    if (inString) {
      result += ch
      if (ch === '\\') {
        i++
        if (i < str.length) result += str[i]
      } else if (ch === '"') {
        inString = false
      }
      i++
    } else {
      if (ch === '"') {
        inString = true
        result += ch
        i++
      } else if (/[a-zA-Z_$]/.test(ch)) {
        let ident = ''
        while (i < str.length && /[a-zA-Z0-9_$-]/.test(str[i])) {
          ident += str[i]
          i++
        }
        let k = i
        while (k < str.length && /\s/.test(str[k])) {
          k++
        }
        if (k < str.length && str[k] === ':') {
          result += '"' + ident + '"'
        } else {
          result += ident
        }
      } else {
        result += ch
        i++
      }
    }
  }

  return result
}

function removeTrailingCommas(str: string): string {
  let result = ''
  let inString = false
  let i = 0

  while (i < str.length) {
    const ch = str[i]
    if (inString) {
      result += ch
      if (ch === '\\') {
        i++
        if (i < str.length) result += str[i]
      } else if (ch === '"') {
        inString = false
      }
    } else {
      if (ch === '"') {
        inString = true
        result += ch
      } else if (ch === ',') {
        let j = i + 1
        while (j < str.length && /\s/.test(str[j])) {
          j++
        }
        if (j < str.length && (str[j] === '}' || str[j] === ']')) {
          // Skip trailing comma
        } else {
          result += ch
        }
      } else {
        result += ch
      }
    }
    i++
  }

  return result
}

export function repairJson(raw: string): string {
  if (!raw || typeof raw !== 'string') return ''
  let text = stripComments(raw)
  text = normalizeStrings(text)
  text = fixUnquotedKeys(text)
  text = removeTrailingCommas(text)
  return text
}
