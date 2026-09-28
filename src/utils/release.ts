import { invoke } from '@tauri-apps/api/core'

export interface ReleaseInfo {
  tagName: string
  name: string
  body: string
  htmlUrl: string
  publishedAt: string
}

/** 读取 GitHub 上该仓库最新的正式 Release；仓库还没有发布过时返回 null */
export function fetchLatestRelease(owner: string, repo: string): Promise<ReleaseInfo | null> {
  return invoke<ReleaseInfo | null>('fetch_latest_release', { owner, repo })
}

/** 用系统默认浏览器打开外部链接（仅允许 https 的 GitHub 域名） */
export function openExternalUrl(url: string): Promise<void> {
  return invoke<void>('open_external_url', { url })
}
