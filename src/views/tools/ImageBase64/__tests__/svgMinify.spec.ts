import { describe, expect, it } from 'vitest'
import { minifySvg } from '../utils/svgMinify'

describe('minifySvg', () => {
  it('去掉 XML 声明与注释', () => {
    const input = '<?xml version="1.0"?>\n<!-- 注释 -->\n<svg><rect/></svg>'
    const output = minifySvg(input)
    expect(output).not.toContain('<?xml')
    expect(output).not.toContain('注释')
    expect(output).toContain('<svg>')
  })

  it('保留 <!--! 显式保留注释', () => {
    expect(minifySvg('<svg><!--! keep --></svg>')).toContain('<!--! keep -->')
  })

  it('折叠标签之间的空白', () => {
    expect(minifySvg('<svg>\n  <rect />\n  <circle />\n</svg>')).toBe('<svg><rect /><circle /></svg>')
  })

  it('不改动 text / tspan / style 内部内容', () => {
    const input = '<svg><text>  a   b  </text><style>.a { fill: red }</style></svg>'
    expect(minifySvg(input)).toBe(input)
  })

  it('折叠属性之间的多余空白', () => {
    expect(minifySvg('<svg   width="10"    height="10" />')).toBe('<svg width="10" height="10" />')
  })

  it('空输入返回空串', () => {
    expect(minifySvg('')).toBe('')
  })
})
