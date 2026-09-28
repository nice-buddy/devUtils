import { describe, expect, it } from 'vitest'
import { buildSrcdoc, markdownToHtml } from '../utils/renderMarkdown'

describe('markdownToHtml', () => {
  it('渲染 GFM 表格', () => {
    const { html } = markdownToHtml('| a | b |\n| - | - |\n| 1 | 2 |')
    expect(html).toContain('<table>')
    expect(html).toContain('<th>a</th>')
    expect(html).toContain('<td>2</td>')
  })

  it('渲染任务列表与删除线', () => {
    const { html } = markdownToHtml('- [x] done\n- [ ] todo\n\n~~gone~~')
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('<del>gone</del>')
  })

  it('代码块带上 language- 类名供高亮识别', () => {
    const { html } = markdownToHtml('```js\nconst a = 1\n```')
    expect(html).toContain('<pre>')
    expect(html).toContain('language-js')
  })

  it('空输入返回空字符串且不报错', () => {
    expect(markdownToHtml('')).toEqual({ html: '' })
  })
})

describe('buildSrcdoc', () => {
  it('包含 doctype、样式与正文', () => {
    const doc = buildSrcdoc('<p>hi</p>', false)
    expect(doc).toContain('<!doctype html>')
    expect(doc).toContain('<style>')
    expect(doc).toContain('<p>hi</p>')
    expect(doc).toContain('color-scheme: light')
  })

  it('深色模式切换 color-scheme', () => {
    expect(buildSrcdoc('<p>x</p>', true)).toContain('color-scheme: dark')
  })
})
