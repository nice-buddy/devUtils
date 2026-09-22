import { describe, it, expect } from 'vitest'
import { fallbackLineDiff } from '../utils/diffService'
import { processDiff, prepareSemanticJson } from '../utils/diffProcessor'

describe('DiffViewer Engine & Processor', () => {
  describe('fallbackLineDiff', () => {
    it('handles identical multiline texts', () => {
      const text = 'line1\nline2\nline3\n'
      const items = fallbackLineDiff(text, text)
      expect(items.length).toBe(3)
      expect(items.every(i => i.tag === 'equal')).toBe(true)
      expect(items[0].old_index).toBe(0)
      expect(items[0].new_index).toBe(0)
    })

    it('detects insertions and deletions correctly', () => {
      const original = 'line1\nline2\n'
      const modified = 'line1\nline2_modified\nline3\n'
      const items = fallbackLineDiff(original, modified)

      expect(items.some(i => i.tag === 'delete' && i.value.includes('line2'))).toBe(true)
      expect(items.some(i => i.tag === 'insert' && i.value.includes('line2_modified'))).toBe(true)
      expect(items.some(i => i.tag === 'insert' && i.value.includes('line3'))).toBe(true)
    })

    it('handles empty inputs', () => {
      expect(fallbackLineDiff('', '')).toEqual([])
      const ins = fallbackLineDiff('', 'new\n')
      expect(ins.length).toBe(1)
      expect(ins[0].tag).toBe('insert')
    })
  })

  describe('prepareSemanticJson', () => {
    it('sorts JSON keys recursively and handles 19-digit BigInt safely', () => {
      const orig = '{"b": 2, "a": 9223372036854775807, "nested": {"z": 1, "m": 2}}'
      const mod = '{"nested": {"m": 2, "z": 1}, "a": 9223372036854775807, "b": 3}'

      const res = prepareSemanticJson(orig, mod, 2)
      expect(res.success).toBe(true)

      // Keys 'a' should come before 'b'
      const origLines = res.original.split('\n')
      expect(origLines[1]).toContain('"a": 9223372036854775807')
      expect(origLines[2]).toContain('"b": 2')

      // 19-digit BigInt must remain unquoted and unrounded
      expect(res.original).toContain('9223372036854775807')
      expect(res.modified).toContain('9223372036854775807')
    })

    it('returns success: false gracefully on invalid JSON', () => {
      const res = prepareSemanticJson('invalid json', '{"a": 1}')
      expect(res.success).toBe(false)
      expect(res.error).toBeDefined()
    })
  })

  describe('processDiff', () => {
    it('calculates side-by-side rows, unified rows, and stats', () => {
      const items = fallbackLineDiff('line1\nline2\n', 'line1\nline2_mod\nline3\n')
      const processed = processDiff(items)

      // Stats
      expect(processed.stats.deletions).toBe(1) // line2 deleted
      expect(processed.stats.additions).toBe(2) // line2_mod and line3 added
      expect(processed.stats.modifications).toBe(1) // 1 hunk had both delete and insert
      expect(processed.stats.totalHunks).toBe(1)

      // Side-by-side rows alignment
      expect(processed.sideBySideRows.length).toBe(3)
      // Row 1: equal line1
      expect(processed.sideBySideRows[0].left.tag).toBe('equal')
      expect(processed.sideBySideRows[0].left.text).toBe('line1')
      expect(processed.sideBySideRows[0].right.tag).toBe('equal')
      expect(processed.sideBySideRows[0].right.text).toBe('line1')
      // Row 2: delete line2 vs insert line2_mod
      expect(processed.sideBySideRows[1].left.tag).toBe('delete')
      expect(processed.sideBySideRows[1].left.text).toBe('line2')
      expect(processed.sideBySideRows[1].right.tag).toBe('insert')
      expect(processed.sideBySideRows[1].right.text).toBe('line2_mod')
      // Row 3: empty left vs insert line3
      expect(processed.sideBySideRows[2].left.tag).toBe('empty')
      expect(processed.sideBySideRows[2].right.tag).toBe('insert')

      // Unified rows
      expect(processed.unifiedRows.length).toBe(4) // line1(equal), line2(delete), line2_mod(insert), line3(insert)
      expect(processed.unifiedRows[0].tag).toBe('equal')
      expect(processed.unifiedRows[1].tag).toBe('delete')
      expect(processed.unifiedRows[2].tag).toBe('insert')
      expect(processed.unifiedRows[3].tag).toBe('insert')
    })
  })
})
