export interface KeyValueItem {
  key: string
  value: string
  enabled: boolean
  description?: string
  itemType?: 'text' | 'file'
}

export type BodyType = 'none' | 'raw' | 'x-www-form-urlencoded' | 'form-data' | 'binary'
export type RawType = 'json' | 'text' | 'xml' | 'html'
export type AuthType = 'none' | 'bearer' | 'basic' | 'apikey'

export interface AuthConfig {
  type: AuthType
  bearerToken: string
  basicUsername: string
  basicPassword: string
  apiKeyName: string
  apiKeyValue: string
  apiKeyAddTo: 'header' | 'query'
}

export interface RequestSettings {
  ignoreSsl: boolean
  followRedirects: boolean
  timeoutMs: number
  proxy: string
}

export interface PostmanRequestModel {
  method: string
  url: string
  params: KeyValueItem[]
  headers: KeyValueItem[]
  bodyType: BodyType
  rawType: RawType
  bodyRaw: string
  formData: KeyValueItem[]
  urlencodedData: KeyValueItem[]
  binaryFilePath: string
  auth: AuthConfig
  settings: RequestSettings
}

export interface PostmanResponseModel {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  bodyBase64?: string | null
  isBinary?: boolean
  isLarge?: boolean
  tempFilePath?: string | null
  durationMs: number
  sizeBytes: number
}

export interface HistoryItem {
  id: string
  method: string
  url: string
  statusCode: number
  durationMs: number
  requestDataJson?: string
  responseSummaryJson?: string
  executedAt: number
}

export const HTTP_METHODS = [
  'GET',
  'POST',
  'PUT',
  'DELETE',
  'PATCH',
  'HEAD',
  'OPTIONS'
] as const

export function getMethodColor(method: string): string {
  switch (method.toUpperCase()) {
    case 'GET':
      return 'text-emerald-600 dark:text-emerald-400 font-bold'
    case 'POST':
      return 'text-blue-600 dark:text-blue-400 font-bold'
    case 'PUT':
      return 'text-amber-600 dark:text-amber-400 font-bold'
    case 'DELETE':
      return 'text-rose-600 dark:text-rose-400 font-bold'
    case 'PATCH':
      return 'text-purple-600 dark:text-purple-400 font-bold'
    default:
      return 'text-slate-600 dark:text-slate-400 font-bold'
  }
}

export function getMethodBg(method: string): string {
  switch (method.toUpperCase()) {
    case 'GET':
      return 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/60'
    case 'POST':
      return 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/60'
    case 'PUT':
      return 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/60'
    case 'DELETE':
      return 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200/60 dark:border-rose-800/60'
    case 'PATCH':
      return 'bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 border border-purple-200/60 dark:border-purple-800/60'
    default:
      return 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
  }
}
