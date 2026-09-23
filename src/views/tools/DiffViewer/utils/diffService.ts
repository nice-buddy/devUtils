import { invoke } from '@tauri-apps/api/core'

export interface InlineSpan {
  tag: 'insert' | 'delete' | 'equal'
  text: string
}

export interface DiffItem {
  tag: 'insert' | 'delete' | 'equal'
  value: string
  old_index: number | null
  new_index: number | null
  inline_spans?: InlineSpan[]
}

export async function runDiff(original: string, modified: string): Promise<DiffItem[]> {
  try {
    return await invoke<DiffItem[]>('diff_text', { original, modified })
  } catch {
    return fallbackLineDiff(original, modified)
  }
}

/**
 * Fallback line-by-line diff implementation using standard LCS algorithm.
 * Used in test runners (Vitest) or web preview environments where Tauri IPC is unavailable.
 */
export function fallbackLineDiff(original: string, modified: string): DiffItem[] {
  if (!original && !modified) return []

  const origLines = original ? splitLines(original) : []
  const modLines = modified ? splitLines(modified) : []

  // Compute LCS matrix
  const m = origLines.length
  const n = modLines.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))

  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (origLines[i] === modLines[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1])
      }
    }
  }

  // Backtrack to assemble diff items
  const items: DiffItem[] = []
  let i = m
  let j = n

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && origLines[i - 1] === modLines[j - 1]) {
      items.push({
        tag: 'equal',
        value: origLines[i - 1],
        old_index: i - 1,
        new_index: j - 1
      })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      items.push({
        tag: 'insert',
        value: modLines[j - 1],
        old_index: null,
        new_index: j - 1
      })
      j--
    } else if (i > 0) {
      items.push({
        tag: 'delete',
        value: origLines[i - 1],
        old_index: i - 1,
        new_index: null
      })
      i--
    }
  }

  return items.reverse()
}

function splitLines(text: string): string[] {
  // Preserve line endings similar to `similar` crate's TextDiff::from_lines
  const regex = /.*?(?:\r?\n|$)/g
  const lines: string[] = []
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match[0].length === 0) break
    lines.push(match[0])
    if (regex.lastIndex === text.length) break
  }

  return lines
}
