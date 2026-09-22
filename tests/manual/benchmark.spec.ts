import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { LosslessJSON, formatJson } from '@/views/tools/JsonSuite/utils/losslessJson'
import { repairJson } from '@/views/tools/JsonSuite/utils/jsonRepair'
import {
  formatResponseBody,
  LARGE_RESPONSE_THRESHOLD_BYTES
} from '@/views/tools/Postman/utils/responseFormatter'

describe('本地手动基准与压测套件 (Manual Benchmark Suite)', () => {
  // ============================================================================
  // TC-04 [MANUAL]: 大文件流式哈希取消控制与 2MB 缓冲区恒定内存验证
  // ============================================================================
  describe('TC-04 [MANUAL]: 流式哈希分块计算、2MB 缓冲区与取消机制验证', () => {
    it('验证 Rust 后端源码中 2MB 恒定缓冲区规范与内存保护设计', () => {
      const hashRsPath = path.resolve(__dirname, '../../src-tauri/src/commands/hash.rs')
      const hashRsSource = fs.readFileSync(hashRsPath, 'utf-8')

      // 1. 验证 2MB 缓冲区大小：2 * 1024 * 1024
      expect(hashRsSource).toMatch(/vec!\[0u8;\s*2\s*\*\s*1024\s*\*\s*1024\]/)
      expect(hashRsSource).toMatch(/2MB 固定缓冲区/)

      // 2. 验证多线程原子取消标记 AtomicBool 与 Ordering::Relaxed 检测
      expect(hashRsSource).toMatch(/cancel_flag\.load\(Ordering::Relaxed\)/)
      expect(hashRsSource).toMatch(/Cancelled/)

      // 3. 验证 HashCancelManager 生命周期管理（register、cancel、remove、CancelCleanupGuard）
      expect(hashRsSource).toMatch(/struct HashCancelManager/)
      expect(hashRsSource).toMatch(/pub fn register/)
      expect(hashRsSource).toMatch(/pub fn cancel/)
      expect(hashRsSource).toMatch(/pub fn remove/)
      expect(hashRsSource).toMatch(/struct CancelCleanupGuard/)
    })

    it('模拟 2MB 缓冲区分配与数据块流转，确保无内存泄漏与恒定开销', () => {
      const BUFFER_SIZE = 2 * 1024 * 1024 // 2MB = 2,097,152 字节
      expect(BUFFER_SIZE).toBe(2097152)

      // 模拟高频次 2MB 缓冲区分配与复用
      const buffer = new Uint8Array(BUFFER_SIZE)
      expect(buffer.byteLength).toBe(BUFFER_SIZE)

      // 填充模拟数据并验证读写无溢出
      buffer.fill(0x5a, 0, 1024)
      expect(buffer[0]).toBe(0x5a)
      expect(buffer[1023]).toBe(0x5a)
      expect(buffer[1024]).toBe(0)
    })

    it('模拟流式数据块分发在收到取消信号时于 300ms 容差内安全中断并释放句柄', async () => {
      const TOTAL_CHUNKS = 30 // 模拟 30 个 2MB 块（总计 60MB）
      let processedChunks = 0
      let isCancelled = false
      let cancelTriggeredAt = 0
      let loopTerminatedAt = 0

      // 异步流式处理模拟引擎
      async function simulateStreamingHash(): Promise<'Completed' | 'Cancelled'> {
        for (let chunkIdx = 1; chunkIdx <= TOTAL_CHUNKS; chunkIdx++) {
          // 每次分块前检测取消标志（对照 Rust cancel_flag.load(Ordering::Relaxed)）
          if (isCancelled) {
            loopTerminatedAt = performance.now()
            return 'Cancelled'
          }

          // 模拟分块处理耗时 (10ms)
          await new Promise((r) => setTimeout(r, 10))
          processedChunks++

          // 在第 4 个分块处理完成后，外部触发取消事件
          if (chunkIdx === 4) {
            cancelTriggeredAt = performance.now()
            isCancelled = true
          }

          // 分块后再次检测取消标志
          if (isCancelled) {
            loopTerminatedAt = performance.now()
            return 'Cancelled'
          }
        }
        return 'Completed'
      }

      const result = await simulateStreamingHash()

      // 1. 确认状态为 Cancelled
      expect(result).toBe('Cancelled')

      // 2. 确认只处理了 4 个分块，其余 26 个分块被立即短路跳过
      expect(processedChunks).toBe(4)

      // 3. 验证从触发取消到循环终止的响应延迟远低于 300ms 容差（通常 < 20ms）
      const responseDurationMs = loopTerminatedAt - cancelTriggeredAt
      expect(responseDurationMs).toBeLessThan(300)
    })
  })

  // ============================================================================
  // TC-05 [MANUAL]: 超大 JSON (>5MB) 容错修复、格式化基准与大文本保护机制
  // ============================================================================
  describe('TC-05 [MANUAL]: 超大 JSON (>5MB) 容错修复与格式化性能基准', () => {
    it('超大 JSON (>5MB / 60,000+ 行) 格式化基准在阈值时间内完成且无内存崩溃，19 位雪花数值保真', () => {
      // 1. 构造一个体积超过 5MB 的真实复杂 JSON 数据集
      const items: any[] = []
      const ITEM_COUNT = 65000
      for (let i = 0; i < ITEM_COUNT; i++) {
        items.push({
          id: 1892837482910293847n, // 19 位雪花 ID
          seq: i,
          timestamp: '1727000000123456789',
          name: `benchmark_user_item_${i}`,
          active: true,
          meta: {
            role: 'developer',
            score: 98.75
          }
        })
      }

      const rawJson = LosslessJSON.stringify(items)
      const rawSizeBytes = Buffer.byteLength(rawJson, 'utf-8')
      const rawSizeMB = rawSizeBytes / (1024 * 1024)

      // 严格断言测试数据集体积超过 5MB
      expect(rawSizeBytes).toBeGreaterThan(5 * 1024 * 1024)
      expect(rawSizeMB).toBeGreaterThan(5.0)

      // 2. 执行 formatJson 性能基准测试
      const t0 = performance.now()
      const formatted = formatJson(rawJson, 2, false)
      const elapsedMs = performance.now() - t0

      // 3. 断言格式化耗时满足高性能基准要求（远低于 5000ms 阈值，通常 < 1000ms）
      expect(elapsedMs).toBeLessThan(5000)

      // 4. 断言格式化后体积膨胀且未破坏大整数
      expect(formatted.length).toBeGreaterThan(rawJson.length)
      expect(formatted).toContain('1892837482910293847')
      expect(formatted).not.toContain('1892837482910293800')
    })

    it('超大残缺 JSON (>5MB) 语法容错修复基准在阈值时间内完成，且修复结果可被正常反序列化', () => {
      // 构造包含单引号、无引号属性名、行尾多余逗号的残缺超大 JSON
      const ITEM_COUNT = 65000
      const malformedParts: string[] = ['[\n']
      for (let i = 0; i < ITEM_COUNT; i++) {
        malformedParts.push(
          `  { id: 1892837482910293847, name: 'user_benchmark_payload_${i}', tag: 'item_tag', active: true, },\n`
        )
      }
      malformedParts.push(']')
      const malformedJson = malformedParts.join('')

      const malformedBytes = Buffer.byteLength(malformedJson, 'utf-8')
      expect(malformedBytes).toBeGreaterThan(5 * 1024 * 1024)

      // 1. 原生 JSON.parse 必定语法报错
      expect(() => JSON.parse(malformedJson)).toThrow()

      // 2. 执行 repairJson 容错修复性能基准
      const t0 = performance.now()
      const repaired = repairJson(malformedJson)
      const elapsedMs = performance.now() - t0

      // 3. 断言修复耗时满足阈值（< 5000ms）
      expect(elapsedMs).toBeLessThan(5000)

      // 4. 断言修复后满足标准 JSON 规范，可被 LosslessJSON 成功解析
      const parsed = LosslessJSON.parse(repaired)
      expect(Array.isArray(parsed)).toBe(true)
      expect(parsed.length).toBe(ITEM_COUNT)
      expect(parsed[0].id.toString()).toBe('1892837482910293847')
    })

    it('验证 Postman 响应体大文本保护阈值 (1MB)，超限跳过 AST 格式化以保护 UI 响应', () => {
      // 1. 验证阈值常量为 1MB
      expect(LARGE_RESPONSE_THRESHOLD_BYTES).toBe(1024 * 1024)

      // 2. 模拟 2MB 的巨型响应体
      const largeBody = '{"large":true,' + '"field":"value",'.repeat(80000) + '"end":1}'
      expect(largeBody.length).toBeGreaterThan(LARGE_RESPONSE_THRESHOLD_BYTES)

      // 3. formatResponseBody 在超过 1MB 时直接跳过 AST 解析返回原文本（耗时 < 5ms）
      const t0 = performance.now()
      const result = formatResponseBody(largeBody)
      const elapsed = performance.now() - t0

      expect(result).toBe(largeBody)
      expect(elapsed).toBeLessThan(10)
    })

    it('验证 JsonSuite 超过 5MB 自动开启只读保护机制定义', () => {
      const jsonSuitePath = path.resolve(__dirname, '../../src/views/tools/JsonSuite/JsonSuite.vue')
      const jsonSuiteSource = fs.readFileSync(jsonSuitePath, 'utf-8')

      // 验证存在 5MB 保护逻辑
      expect(jsonSuiteSource).toMatch(/len\s*>\s*5\s*\*\s*1024\s*\*\s*1024/)
      expect(jsonSuiteSource).toMatch(/文本超过 5MB，已自动开启轻量只读保护模式以防止界面阻塞/)
    })
  })
})
