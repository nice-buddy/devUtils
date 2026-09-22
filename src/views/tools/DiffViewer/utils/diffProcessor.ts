import type { DiffItem } from './diffService'
import { formatJson } from '@/views/tools/JsonSuite/utils/losslessJson'

export interface SideBySideCell {
  lineNum: number | null
  tag: 'delete' | 'insert' | 'equal' | 'empty'
  text: string
}

export interface SideBySideRow {
  id: number
  hunkIndex: number | null
  left: SideBySideCell
  right: SideBySideCell
}

export interface UnifiedRow {
  id: number
  hunkIndex: number | null
  oldLineNum: number | null
  newLineNum: number | null
  tag: 'delete' | 'insert' | 'equal'
  text: string
}

export interface DiffStats {
  additions: number
  deletions: number
  modifications: number
  totalHunks: number
}

export interface ProcessedDiff {
  sideBySideRows: SideBySideRow[]
  unifiedRows: UnifiedRow[]
  stats: DiffStats
}

/**
 * Preprocess JSON texts by sorting object keys recursively with BigInt lossless preservation.
 */
export function prepareSemanticJson(
  original: string,
  modified: string,
  indent: number = 2
): { original: string; modified: string; success: boolean; error?: string } {
  try {
    const formattedOrig = formatJson(original, indent, true)
    const formattedMod = formatJson(modified, indent, true)
    return {
      original: formattedOrig,
      modified: formattedMod,
      success: true
    }
  } catch (err: any) {
    return {
      original,
      modified,
      success: false,
      error: err.message || 'JSON 解析或排序失败'
    }
  }
}

/**
 * Transforms raw DiffItems from Rust/fallback into side-by-side rows, unified rows, and statistics.
 */
export function processDiff(items: DiffItem[]): ProcessedDiff {
  let additions = 0
  let deletions = 0
  let modifications = 0
  let hunkCount = 0

  const sideBySideRows: SideBySideRow[] = []
  const unifiedRows: UnifiedRow[] = []

  let rowId = 0
  let i = 0

  while (i < items.length) {
    const item = items[i]

    if (item.tag === 'equal') {
      sideBySideRows.push({
        id: ++rowId,
        hunkIndex: null,
        left: {
          lineNum: item.old_index !== null ? item.old_index + 1 : null,
          tag: 'equal',
          text: item.value
        },
        right: {
          lineNum: item.new_index !== null ? item.new_index + 1 : null,
          tag: 'equal',
          text: item.value
        }
      })

      unifiedRows.push({
        id: rowId,
        hunkIndex: null,
        oldLineNum: item.old_index !== null ? item.old_index + 1 : null,
        newLineNum: item.new_index !== null ? item.new_index + 1 : null,
        tag: 'equal',
        text: item.value
      })

      i++
    } else {
      // Start of a diff hunk: collect consecutive delete/insert changes
      const currentHunkIndex = hunkCount++
      const hunkDeletes: DiffItem[] = []
      const hunkInserts: DiffItem[] = []

      while (i < items.length && items[i].tag !== 'equal') {
        const cur = items[i]
        if (cur.tag === 'delete') {
          hunkDeletes.push(cur)
          deletions++
        } else if (cur.tag === 'insert') {
          hunkInserts.push(cur)
          additions++
        }
        i++
      }

      if (hunkDeletes.length > 0 && hunkInserts.length > 0) {
        modifications++
      }

      // Generate Unified rows for this hunk
      for (const del of hunkDeletes) {
        unifiedRows.push({
          id: ++rowId,
          hunkIndex: currentHunkIndex,
          oldLineNum: del.old_index !== null ? del.old_index + 1 : null,
          newLineNum: null,
          tag: 'delete',
          text: del.value
        })
      }
      for (const ins of hunkInserts) {
        unifiedRows.push({
          id: ++rowId,
          hunkIndex: currentHunkIndex,
          oldLineNum: null,
          newLineNum: ins.new_index !== null ? ins.new_index + 1 : null,
          tag: 'insert',
          text: ins.value
        })
      }

      // Generate Side-by-Side rows for this hunk
      const maxLen = Math.max(hunkDeletes.length, hunkInserts.length)
      for (let k = 0; k < maxLen; k++) {
        const del = hunkDeletes[k]
        const ins = hunkInserts[k]

        sideBySideRows.push({
          id: ++rowId,
          hunkIndex: currentHunkIndex,
          left: del
            ? {
                lineNum: del.old_index !== null ? del.old_index + 1 : null,
                tag: 'delete',
                text: del.value
              }
            : {
                lineNum: null,
                tag: 'empty',
                text: ''
              },
          right: ins
            ? {
                lineNum: ins.new_index !== null ? ins.new_index + 1 : null,
                tag: 'insert',
                text: ins.value
              }
            : {
                lineNum: null,
                tag: 'empty',
                text: ''
              }
        })
      }
    }
  }

  return {
    sideBySideRows,
    unifiedRows,
    stats: {
      additions,
      deletions,
      modifications,
      totalHunks: hunkCount
    }
  }
}
