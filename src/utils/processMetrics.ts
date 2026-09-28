import { invoke } from '@tauri-apps/api/core'

export interface ProcessMetrics {
  /** 相对单个 CPU 核心的占用百分比（多核机器上可能超过 100）。 */
  cpuPercent: number
  /** 常驻内存（RSS），单位字节。 */
  memoryBytes: number
}

export function getProcessMetrics(): Promise<ProcessMetrics> {
  return invoke<ProcessMetrics>('get_process_metrics')
}
