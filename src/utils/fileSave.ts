import { invoke } from '@tauri-apps/api/core'
import { bytesToBase64 } from './base64'

export function saveBase64File(path: string, base64: string): Promise<number> {
  return invoke<number>('save_binary_file', { path, base64 })
}

export function saveTextFile(path: string, text: string): Promise<number> {
  return saveBase64File(path, bytesToBase64(new TextEncoder().encode(text)))
}
