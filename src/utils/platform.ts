/**
 * 平台判定与快捷键文案：Tauri 的 WKWebView / WebView2 都带系统 UA，
 * 这里只用来把快捷键提示渲染成对应平台的符号。
 */
export const isMacOS =
  typeof navigator !== 'undefined' &&
  (/Macintosh|Mac OS X/.test(navigator.userAgent) || /^Mac/.test(navigator.platform ?? ''))

/** 主修饰键：macOS 为 Command (⌘)，其它平台为 Ctrl */
const modKeyLabel = isMacOS ? '⌘' : 'Ctrl'

/** Alt 键：macOS 上对应 Option (⌥) */
const altKeyLabel = isMacOS ? '⌥' : 'Alt'

/** 主修饰键组合：macOS 用 ⌘K，其它平台用 Ctrl+K */
export function shortcutLabel(key: string): string {
  return isMacOS ? `${modKeyLabel}${key}` : `${modKeyLabel}+${key}`
}

/** Alt/Option 组合：macOS 用 ⌥↑，其它平台用 Alt+↑ */
export function altShortcutLabel(key: string): string {
  return isMacOS ? `${altKeyLabel}${key}` : `${altKeyLabel}+${key}`
}
