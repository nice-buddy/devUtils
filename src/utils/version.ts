export interface ParsedVersion {
  numbers: number[]
  prerelease: string
}

/** 解析形如 `v1.2.3` / `1.2` / `0.1.0-mvp` 的版本号，非法片段按 0 处理 */
export function parseVersion(input: string): ParsedVersion {
  const trimmed = String(input ?? '').trim().replace(/^v/i, '')
  const [core = '', ...rest] = trimmed.split('-')
  const numbers = core.split('.').map(part => {
    const value = Number.parseInt(part, 10)
    return Number.isFinite(value) && value >= 0 ? value : 0
  })
  while (numbers.length < 3) numbers.push(0)
  return { numbers: numbers.slice(0, 3), prerelease: rest.join('-') }
}

/** 比较两个版本号：current 小于 latest 返回负数，相等返回 0，大于返回正数 */
export function compareVersions(current: string, latest: string): number {
  const left = parseVersion(current)
  const right = parseVersion(latest)
  for (let index = 0; index < 3; index += 1) {
    if (left.numbers[index] !== right.numbers[index]) {
      return left.numbers[index] > right.numbers[index] ? 1 : -1
    }
  }
  if (left.prerelease === right.prerelease) return 0
  // 有预发布后缀的版本低于同号正式版
  if (!left.prerelease) return 1
  if (!right.prerelease) return -1
  return left.prerelease > right.prerelease ? 1 : -1
}

export function isNewerVersion(current: string, latest: string): boolean {
  return compareVersions(current, latest) < 0
}
