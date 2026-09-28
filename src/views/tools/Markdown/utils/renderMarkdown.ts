import { marked } from 'marked'

export function markdownToHtml(markdownText: string): { html: string; error?: string } {
  if (!markdownText.trim()) return { html: '' }
  try {
    return { html: marked.parse(markdownText, { gfm: true, breaks: false }) as string }
  } catch (err) {
    return { html: '', error: err instanceof Error ? err.message : 'Markdown 渲染失败' }
  }
}

export function buildSrcdoc(bodyHtml: string, isDark: boolean): string {
  const scheme = isDark ? 'dark' : 'light'
  const bg = isDark ? '#0f172a' : '#ffffff'
  const fg = isDark ? '#e2e8f0' : '#1e293b'
  const border = isDark ? '#1e293b' : '#e2e8f0'
  const codeBg = isDark ? '#090d16' : '#f8fafc'
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
:root { color-scheme: ${scheme}; }
body { margin: 0; padding: 16px; background: ${bg}; color: ${fg};
  font: 14px/1.7 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif; }
h1, h2, h3, h4 { line-height: 1.3; margin: 1.2em 0 0.6em; }
p, ul, ol, blockquote { margin: 0.6em 0; }
table { border-collapse: collapse; margin: 0.8em 0; }
th, td { border: 1px solid ${border}; padding: 4px 8px; }
blockquote { border-left: 3px solid ${border}; padding-left: 12px; color: #64748b; }
code { background: ${codeBg}; padding: 1px 4px; border-radius: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
pre { background: ${codeBg}; padding: 12px; border-radius: 6px; overflow: auto; }
pre code { background: none; padding: 0; }
img { max-width: 100%; }
a { color: #6366f1; }
</style></head><body>${bodyHtml}</body></html>`
}
