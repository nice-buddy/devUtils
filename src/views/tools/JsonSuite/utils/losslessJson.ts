import JSONBig from 'json-bigint'

export const LosslessJSON = JSONBig({
  useNativeBigInt: true,
  strict: false
})

export function formatJson(raw: string, indent: number = 2, sortKeys: boolean = false): string {
  const parsed = LosslessJSON.parse(raw)
  const processed = sortKeys ? deepSort(parsed) : parsed
  return LosslessJSON.stringify(processed, null, indent)
}

export function minifyJson(raw: string): string {
  const parsed = LosslessJSON.parse(raw)
  return LosslessJSON.stringify(parsed)
}

function deepSort(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(deepSort)
  } else if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj)
      .sort()
      .reduce((acc: Record<string, any>, key: string) => {
        acc[key] = deepSort(obj[key])
        return acc
      }, {})
  }
  return obj
}
