// 读取一个被 quote 包裹的字面量/标识符，返回结束位置（不含结尾引号之后的内容）。
// 处理两种转义：SQL 标准的双写引号（''）与反斜杠转义。
function readQuoted(text: string, start: number, quote: string): number {
  let i = start + 1
  while (i < text.length) {
    const ch = text[i]
    if (ch === '\\') {
      i += 2
      continue
    }
    if (ch === quote) {
      if (text[i + 1] === quote) {
        i += 2
        continue
      }
      return i + 1
    }
    i += 1
  }
  return text.length
}

// 识别 $$ 或 $tag$ 形式的分隔符；不是美元引用则返回 null
function readDollarDelimiter(text: string, start: number): string | null {
  const match = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(text.slice(start))
  return match ? match[0] : null
}

export function minifySql(text: string): string {
  const out: string[] = []
  let i = 0
  let pendingSpace = false

  const flushSpace = () => {
    if (pendingSpace && out.length > 0) out.push(' ')
    pendingSpace = false
  }

  while (i < text.length) {
    const ch = text[i]

    // 字符串字面量与引用标识符：整段原样保留
    if (ch === "'" || ch === '"' || ch === '`') {
      flushSpace()
      const end = readQuoted(text, i, ch)
      out.push(text.slice(i, end))
      i = end
      continue
    }

    // 美元引用：整段原样保留
    if (ch === '$') {
      const delimiter = readDollarDelimiter(text, i)
      if (delimiter) {
        flushSpace()
        const closeAt = text.indexOf(delimiter, i + delimiter.length)
        const end = closeAt < 0 ? text.length : closeAt + delimiter.length
        out.push(text.slice(i, end))
        i = end
        continue
      }
    }

    // 行注释：-- 后必须跟空白或行尾（MySQL 规则），否则当普通字符
    if (ch === '-' && text[i + 1] === '-' && (i + 2 >= text.length || /\s/.test(text[i + 2]))) {
      const newline = text.indexOf('\n', i)
      i = newline < 0 ? text.length : newline
      pendingSpace = true
      continue
    }

    // 块注释：/*! 是 MySQL 可执行版本注释，必须原样保留
    if (ch === '/' && text[i + 1] === '*') {
      const closeAt = text.indexOf('*/', i + 2)
      const end = closeAt < 0 ? text.length : closeAt + 2
      if (text[i + 2] === '!') {
        flushSpace()
        out.push(text.slice(i, end))
      } else {
        pendingSpace = true
      }
      i = end
      continue
    }

    if (/\s/.test(ch)) {
      pendingSpace = true
      i += 1
      continue
    }

    flushSpace()
    out.push(ch)
    i += 1
  }

  return out.join('').trim()
}
