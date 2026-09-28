const PRESERVE_CONTENT_TAGS = ['text', 'tspan', 'style', 'pre', 'title', 'desc']

// 保守压缩：只做「去声明 / 去注释 / 折叠结构空白」，不改语义
export function minifySvg(svg: string): string {
  if (!svg.trim()) return ''
  const preserved: string[] = []
  let working = svg.replace(/<\?xml[\s\S]*?\?>/g, '')
  working = working.replace(/<!--(?!\!)[\s\S]*?-->/g, '')
  for (const tag of PRESERVE_CONTENT_TAGS) {
    const re = new RegExp(`(<${tag}\\b[^>]*>)([\\s\\S]*?)(</${tag}>)`, 'gi')
    working = working.replace(re, (_match, open: string, content: string, close: string) => {
      const token = `@@PRESERVE_${preserved.length}@@`
      preserved.push(`${open}${content}${close}`)
      return token
    })
  }
  working = working
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+\/>/g, ' />')
    .trim()
  return working.replace(/@@PRESERVE_(\d+)@@/g, (_match, index: string) => preserved[Number(index)] ?? '')
}
