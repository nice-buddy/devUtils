import DOMPurify from 'dompurify'
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import css from 'highlight.js/lib/languages/css'
import go from 'highlight.js/lib/languages/go'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import markdown from 'highlight.js/lib/languages/markdown'
import python from 'highlight.js/lib/languages/python'
import rust from 'highlight.js/lib/languages/rust'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import yaml from 'highlight.js/lib/languages/yaml'

// 只注册常用语言，避免把整包（1MB+）打进产物
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('css', css)
hljs.registerLanguage('go', go)
hljs.registerLanguage('java', java)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('js', javascript)
hljs.registerLanguage('json', json)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('python', python)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('ts', typescript)
hljs.registerLanguage('yaml', yaml)

const ALLOWED_TAGS = [
  'a', 'p', 'br', 'hr', 'em', 'strong', 'del', 'code', 'pre', 'blockquote',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'input', 'span',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img'
]

const ALLOWED_ATTR = ['href', 'title', 'alt', 'src', 'class', 'type', 'checked', 'disabled', 'start', 'colspan', 'rowspan', 'rel']

// 依赖 DOM：由 Task 6 的浏览器验收覆盖
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'link', 'meta'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'style']
  })
}

// 依赖 DOM：给 <pre><code class="language-xx"> 加高亮类名
export function highlightCode(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('pre code').forEach(block => {
    const className = block.getAttribute('class') ?? ''
    const match = /language-([\w-]+)/.exec(className)
    const language = match?.[1]
    if (language && hljs.getLanguage(language)) {
      block.innerHTML = hljs.highlight(block.textContent ?? '', { language }).value
      block.classList.add('hljs')
    }
  })
  return doc.body.innerHTML
}
