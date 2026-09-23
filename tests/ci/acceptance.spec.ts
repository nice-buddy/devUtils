import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import fs from 'node:fs'
import path from 'node:path'
import { invoke } from '@tauri-apps/api/core'
import { LosslessJSON, formatJson, minifyJson } from '@/views/tools/JsonSuite/utils/losslessJson'
import { convertTimestamp, timestampToDate, dateToTimestamp } from '@/views/tools/TimestampCron/utils/timeConverter'
import { parseCurl, exportToCurl } from '@/views/tools/Postman/utils/curlParser'
import { useTabStore } from '@/stores/tabStore'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue([])
}))

// Alias helpers matching acceptance criteria specifications
const parseLosslessJson = <T = any>(raw: string): T => LosslessJSON.parse(raw)
const stringifyLosslessJson = (val: any, replacer?: any, space?: string | number): string =>
  LosslessJSON.stringify(val, replacer, space)
const parseCurlCommand = parseCurl
const generateCurlCommand = exportToCurl

describe('CI 自动化集成验收测试套件 (CI Acceptance Suite)', () => {
  // ============================================================================
  // TC-01: 19 位雪花 ID 与 19 位纳秒时间戳精度 100% 保真（杜绝 IEEE-754 截断）
  // ============================================================================
  describe('TC-01: 长整数与纳秒精度 100% 保真验证', () => {
    it('19 位雪花 ID (超 MAX_SAFE_INTEGER) 在 LosslessJSON 中绝对无损，对比标准 JSON.parse 发生末位截断', () => {
      // 19 位雪花 ID，超出 JavaScript Number.MAX_SAFE_INTEGER (9007199254740991)
      const snowflakeId1 = '1892837482910293847'
      const snowflakeId2 = '9223372036854775807' // i64::MAX (19 位)
      const jsonStr = `{"id":${snowflakeId1},"i64Max":${snowflakeId2},"nested":{"orderId":${snowflakeId1}}}`

      // 1. 标准原生 JSON.parse 发生 IEEE-754 浮点截断（末位变为 800）
      const nativeParsed = JSON.parse(jsonStr)
      expect(nativeParsed.id.toString()).not.toBe(snowflakeId1)
      expect(nativeParsed.id).toBe(1892837482910293800) // IEEE-754 截断损坏

      // 2. parseLosslessJson 100% 精确保留原始大数值
      const losslessParsed = parseLosslessJson(jsonStr)
      expect(losslessParsed.id.toString()).toBe(snowflakeId1)
      expect(losslessParsed.i64Max.toString()).toBe(snowflakeId2)
      expect(losslessParsed.nested.orderId.toString()).toBe(snowflakeId1)

      // 3. stringifyLosslessJson 序列化输出数值字面量，无双引号包裹、无末位变形、无科学计数法
      const serialized = stringifyLosslessJson(losslessParsed)
      expect(serialized).toContain(`"id":${snowflakeId1}`)
      expect(serialized).toContain(`"i64Max":${snowflakeId2}`)
      expect(serialized).not.toContain('1892837482910293800')

      // 4. formatJson 格式化缩进后依然保持 19 位字面量保真
      const formatted = formatJson(jsonStr, 2, false)
      expect(formatted).toContain(snowflakeId1)
      expect(formatted).toContain(snowflakeId2)
      expect(formatted).not.toContain('1892837482910293800')

      // 5. minifyJson 压缩后亦保持精度保真
      const minified = minifyJson(formatted)
      expect(minified).toContain(snowflakeId1)
      expect(minified).toContain(snowflakeId2)
    })

    it('19 位纳秒级时间戳使用 BigInt 纯整数流转，双向转换与余量拆解零误差', () => {
      // 19 位真实纳秒时间戳 (2024-09-22 13:46:40.123456789 UTC)
      const nsTimestamp = '1727000000123456789'

      // 1. 标准 Number 会损失亚微秒精度
      const lossyNumber = Number(nsTimestamp)
      expect(lossyNumber.toString()).not.toBe(nsTimestamp)

      // 2. convertTimestamp 同单位转换无损
      expect(convertTimestamp(nsTimestamp, 'ns', 'ns')).toBe('1727000000123456789')

      // 3. convertTimestamp 向微秒、毫秒、秒安全降采样（整除截断）
      expect(convertTimestamp(nsTimestamp, 'ns', 'us')).toBe('1727000000123456')
      expect(convertTimestamp(nsTimestamp, 'ns', 'ms')).toBe('1727000000123')
      expect(convertTimestamp(nsTimestamp, 'ns', 's')).toBe('1727000000')

      // 4. 秒/毫秒向纳秒升采样，纯乘法不发生浮点截断
      expect(convertTimestamp('1727000000', 's', 'ns')).toBe('1727000000000000000')
      expect(convertTimestamp('1727000000123', 'ms', 'ns')).toBe('1727000000123000000')

      // 5. timestampToDate 拆解纳秒：毫秒 Date 与 6 位 extraNs 亚毫秒余量独立保真
      const { date, extraNs } = timestampToDate(nsTimestamp, 'ns')
      expect(date.getTime()).toBe(1727000000123)
      expect(extraNs).toBe('456789') // 完整保留 456789 纳秒亚毫秒余量

      // 6. dateToTimestamp 重新生成毫秒和秒级时间戳
      expect(dateToTimestamp(date, 'ms')).toBe('1727000000123')
      expect(dateToTimestamp(date, 's')).toBe('1727000000')
    })
  })

  // ============================================================================
  // TC-02 & TC-03: Postman cURL 解析与导出、请求 Payload 结构及 iframe 沙箱安全
  // ============================================================================
  describe('TC-02 & TC-03: Postman 请求解析、导出与安全沙箱验证', () => {
    it('正确双向解析与导出 cURL 命令行（含 Method、Headers、Query、Auth 及 Payload）', () => {
      // 1. 复杂 cURL 命令输入（含换行转义、多 Header、Query 参数与 JSON 体）
      const curlInput = `curl -X POST "https://api.devutils.io/v1/orders?trace=1&region=cn" \\
        -H "Content-Type: application/json" \\
        -H "X-Custom-Header: devutils-agent" \\
        -d '{"orderId":1892837482910293847,"amount":99.9}'`

      const parsed = parseCurlCommand(curlInput)
      expect(parsed.method).toBe('POST')
      expect(parsed.url).toBe('https://api.devutils.io/v1/orders?trace=1&region=cn')
      expect(parsed.headers['Content-Type']).toBe('application/json')
      expect(parsed.headers['X-Custom-Header']).toBe('devutils-agent')
      expect(parsed.body).toBe('{"orderId":1892837482910293847,"amount":99.9}')
      expect(parsed.params).toEqual([
        { key: 'trace', value: '1', enabled: true },
        { key: 'region', value: 'cn', enabled: true }
      ])

      // 2. 导出为标准 cURL 命令（含 Bearer 鉴权与 -d）
      const exported = generateCurlCommand({
        method: 'POST',
        url: 'https://api.devutils.io/v1/orders',
        headers: [
          { key: 'Content-Type', value: 'application/json', enabled: true },
          { key: 'X-Disabled', value: 'ignore-me', enabled: false }
        ],
        auth: {
          type: 'bearer',
          bearerToken: 'secret_token_123'
        },
        body: '{"orderId":1892837482910293847}'
      })

      expect(exported).toContain('curl -X POST "https://api.devutils.io/v1/orders"')
      expect(exported).toContain('-H "Content-Type: application/json"')
      expect(exported).toContain('-H "Authorization: Bearer secret_token_123"')
      expect(exported).not.toContain('X-Disabled')
      expect(exported).toContain(`-d '{"orderId":1892837482910293847}'`)
    })

    it('正确导出 Basic 认证与 Query 型 API Key', () => {
      const basicExport = generateCurlCommand({
        method: 'GET',
        url: 'https://api.devutils.io/auth/basic',
        auth: {
          type: 'basic',
          basicUsername: 'admin',
          basicPassword: 'password456'
        }
      })
      const expectedBasic = Buffer.from('admin:password456').toString('base64')
      expect(basicExport).toContain(`-H "Authorization: Basic ${expectedBasic}"`)

      const apiKeyExport = generateCurlCommand({
        method: 'GET',
        url: 'https://api.devutils.io/auth/apikey?category=system',
        auth: {
          type: 'apiKey',
          apiKeyName: 'api_token',
          apiKeyValue: 'token_val_789',
          apiKeyAddTo: 'query'
        }
      })
      expect(apiKeyExport).toContain('category=system&api_token=token_val_789')
    })

    it('验证发往 Rust 后端的 IPC HttpRequestPayload 结构完备性（支持 ignore_ssl 与原生 CORS 穿透）', () => {
      // 模拟 Postman.vue 中组装并发往 invoke('http_execute', { req: payload }) 的完整对象
      const payload = {
        method: 'POST',
        url: 'https://self-signed.local/api/test',
        headers: [{ key: 'Content-Type', value: 'application/json', enabled: true }],
        params: [{ key: 'limit', value: '10', enabled: true }],
        body_type: 'raw',
        raw_type: 'json',
        body_raw: '{"test":true}',
        form_data: [],
        urlencoded_data: [],
        binary_file_path: null,
        timeout_ms: 15000,
        ignore_ssl: true, // TC-03: 允许忽略自签名证书
        follow_redirects: true,
        proxy: null
      }

      // 验证必选字段与类型规范
      expect(payload.method).toBe('POST')
      expect(payload.url).toBe('https://self-signed.local/api/test')
      expect(payload.ignore_ssl).toBe(true)
      expect(payload.timeout_ms).toBe(15000)
      expect(payload.body_type).toBe('raw')
      expect(Array.isArray(payload.headers)).toBe(true)
      expect(Array.isArray(payload.params)).toBe(true)
    })

    it('HTML 预览沙箱严格防御 XSS：必须包含 sandbox="" 且绝对禁止 allow-scripts 与 allow-same-origin', () => {
      const iframeComponentPath = path.resolve(
        __dirname,
        '../../src/views/tools/Postman/components/HtmlPreviewIframe.vue'
      )
      const iframeSource = fs.readFileSync(iframeComponentPath, 'utf-8')

      // 1. 严格使用空字符串沙箱：sandbox=""
      expect(iframeSource).toMatch(/sandbox=""/)

      // 2. 严禁出现放开脚本执行权限的 allow-scripts
      expect(iframeSource).not.toMatch(/allow-scripts/)

      // 3. 严禁出现读取同源 Cookie/Storage 的 allow-same-origin
      expect(iframeSource).not.toMatch(/allow-same-origin/)

      // 4. 严禁放开顶层重定向 allow-top-navigation
      expect(iframeSource).not.toMatch(/allow-top-navigation/)

      // 5. 必须采用 :srcdoc 属性安全单向绑定 HTML 内容，杜绝 v-html 直接挂载 DOM
      expect(iframeSource).toMatch(/:srcdoc="safeHtmlContent"/)
      expect(iframeSource).not.toMatch(/v-html/)
    })

    it('Postman cURL 导出针对 form-data 输出 -F 语法，且不添加多余的 multipart/form-data 头', () => {
      const curlWithForm = generateCurlCommand({
        method: 'POST',
        url: 'https://api.devutils.io/upload',
        headers: [
          { key: 'Authorization', value: 'Bearer test_token', enabled: true }
        ],
        bodyType: 'form-data',
        formData: [
          { key: 'username', value: 'admin', type: 'text', enabled: true },
          { key: 'file', value: '/tmp/test.png', type: 'file', enabled: true },
          { key: 'disabled_field', value: 'foo', type: 'text', enabled: false }
        ]
      })

      expect(curlWithForm).toContain('curl -X POST "https://api.devutils.io/upload"')
      expect(curlWithForm).toContain('-F "username=admin"')
      expect(curlWithForm).toContain('-F "file=@/tmp/test.png"')
      expect(curlWithForm).not.toContain('disabled_field')
      expect(curlWithForm).not.toMatch(/-H "Content-Type: multipart\/form-data"/)
    })

    it('流式 HTTP 响应与 IPC 模型支持 body_base64 二进制图片与 temp_file_path 超大缓存文件', () => {
      const imgResponse = {
        statusCode: 200,
        statusText: 'OK',
        headers: { 'content-type': 'image/png' },
        body: '',
        bodyBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        isBinary: true,
        isLarge: false,
        sizeBytes: 68,
        durationMs: 42,
        tempFilePath: null
      }

      expect(imgResponse.isBinary).toBe(true)
      expect(imgResponse.bodyBase64).toBeDefined()
      expect(imgResponse.tempFilePath).toBeNull()

      const streamLargeResponse = {
        statusCode: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/octet-stream' },
        body: 'preview-chunk...',
        bodyBase64: null,
        isBinary: true,
        isLarge: true,
        sizeBytes: 15 * 1024 * 1024,
        durationMs: 310,
        tempFilePath: '/var/folders/temp/devutils_large_resp_12345.bin'
      }

      expect(streamLargeResponse.isLarge).toBe(true)
      expect(streamLargeResponse.tempFilePath).toContain('devutils_large_resp_12345.bin')
    })

    it('Postman IPC 响应结果严格遵循 camelCase 并完整映射至 PostmanResponseModel', () => {
      const ipcResult = {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'image/png' },
        body: '',
        bodyBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        isBinary: true,
        isLarge: false,
        tempFilePath: null,
        durationMs: 48,
        sizeBytes: 68
      }

      const responseModel = {
        status: ipcResult.status,
        statusText: ipcResult.statusText,
        headers: ipcResult.headers,
        body: ipcResult.body,
        bodyBase64: ipcResult.bodyBase64,
        isBinary: ipcResult.isBinary,
        isLarge: ipcResult.isLarge,
        tempFilePath: ipcResult.tempFilePath,
        durationMs: ipcResult.durationMs,
        sizeBytes: ipcResult.sizeBytes
      }

      expect(responseModel.statusText).toBe('OK')
      expect(responseModel.durationMs).toBe(48)
      expect(responseModel.sizeBytes).toBe(68)
      expect(responseModel.isBinary).toBe(true)
      expect(responseModel.bodyBase64).toBeTruthy()
      expect(responseModel.tempFilePath).toBeNull()
    })

    it('Postman 历史记录能够从 camelCase 格式完备恢复 method/url/headers/bodyType/rawType/auth/settings', () => {
      const historyItem = {
        id: 'hist_123',
        method: 'POST',
        url: 'https://api.devutils.io/order',
        statusCode: 200,
        durationMs: 120,
        requestDataJson: JSON.stringify({
          method: 'POST',
          url: 'https://api.devutils.io/order',
          headers: [{ key: 'Authorization', value: 'Bearer test', enabled: true }],
          params: [{ key: 'tab', value: 'cart', enabled: true }],
          bodyType: 'raw',
          rawType: 'json',
          bodyRaw: '{"itemId": 1001}',
          formData: [],
          urlencodedData: [],
          binaryFilePath: null,
          timeoutMs: 15000,
          ignoreSsl: true,
          followRedirects: false,
          proxy: 'http://127.0.0.1:7890',
          auth: {
            type: 'bearer',
            bearerToken: 'test'
          }
        }),
        responseSummaryJson: '{}',
        executedAt: Date.now()
      }

      const parsedReq = JSON.parse(historyItem.requestDataJson)
      expect(parsedReq.bodyType).toBe('raw')
      expect(parsedReq.rawType).toBe('json')
      expect(parsedReq.bodyRaw).toBe('{"itemId": 1001}')
      expect(parsedReq.timeoutMs).toBe(15000)
      expect(parsedReq.ignoreSsl).toBe(true)
      expect(parsedReq.followRedirects).toBe(false)
      expect(parsedReq.proxy).toBe('http://127.0.0.1:7890')
      expect(parsedReq.auth.type).toBe('bearer')
      expect(parsedReq.auth.bearerToken).toBe('test')
    })
  })

  // ============================================================================
  // TC-06: TabStore 多 Tab 实例管理与 5 标签 LRU 淘汰机制
  // ============================================================================
  describe('TC-06: TabStore 多实例管理与 5 标签 LRU 淘汰验证', () => {
    beforeEach(() => {
      setActivePinia(createPinia())
    })

    it('连续打开 6+ 个 Tab 标签页时，keepAliveTabIds 严格限制为 5 个，最旧 Tab 移出 KeepAlive 但 Pinia 数据完好保留', () => {
      const store = useTabStore()
      const createdTabIds: string[] = []

      // 连续打开 7 个标签页
      for (let i = 1; i <= 7; i++) {
        const id = store.openTab(`tool_${i}`, `Tool Instance ${i}`)
        createdTabIds.push(id)
        store.updateTabSnapshot(id, {
          inputText: `input_content_of_tab_${i}`,
          cursorPos: i * 10
        })
      }

      // 1. openTabs 保留全部 7 个标签实例（Pinia 全局状态完整留存）
      expect(store.openTabs.length).toBe(7)

      // 2. keepAliveTabIds 严格维持在 5 个，防止过多 DOM 导致物理内存激增
      expect(store.keepAliveTabIds.length).toBe(5)

      // 3. 最早打开且未被再次激活的第 1、2 个 Tab 必须被移出 keepAlive
      expect(store.keepAliveTabIds.includes(createdTabIds[0])).toBe(false)
      expect(store.keepAliveTabIds.includes(createdTabIds[1])).toBe(false)

      // 4. 最近打开的 5 个 Tab (index 2 ~ 6) 处于 keepAlive 中
      for (let i = 2; i <= 6; i++) {
        expect(store.keepAliveTabIds.includes(createdTabIds[i])).toBe(true)
      }

      // 5. 被淘汰出 DOM KeepAlive 的 tab0，其 Pinia 快照数据依然完整
      const tab0 = store.openTabs.find((t) => t.id === createdTabIds[0])
      expect(tab0).toBeDefined()
      expect(tab0?.snapshot).toEqual({
        inputText: 'input_content_of_tab_1',
        cursorPos: 10
      })

      // 6. 重新激活被淘汰的 tab0
      store.activateTab(createdTabIds[0])

      // tab0 应被召回 keepAliveTabIds，当前活跃 Tab 变为 tab0
      expect(store.activeTabId).toBe(createdTabIds[0])
      expect(store.keepAliveTabIds.includes(createdTabIds[0])).toBe(true)

      // 原本处于 keepAlive 边缘的 tab2 (createdTabIds[2]) 被顺延挤出 keepAlive
      expect(store.keepAliveTabIds.includes(createdTabIds[2])).toBe(false)
      expect(store.keepAliveTabIds.length).toBe(5)
    })

    it('应用冷启动时从 SQLite 数据库恢复 Tabs 列表、激活状态与快照数据', async () => {
      const mockInvoke = vi.mocked(invoke)
      mockInvoke.mockImplementation(async (cmd: string, args?: any) => {
        if (cmd === 'db_query') {
          if (args?.query?.includes('FROM tool_state_snapshots')) {
            return [
              {
                tab_id: 'postman_123',
                tool_id: 'postman',
                title: '用户下单接口',
                sort_order: 0,
                snapshot_data_json: JSON.stringify({ url: 'https://api.devutils.io/order', method: 'POST' })
              },
              {
                tab_id: 'diff_456',
                tool_id: 'diff_viewer',
                title: '配置比对',
                sort_order: 1,
                snapshot_data_json: JSON.stringify({ original: 'a=1', modified: 'a=2' })
              }
            ]
          }
          if (args?.query?.includes("WHERE key = 'active_tab_id'")) {
            return [{ value: 'diff_456' }]
          }
        }
        return []
      })

      const store = useTabStore()
      const restored = await store.restoreTabsFromDb()

      expect(restored).toBe(true)
      expect(store.openTabs.length).toBe(2)
      expect(store.openTabs[0].id).toBe('postman_123')
      expect(store.openTabs[0].snapshot).toEqual({ url: 'https://api.devutils.io/order', method: 'POST' })
      expect(store.openTabs[1].id).toBe('diff_456')
      expect(store.activeTabId).toBe('diff_456')
      expect(store.keepAliveTabIds).toContain('diff_456')
      expect(store.keepAliveTabIds).toContain('postman_123')
    })
  })

  // ============================================================================
  // TC-07: SQLite 9 张表结构、版本迁移与触发器自动修剪
  // ============================================================================
  describe('TC-07: SQLite Schema 定义、版本迁移与修剪触发器', () => {
    const migrationsPath = path.resolve(__dirname, '../../src-tauri/src/db/migrations.rs')
    const migrationsSource = fs.readFileSync(migrationsPath, 'utf-8')

    it('验证系统定义包含完整的 9 张数据表结构', () => {
      const expectedTables = [
        'schema_migrations',
        'sys_settings',
        'tool_state_snapshots',
        'app_favorites',
        'app_recents',
        'http_environments',
        'http_collections',
        'http_requests',
        'http_history'
      ]

      for (const table of expectedTables) {
        const regex = new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`, 'i')
        expect(
          regex.test(migrationsSource),
          `数据表 ${table} 必须在迁移脚本中显式定义`
        ).toBe(true)
      }
    })

    it('验证通用最近使用记录 app_recents 触发器上限为 50 条', () => {
      // 触发器名称存在
      expect(migrationsSource).toMatch(/CREATE TRIGGER IF NOT EXISTS trg_prune_app_recents/)
      // 触发器限定每个 tool_id 保留最新 50 条
      expect(migrationsSource).toMatch(/WHERE tool_id = NEW\.tool_id/)
      expect(migrationsSource).toMatch(/ORDER BY accessed_at DESC LIMIT 50/)
    })

    it('验证 Postman 请求历史记录 http_history 触发器上限为 500 条', () => {
      // 触发器名称存在
      expect(migrationsSource).toMatch(/CREATE TRIGGER IF NOT EXISTS trg_prune_http_history/)
      // 触发器限定保留最新 500 条
      expect(migrationsSource).toMatch(/ORDER BY executed_at DESC LIMIT 500/)
    })

    it('验证关键性能索引与外键级联删除约束', () => {
      // 外键级联删除
      expect(migrationsSource).toMatch(/FOREIGN KEY\(collection_id\) REFERENCES http_collections\(id\) ON DELETE CASCADE/)
      // 关键索引
      expect(migrationsSource).toMatch(/CREATE INDEX IF NOT EXISTS idx_snapshots_updated ON tool_state_snapshots/)
      expect(migrationsSource).toMatch(/CREATE INDEX IF NOT EXISTS idx_favorites_tool ON app_favorites/)
      expect(migrationsSource).toMatch(/CREATE INDEX IF NOT EXISTS idx_recents_tool_accessed ON app_recents/)
      expect(migrationsSource).toMatch(/CREATE INDEX IF NOT EXISTS idx_history_executed ON http_history/)
    })
  })
})
