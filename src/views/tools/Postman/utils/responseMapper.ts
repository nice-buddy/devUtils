import type { PostmanRequestModel, PostmanResponseModel } from '../types'

/**
 * Rust 端 `http_execute` 返回的 IPC 结构。
 * 后端结构体带 `#[serde(rename_all = "camelCase")]`，字段名必须保持 camelCase。
 */
export interface HttpIpcResponse {
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

/** 将 IPC 响应映射为界面响应模型 */
export function toPostmanResponse(ipc: HttpIpcResponse): PostmanResponseModel {
  return {
    status: ipc.status,
    statusText: ipc.statusText,
    headers: ipc.headers,
    body: ipc.body,
    bodyBase64: ipc.bodyBase64,
    isBinary: ipc.isBinary,
    isLarge: ipc.isLarge,
    tempFilePath: ipc.tempFilePath,
    durationMs: ipc.durationMs,
    sizeBytes: ipc.sizeBytes
  }
}

/**
 * 大响应缓存文件会在应用启动时被统一清理，
 * 因此快照中不能保留 `tempFilePath`，否则恢复页签后会展示必然失效的路径。
 */
export function cloneWithoutTempFile(
  response: PostmanResponseModel | null | undefined
): PostmanResponseModel | null {
  if (!response) return null
  const cloned = JSON.parse(JSON.stringify(response)) as PostmanResponseModel
  cloned.tempFilePath = null
  return cloned
}

/** 将 http_history 记录的请求载荷回填到当前请求模型（兼容历史遗留的 snake_case 记录） */
export function applyHistoryRequestPayload(
  target: PostmanRequestModel,
  parsedReq: any
): PostmanRequestModel {
  if (!parsedReq) return target

  target.method = parsedReq.method || 'GET'
  target.url = parsedReq.url || ''
  target.headers = parsedReq.headers || []
  target.params = parsedReq.params || []
  target.bodyType = parsedReq.bodyType || parsedReq.body_type || 'none'
  target.rawType = parsedReq.rawType || parsedReq.raw_type || 'json'
  target.bodyRaw = parsedReq.bodyRaw || parsedReq.body_raw || ''
  target.formData = (parsedReq.formData || parsedReq.form_data || []).map((f: any) => ({
    key: f.key || '',
    value: f.value || '',
    enabled: f.enabled !== false,
    itemType: f.itemType || f.item_type || 'text'
  }))
  target.urlencodedData = parsedReq.urlencodedData || parsedReq.urlencoded_data || []
  target.binaryFilePath = parsedReq.binaryFilePath || parsedReq.binary_file_path || ''

  const timeoutMs = parsedReq.timeoutMs || parsedReq.timeout_ms
  if (timeoutMs !== undefined) target.settings.timeoutMs = timeoutMs
  const ignoreSsl = parsedReq.ignoreSsl !== undefined ? parsedReq.ignoreSsl : parsedReq.ignore_ssl
  if (ignoreSsl !== undefined) target.settings.ignoreSsl = ignoreSsl
  const followRedirects =
    parsedReq.followRedirects !== undefined ? parsedReq.followRedirects : parsedReq.follow_redirects
  if (followRedirects !== undefined) target.settings.followRedirects = followRedirects
  if (parsedReq.proxy !== undefined) target.settings.proxy = parsedReq.proxy

  if (parsedReq.auth) {
    target.auth = { ...target.auth, ...parsedReq.auth }
  }

  return target
}
