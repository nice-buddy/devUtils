# 第一期：MVP 开发者工具箱工程实施方案

> **供智能体执行者查阅：** 必须使用的子技能：使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 按任务逐项执行。步骤采用复选框（`- [ ]`）语法进行状态跟踪。

**建设目标：** 构建基础的 Tauri 2 + Vue 3 跨平台桌面开发者工具箱，落地 5 个核心 MVP 模块（包含大整数精度无损保护的 JSON 深度套件、通用文本与 JSON 语义对比工具、原生免跨域的简易 Postman、支持取消的编码转换与流式哈希计算、纳秒安全的时间戳与 Cron 推演中心），并构建基于 LRU 淘汰机制的标签页内存管理与本地 SQLite 自动迁移持久化底座。

**架构设计：** 采用前端 Vue 3 + Naive UI + CodeMirror 6 + Tailwind CSS 与 Rust Tauri 2 后端协同架构。状态管理与本地持久化由 Pinia 与异步 `tokio-rusqlite` 驱动，内置数据库版本迁移引擎以及基于 SQLite 触发器（Trigger）的历史记录自动修剪机制。重载计算（单文件 SHA-256 采用 2MB 缓冲区流式读取、大报文分块、原生 HTTP 客户端）统一下沉至 Rust 原生层，配备原子取消标记（AtomicBool）与 IPC 进度推送通道。

**核心技术栈：** Tauri 2, Rust (tokio, reqwest, tokio-rusqlite, similar, sha2, md-5, sha3, hex), Vue 3, TypeScript, Vite, Tailwind CSS, Naive UI, CodeMirror 6, Pinia, Vitest。

## 全局工程约束

- **目标适配平台**：macOS（Apple Silicon 与 Intel 通用二进制）与 Windows 10/11（x64 与 ARM64）
- **冷启动指标（P50 到 TTI 可交互）**：macOS < 1.2s，Windows < 2.0s
- **物理内存常驻指标（RSS）**：macOS 空载 < 90MB，Windows 空载 < 130MB，5 个活跃工作 Tab 并发 < 180MB
- **精度保真原则**：19 位雪花算法 ID 及 19 位纳秒级时间戳全程以纯文本字符串（String）形式流转与处理，严禁转为 JS Number 导致浮点精度截断
- **安全沙箱隔离**：Postman HTML 响应预览与 Markdown 预览必须使用 `<iframe sandbox="allow-same-origin">` 隔离沙箱，严禁赋予 `allow-scripts` 权限
- **流式哈希规范**：单文件哈希采用 2MB 固定缓冲区串行读取，物理内存恒定 < 30MB，支持通过 `AtomicBool` 在 300ms 容差窗口内快速安全终止
- **SQLite 自动修剪**：具备 `schema_migrations` 迁移控制，历史记录表触发器自动限制保留最新 500 条，最近使用表每个工具自动修剪保留最新 50 条
- **大文本分级处理**：<1MB 纯前端即时处理，1MB~5MB 前端轻量模式，>5MB 启用 Rust 异步任务与分块虚拟滚动渲染

---

### 任务 1：项目工程脚手架搭建与基础设施配置

**涉及文件：**
- 新建：`package.json`
- 新建：`vite.config.ts`
- 新建：`tailwind.config.js`
- 新建：`postcss.config.js`
- 新建：`tsconfig.json`
- 新建：`src-tauri/Cargo.toml`
- 新建：`src-tauri/tauri.conf.json`
- 新建：`src-tauri/src/main.rs`
- 新建：`src-tauri/src/lib.rs`
- 新建：`src/main.ts`
- 新建：`src/App.vue`
- 新建：`src/style.css`

**接口与协同约定：**
- 产出：正常运行的 Tauri 2 + Vue 3 桌面应用骨架，配置完成 Tailwind CSS、Naive UI 全局 Provider 与 Vitest 测试套件
- 依赖：标准 Node.js/pnpm 与 Rust Cargo 编译工具链

- [ ] **步骤 1：编写前端 package.json 与配置文件**

创建包含 Tauri 2、Vue 3、Tailwind CSS、Naive UI、Pinia 与 Vitest 依赖的 `package.json`：

```json
{
  "name": "devutils",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc --noEmit && vite build",
    "preview": "vite preview",
    "tauri": "tauri",
    "test": "vitest run"
  },
  "dependencies": {
    "@codemirror/lang-json": "^6.0.1",
    "@codemirror/state": "^6.5.2",
    "@codemirror/view": "^6.36.4",
    "@tauri-apps/api": "^2.0.0",
    "@tauri-apps/plugin-window-state": "^2.0.0",
    "codemirror": "^6.0.1",
    "naive-ui": "^2.41.0",
    "pinia": "^2.3.1",
    "vue": "^3.5.13"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.0.0",
    "@types/node": "^22.10.2",
    "@vitejs/plugin-vue": "^5.2.1",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.7.2",
    "vite": "^6.0.5",
    "vitest": "^2.1.8",
    "vue-tsc": "^2.2.0"
  }
}
```

- [ ] **步骤 2：配置 Vite、Tailwind、PostCSS 与 TypeScript**

创建 `vite.config.ts`：
```typescript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true
  }
})
```

创建 `tailwind.config.js`：
```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

创建 `postcss.config.js`：
```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **步骤 3：配置 Rust 依赖 Cargo.toml 与 Tauri 2 应用配置**

创建 `src-tauri/Cargo.toml`：
```toml
[package]
name = "devutils"
version = "0.1.0"
description = "DevUtils 跨平台桌面开发者工具箱"
edition = "2021"

[lib]
name = "devutils_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2.0.0", features = [] }

[dependencies]
tauri = { version = "2.0.0", features = ["tray-icon"] }
tauri-plugin-window-state = "2.0.0"
serde = { version = "1.0", features = ["derive"] }
serde_json = { version = "1.0", features = ["raw_value"] }
tokio = { version = "1.40", features = ["full"] }
tokio-rusqlite = "0.6.0"
rusqlite = { version = "0.32", features = ["bundled"] }
reqwest = { version = "0.12", default-features = false, features = ["json", "rustls-tls", "stream", "socks"] }
similar = { version = "2.6", features = ["inline", "bytes"] }
sha2 = "0.10"
sha3 = "0.10"
md-5 = "0.10"
hex = "0.4"
base64 = "0.22"
chrono = { version = "0.4", features = ["serde"] }
cron = "0.15"
keyring = { version = "3.0", optional = true }
machine-uid = "0.5"
uuid = { version = "1.10", features = ["v4", "v7", "fast-rng"] }
```

创建 `src-tauri/tauri.conf.json`：
```json
{
  "$schema": "https://raw.githubusercontent.com/tauri-apps/tauri/dev/tooling/cli/schema.json",
  "productName": "DevUtils",
  "version": "0.1.0",
  "identifier": "com.devutils.app",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "DevUtils",
        "width": 1200,
        "height": 800,
        "minWidth": 900,
        "minHeight": 600,
        "resizable": true,
        "decorations": true,
        "titleBarStyle": "Overlay"
      }
    ],
    "security": {
      "csp": "default-src 'self'; img-src 'self' asset: data:; style-src 'self' 'unsafe-inline'; script-src 'self'"
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

- [ ] **步骤 4：验证前端与 Rust 基础编译**

运行：`cargo check --manifest-path src-tauri/Cargo.toml`  
预期输出：PASS（编译检查通过，无语法或依赖错误）

- [ ] **步骤 5：提交脚手架代码**

```bash
git add package.json vite.config.ts tailwind.config.js src-tauri/
git commit -m "chore: 初始化 tauri 2 + vue 3 基础工程脚手架"
```

---

### 任务 2：SQLite 异步引擎与自动修剪触发器架构（tokio-rusqlite）

**涉及文件：**
- 新建：`src-tauri/src/db/mod.rs`
- 新建：`src-tauri/src/db/migrations.rs`
- 新建：`src-tauri/tests/test_db.rs`

**接口与协同约定：**
- 产出：管理 `tokio_rusqlite::Connection` 状态的 `DbState` 结构体
- 产出 IPC 命令：`db_execute`, `db_query`, `prune_recents`
- 依赖：`tokio-rusqlite` 与 `rusqlite`

- [ ] **步骤 1：编写数据库迁移与触发器自动化测试**

创建 `src-tauri/tests/test_db.rs`：
```rust
use tokio_rusqlite::Connection;

#[tokio::test]
async fn test_migrations_and_triggers() {
    let conn = Connection::open_in_memory().await.unwrap();
    
    // 执行数据库迁移初始化
    devutils_lib::db::migrations::run_migrations(&conn).await.unwrap();

    // 验证版本迁移记录是否存在
    let version: i32 = conn.call(|conn| {
        let mut stmt = conn.prepare("SELECT MAX(version) FROM schema_migrations")?;
        let v = stmt.query_row([], |row| row.get(0))?;
        Ok(v)
    }).await.unwrap();
    assert_eq!(version, 1);

    // 测试 http_history 500 条自动修剪触发器
    conn.call(|conn| {
        for i in 1..=505 {
            conn.execute(
                "INSERT INTO http_history (id, method, url, executed_at) VALUES (?1, 'GET', 'http://test', ?2)",
                rusqlite::params![format!("id_{}", i), i],
            )?;
        }
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM http_history", [], |r| r.get(0))?;
        assert_eq!(count, 500);
        Ok(())
    }).await.unwrap();

    // 测试 app_recents 单工具 50 条自动修剪触发器
    conn.call(|conn| {
        for i in 1..=55 {
            conn.execute(
                "INSERT INTO app_recents (id, tool_id, summary, payload_json, accessed_at) VALUES (?1, 'json_suite', 'test', '{}', ?2)",
                rusqlite::params![format!("rec_{}", i), i],
            )?;
        }
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM app_recents WHERE tool_id = 'json_suite'", [], |r| r.get(0))?;
        assert_eq!(count, 50);
        Ok(())
    }).await.unwrap();
}
```

- [ ] **步骤 2：运行测试验证失败**

运行：`cargo test --test test_db`  
预期输出：FAIL（找不到 `devutils_lib::db` 模块）

- [ ] **步骤 3：实现包含触发器的数据库版本迁移模块**

创建 `src-tauri/src/db/migrations.rs`：
```rust
use tokio_rusqlite::{Connection, Result};

pub async fn run_migrations(conn: &Connection) -> Result<()> {
    conn.call(|conn| {
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                applied_at INTEGER NOT NULL,
                description TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sys_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS tool_state_snapshots (
                tab_id TEXT PRIMARY KEY,
                tool_id TEXT NOT NULL,
                title TEXT NOT NULL,
                sort_order INTEGER NOT NULL,
                snapshot_data_json TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_snapshots_updated ON tool_state_snapshots(updated_at);

            CREATE TABLE IF NOT EXISTS app_favorites (
                id TEXT PRIMARY KEY,
                tool_id TEXT NOT NULL,
                title TEXT NOT NULL,
                category TEXT,
                content_json TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                sort_order INTEGER DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_favorites_tool ON app_favorites(tool_id);

            CREATE TABLE IF NOT EXISTS app_recents (
                id TEXT PRIMARY KEY,
                tool_id TEXT NOT NULL,
                summary TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                accessed_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_recents_tool_accessed ON app_recents(tool_id, accessed_at DESC);

            CREATE TRIGGER IF NOT EXISTS trg_prune_app_recents
            AFTER INSERT ON app_recents
            BEGIN
                DELETE FROM app_recents
                WHERE tool_id = NEW.tool_id
                  AND id NOT IN (
                      SELECT id FROM app_recents
                      WHERE tool_id = NEW.tool_id
                      ORDER BY accessed_at DESC LIMIT 50
                  );
            END;

            CREATE TABLE IF NOT EXISTS http_environments (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                variables_json TEXT NOT NULL,
                is_active INTEGER DEFAULT 0,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS http_collections (
                id TEXT PRIMARY KEY,
                parent_id TEXT,
                name TEXT NOT NULL,
                sort_order INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS http_requests (
                id TEXT PRIMARY KEY,
                collection_id TEXT,
                name TEXT NOT NULL,
                method TEXT NOT NULL,
                url TEXT NOT NULL,
                headers_json TEXT,
                params_json TEXT,
                body_type TEXT,
                body_content TEXT,
                auth_json TEXT,
                settings_json TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY(collection_id) REFERENCES http_collections(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS http_history (
                id TEXT PRIMARY KEY,
                method TEXT NOT NULL,
                url TEXT NOT NULL,
                status_code INTEGER,
                duration_ms INTEGER,
                request_data_json TEXT,
                response_summary_json TEXT,
                executed_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_history_executed ON http_history(executed_at DESC);

            CREATE TRIGGER IF NOT EXISTS trg_prune_http_history
            AFTER INSERT ON http_history
            BEGIN
                DELETE FROM http_history
                WHERE id NOT IN (
                    SELECT id FROM http_history ORDER BY executed_at DESC LIMIT 500
                );
            END;

            INSERT OR IGNORE INTO schema_migrations (version, applied_at, description)
            VALUES (1, strftime('%s', 'now'), '初始化表结构与自动修剪触发器');
            "
        )?;
        Ok(())
    }).await
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`cargo test --test test_db`  
预期输出：PASS（迁移与触发器自动修剪测试 100% 通过）

- [ ] **步骤 5：提交数据库模块**

```bash
git add src-tauri/src/db/ src-tauri/tests/test_db.rs
git commit -m "feat(db): 实现基于 tokio-rusqlite 的异步数据库迁移与触发器自动修剪机制"
```

---

### 任务 3：工作台主体：侧边栏导航、Tab 系统（LRU 淘汰卸载）与应用内 Cmd+K

**涉及文件：**
- 新建：`src/stores/tabStore.ts`
- 新建：`src/stores/settingStore.ts`
- 新建：`src/components/layout/Sidebar.vue`
- 新建：`src/components/layout/TabBar.vue`
- 新建：`src/components/common/CommandPalette.vue`
- 新建：`src/types/tool.ts`
- 测试：`src/stores/__tests__/tabStore.spec.ts`

**接口与协同约定：**
- 产出：Pinia 状态 `useTabStore`，提供 `openTab(toolId)`, `closeTab(tabId)`, `activeTabId`, `keepAliveTabIds`（限制最多 5 个驻留内存，超额按 LRU 卸载为快照）
- 产出：`CommandPalette.vue` 命令面板组件，监听 `Cmd/Ctrl + K` 实现毫秒级模糊检索跳转

- [ ] **步骤 1：编写 TabStore LRU 内存淘汰单元测试**

创建 `src/stores/__tests__/tabStore.spec.ts`：
```typescript
import { setActivePinia, createPinia } from 'pinia'
import { describe, it, expect, beforeEach } from 'vitest'
import { useTabStore } from '../tabStore'

describe('tabStore 标签页 LRU 淘汰机制', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('当标签页打开超过 5 个时，将最久未访问的标签从 keepAlive 激活列表中移除', () => {
    const store = useTabStore()
    for (let i = 1; i <= 6; i++) {
      store.openTab(`tool_${i}`)
    }
    expect(store.openTabs.length).toBe(6)
    expect(store.keepAliveTabIds.length).toBe(5)
    // 第一个打开且未再访问的工具应被移出 keepAlive 列表，但保留在 openTabs 供用户随时切回
    expect(store.keepAliveTabIds.includes(store.openTabs[0].id)).toBe(false)
  })
})
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npm test tabStore`  
预期输出：FAIL

- [ ] **步骤 3：实现 TabStore 与状态序列化逻辑**

创建 `src/stores/tabStore.ts`：
```typescript
import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface TabItem {
  id: string
  toolId: string
  title: string
  snapshot?: Record<string, any>
  lastActive: number
}

const MAX_KEEPALIVE_TABS = 5

export const useTabStore = defineStore('tabs', () => {
  const openTabs = ref<TabItem[]>([])
  const activeTabId = ref<string>('')
  const keepAliveTabIds = ref<string[]>([])

  function openTab(toolId: string, title?: string) {
    const existing = openTabs.value.find(t => t.toolId === toolId)
    if (existing) {
      activeTabId.value = existing.id
      existing.lastActive = Date.now()
      updateKeepAlive()
      return existing.id
    }

    const newTab: TabItem = {
      id: `${toolId}_${Date.now()}`,
      toolId,
      title: title || toolId,
      lastActive: Date.now()
    }
    openTabs.value.push(newTab)
    activeTabId.value = newTab.id
    updateKeepAlive()
    return newTab.id
  }

  function closeTab(tabId: string) {
    const idx = openTabs.value.findIndex(t => t.id === tabId)
    if (idx === -1) return
    openTabs.value.splice(idx, 1)
    if (activeTabId.value === tabId) {
      activeTabId.value = openTabs.value[Math.max(0, idx - 1)]?.id || ''
    }
    updateKeepAlive()
  }

  function updateKeepAlive() {
    const sorted = [...openTabs.value].sort((a, b) => b.lastActive - a.lastActive)
    keepAliveTabIds.value = sorted.slice(0, MAX_KEEPALIVE_TABS).map(t => t.id)
  }

  return { openTabs, activeTabId, keepAliveTabIds, openTab, closeTab }
})
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npm test tabStore`  
预期输出：PASS

- [ ] **步骤 5：提交工作台主体组件**

```bash
git add src/stores/ src/components/layout/ src/types/
git commit -m "feat(ui): 实现工作台多标签页管理、LRU 内存卸载机制与 Cmd+K 快速检索面板"
```

---

### 任务 4：MVP 工具 1 - JSON 深度套件（大整数精度无损保护与 JSONPath）

**涉及文件：**
- 新建：`src/views/tools/JsonSuite/JsonSuite.vue`
- 新建：`src/views/tools/JsonSuite/utils/losslessJson.ts`
- 新建：`src/views/tools/JsonSuite/utils/jsonPath.ts`
- 测试：`src/views/tools/JsonSuite/__tests__/losslessJson.spec.ts`

**接口与协同约定：**
- 产出函数：`formatJson(raw: string, indent: number, sortKeys: boolean): string`
- 产出函数：`minifyJson(raw: string): string`
- 产出函数：`queryJsonPath(raw: string, path: string): string`
- 精度保障：严格保留 19 位雪花数值（如 `1892837482910293847`），严禁发生末位精度截断。

- [ ] **步骤 1：编写大整数无损格式化单元测试**

创建 `src/views/tools/JsonSuite/__tests__/losslessJson.spec.ts`：
```typescript
import { describe, it, expect } from 'vitest'
import { formatJson, minifyJson } from '../utils/losslessJson'

describe('losslessJson 大整数精度无损格式化', () => {
  it('格式化与压缩过程中 100% 精确保留 19 位雪花 ID，不发生精度丢失截断', () => {
    const input = '{"orderId":1892837482910293847,"code":"OK"}'
    const formatted = formatJson(input, 2, false)
    expect(formatted).toContain('1892837482910293847')
    expect(formatted).not.toContain('1892837482910293800')

    const minified = minifyJson(formatted)
    expect(minified).toContain('1892837482910293847')
  })

  it('支持深度递归对所有层级的 Object Key 按字母序排列', () => {
    const input = '{"b":1,"a":{"d":4,"c":3}}'
    const formatted = formatJson(input, 2, true)
    expect(formatted.indexOf('"a"')).toBeLessThan(formatted.indexOf('"b"'))
    expect(formatted.indexOf('"c"')).toBeLessThan(formatted.indexOf('"d"'))
  })
})
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npm test losslessJson`  
预期输出：FAIL

- [ ] **步骤 3：实现无损 Tokenizer 词法保护与格式化器**

创建 `src/views/tools/JsonSuite/utils/losslessJson.ts`：
```typescript
// 利用正则预处理保护超过 15 位的数值字面量，防止 JSON.parse 浮点截断
const BIGINT_REGEX = /:\s*(-?\d{16,})/g

export function formatJson(raw: string, indent: number = 2, sortKeys: boolean = false): string {
  const protectedRaw = raw.replace(BIGINT_REGEX, ': "__BIGINT_$1__"')
  const parsed = JSON.parse(protectedRaw)

  const processed = sortKeys ? deepSort(parsed) : parsed
  const formatted = JSON.stringify(processed, null, indent)

  return formatted.replace(/"__BIGINT_(-?\d+)__"/g, '$1')
}

export function minifyJson(raw: string): string {
  const protectedRaw = raw.replace(BIGINT_REGEX, ': "__BIGINT_$1__"')
  const parsed = JSON.parse(protectedRaw)
  const minified = JSON.stringify(parsed)
  return minified.replace(/"__BIGINT_(-?\d+)__"/g, '$1')
}

function deepSort(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(deepSort)
  } else if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj)
      .sort()
      .reduce((acc: any, key: string) => {
        acc[key] = deepSort(obj[key])
        return acc
      }, {})
  }
  return obj
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npm test losslessJson`  
预期输出：PASS

- [ ] **步骤 5：提交 JSON 深度套件**

```bash
git add src/views/tools/JsonSuite/
git commit -m "feat(tool): 实现集成大整数无损保护与递归排序的 JSON 深度套件"
```

---

### 任务 5：MVP 工具 2 - 通用文本与 JSON 语义对比工具（Diff Viewer）

**涉及文件：**
- 新建：`src-tauri/src/commands/diff.rs`
- 新建：`src/views/tools/DiffViewer/DiffViewer.vue`
- 新建：`src/views/tools/DiffViewer/utils/semanticDiff.ts`
- 测试：`src-tauri/tests/test_diff.rs`

**接口与协同约定：**
- 产出 Rust IPC 命令：`diff_text(original: String, modified: String) -> Vec<DiffItem>`
- 产出前端组件：支持双栏分屏（Split）与单栏内联（Inline）切换，支持快捷键 `Alt + ↑ / ↓` 跳转差异行，顶部显示差异汇总统计指标。

- [ ] **步骤 1：编写 Rust similar 比对测试**

创建 `src-tauri/tests/test_diff.rs`：
```rust
use similar::{ChangeTag, TextDiff};

#[test]
fn test_similar_line_diff() {
    let original = "line1\nline2\n";
    let modified = "line1\nline2_mod\nline3\n";
    let diff = TextDiff::from_lines(original, modified);
    let changes: Vec<_> = diff.iter_all_changes().collect();
    
    assert!(changes.iter().any(|c| c.tag() == ChangeTag::Delete));
    assert!(changes.iter().any(|c| c.tag() == ChangeTag::Insert));
}
```

- [ ] **步骤 2：运行测试验证通过**

运行：`cargo test --test test_diff`  
预期输出：PASS

- [ ] **步骤 3：实现 Rust diff 命令并对接前端视图**

创建 `src-tauri/src/commands/diff.rs`：
```rust
use serde::Serialize;
use similar::{ChangeTag, TextDiff};

#[derive(Serialize)]
pub struct DiffItem {
    pub tag: String, // "insert", "delete", "equal"
    pub value: String,
    pub old_index: Option<usize>,
    pub new_index: Option<usize>,
}

#[tauri::command]
pub fn diff_text(original: String, modified: String) -> Vec<DiffItem> {
    let diff = TextDiff::from_lines(&original, &modified);
    let mut items = Vec::new();

    for change in diff.iter_all_changes() {
        let tag = match change.tag() {
            ChangeTag::Delete => "delete",
            ChangeTag::Insert => "insert",
            ChangeTag::Equal => "equal",
        };
        items.push(DiffItem {
            tag: tag.to_string(),
            value: change.value().to_string(),
            old_index: change.old_index(),
            new_index: change.new_index(),
        });
    }

    items
}
```

在 `src/views/tools/DiffViewer/DiffViewer.vue` 中接入 CodeMirror 6 与该比对命令。

- [ ] **步骤 4：提交对比工具**

```bash
git add src-tauri/src/commands/diff.rs src/views/tools/DiffViewer/
git commit -m "feat(tool): 基于 similar 库实现通用文本与 JSON 语义对比工具"
```

---

### 任务 6：MVP 工具 3 - 简易 Postman（原生 Reqwest、免跨域、环境变量与沙箱预览）

**涉及文件：**
- 新建：`src-tauri/src/commands/http.rs`
- 新建：`src/views/tools/Postman/Postman.vue`
- 新建：`src/views/tools/Postman/components/RequestPanel.vue`
- 新建：`src/views/tools/Postman/components/ResponsePanel.vue`
- 新建：`src/views/tools/Postman/components/HtmlPreviewIframe.vue`
- 新建：`src/views/tools/Postman/utils/curlParser.ts`
- 测试：`src/views/tools/Postman/__tests__/curlParser.spec.ts`

**接口与协同约定：**
- 产出 Rust IPC 命令：`http_execute(req: HttpRequestPayload) -> Result<HttpResponsePayload, String>`
- 产出组件：`HtmlPreviewIframe.vue`，严格使用 `<iframe sandbox="allow-same-origin" :srcdoc="htmlContent">`，坚决不配置 `allow-scripts`，防御 XSS 攻击
- 产出：cURL 命令行一键导入与导出工具函数。

- [ ] **步骤 1：编写 cURL 导入解析器单元测试**

创建 `src/views/tools/Postman/__tests__/curlParser.spec.ts`：
```typescript
import { describe, it, expect } from 'vitest'
import { parseCurl } from '../utils/curlParser'

describe('curlParser 命令行解析器', () => {
  it('正确解析包含 POST、Headers 与 JSON Body 的复杂 cURL 字符串', () => {
    const curl = `curl -X POST "https://api.example.com/login" -H "Content-Type: application/json" -d '{"user":"test"}'`
    const parsed = parseCurl(curl)
    expect(parsed.method).toBe('POST')
    expect(parsed.url).toBe('https://api.example.com/login')
    expect(parsed.headers['Content-Type']).toBe('application/json')
    expect(parsed.body).toBe('{"user":"test"}')
  })
})
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npm test curlParser`  
预期输出：FAIL

- [ ] **步骤 3：实现 cURL 解析器与 Rust reqwest 异步客户端**

实现 `src/views/tools/Postman/utils/curlParser.ts`。  
创建 `src-tauri/src/commands/http.rs`，支持自签名证书忽略、环境变量插值与历史记录持久化。  
创建 `HtmlPreviewIframe.vue` 落实 `<iframe sandbox="allow-same-origin">` 隔离沙箱。

- [ ] **步骤 4：运行测试验证通过**

运行：`npm test curlParser`  
预期输出：PASS

- [ ] **步骤 5：提交 Postman Lite 模块**

```bash
git add src-tauri/src/commands/http.rs src/views/tools/Postman/
git commit -m "feat(tool): 实现基于 Rust 原生 reqwest 的无跨域 Postman Lite 及安全预览沙箱"
```

---

### 任务 7：MVP 工具 4 - 信息编码与大文件流式哈希（带 2MB 缓冲区与原子取消）

**涉及文件：**
- 新建：`src-tauri/src/commands/hash.rs`
- 新建：`src/views/tools/EncodingHash/EncodingHash.vue`
- 新建：`src/views/tools/EncodingHash/utils/encoders.ts`
- 测试：`src/views/tools/EncodingHash/__tests__/encoders.spec.ts`
- 测试：`src-tauri/tests/test_hash.rs`

**接口与协同约定：**
- 产出 Rust IPC 命令：`compute_file_hash(path: String, algorithm: String, on_progress: Channel<HashProgress>, cancel_token: State<HashCancelManager>)`
- 内存约束：计算 10GB+ 超大文件时，通过 2MB 固定缓冲区使常驻内存稳定维持在 < 30MB
- 响应容差：取消指令下发后，底层在 300ms 容差窗口内安全释放文件句柄并终止任务。

- [ ] **步骤 1：编写哈希流式计算与原子取消测试**

创建 `src-tauri/tests/test_hash.rs`：
```rust
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::io::Write;

#[test]
fn test_stream_hash_with_cancel() {
    let mut temp = tempfile::NamedTempFile::new().unwrap();
    let data = vec![0u8; 10 * 1024 * 1024]; // 10MB 模拟测试文件
    temp.write_all(&data).unwrap();

    let cancel_flag = Arc::new(AtomicBool::new(true)); // 模拟已触发取消
    let result = devutils_lib::commands::hash::calculate_file_sha256(
        temp.path().to_str().unwrap(),
        cancel_flag,
        |_, _| {}
    );
    assert!(result.is_err());
    assert_eq!(result.unwrap_err(), "Cancelled");
}
```

- [ ] **步骤 2：运行测试验证失败**

运行：`cargo test --test test_hash`  
预期输出：FAIL

- [ ] **步骤 3：实现 2MB 固定缓冲区串行流式哈希算法与 AtomicBool 取消机制**

创建 `src-tauri/src/commands/hash.rs`：
```rust
use sha2::{Sha256, Digest};
use std::fs::File;
use std::io::Read;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

pub fn calculate_file_sha256<F>(
    path: &str,
    cancel_flag: Arc<AtomicBool>,
    mut progress_cb: F,
) -> Result<String, String>
where
    F: FnMut(u64, u64),
{
    let mut file = File::open(path).map_err(|e| e.to_string())?;
    let total_size = file.metadata().map_err(|e| e.to_string())?.len();
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 2 * 1024 * 1024]; // 2MB 固定缓冲区，避免内存膨胀
    let mut read_bytes = 0u64;

    loop {
        if cancel_flag.load(Ordering::Relaxed) {
            return Err("Cancelled".to_string());
        }
        let n = file.read(&mut buffer).map_err(|e| e.to_string())?;
        if n == 0 { break; }
        hasher.update(&buffer[..n]);
        read_bytes += n as u64;
        progress_cb(read_bytes, total_size);
    }

    Ok(hex::encode(hasher.finalize()))
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`cargo test --test test_hash`  
预期输出：PASS

- [ ] **步骤 5：提交编码与哈希模块**

```bash
git add src-tauri/src/commands/hash.rs src/views/tools/EncodingHash/
git commit -m "feat(tool): 实现信息编码互转与基于 2MB 缓冲区支持取消的大文件流式哈希计算"
```

---

### 任务 8：MVP 工具 5 - 时间戳、时区与 Cron 推演中心（纳秒安全与 Unix date 互转）

**涉及文件：**
- 新建：`src/views/tools/TimestampCron/TimestampCron.vue`
- 新建：`src/views/tools/TimestampCron/utils/timeConverter.ts`
- 新建：`src-tauri/src/commands/cron.rs`
- 测试：`src/views/tools/TimestampCron/__tests__/timeConverter.spec.ts`

**接口与协同约定：**
- 产出：19 位纳秒级安全字符串解析与跨时区矩阵换算
- 产出：Unix 终端 `date -r`（macOS）与 `date -d`（Linux）命令自动生成器
- 产出：基于 Rust `cron` 库的 Cron 表达式未来 10 次运行推演（含夏令时 DST 说明）。

- [ ] **步骤 1：编写纳秒安全与 Unix date 命令行生成单元测试**

创建 `src/views/tools/TimestampCron/__tests__/timeConverter.spec.ts`：
```typescript
import { describe, it, expect } from 'vitest'
import { parseTimestampString, generateUnixDateCmd } from '../utils/timeConverter'

describe('timeConverter 时间工具', () => {
  it('正确解析 19 位纳秒时间戳，全程使用字符串保持精度不失真', () => {
    const nanoStr = "1790000000123456789"
    const parsed = parseTimestampString(nanoStr)
    expect(parsed.unit).toBe('ns')
    expect(parsed.rawString).toBe("1790000000123456789")
  })

  it('针对时间戳精准生成适用于 macOS 与 Linux 终端的 date 调试命令', () => {
    const sec = "1790000000"
    const cmds = generateUnixDateCmd(sec)
    expect(cmds.macos).toBe("date -r 1790000000")
    expect(cmds.linux).toBe("date -d @1790000000")
  })
})
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npm test timeConverter`  
预期输出：FAIL

- [ ] **步骤 3：实现纳秒安全转换器与 Rust Cron 推演命令**

实现 `src/views/tools/TimestampCron/utils/timeConverter.ts` 与 `src-tauri/src/commands/cron.rs`，并在 `TimestampCron.vue` 中构建可视化时区与推演卡片。

- [ ] **步骤 4：运行测试验证通过**

运行：`npm test timeConverter`  
预期输出：PASS

- [ ] **步骤 5：提交时间工具模块**

```bash
git add src/views/tools/TimestampCron/ src-tauri/src/commands/cron.rs
git commit -m "feat(tool): 实现纳秒安全时间戳转换、世界时区矩阵、Unix date 终端命令与 Cron 推演"
```

---

### 任务 9：全量集成验证与性能基准验收（TC-01 ~ TC-07）

**涉及文件：**
- 新建：`tests/e2e/benchmark.spec.ts`
- 修改：`docs/superpowers/specs/2026-09-22-developer-toolbox-design.md`

**验证项全量覆盖：**
- **TC-01**：长整数雪花 ID（19位）与纳秒级时间戳精度 100% 保真
- **TC-02 & TC-03**：Postman 原生无跨域请求与忽略自签名 SSL 证书握手
- **TC-04**：5GB 文件哈希流式读取，300ms 内安全响应取消请求
- **TC-05**：100,000 行 JSON 正常载入，内存增量波动 < 60MB，无白屏崩溃
- **TC-06**：冷启动常驻物理内存：macOS < 90MB，Windows < 130MB
- **TC-07**：SQLite 数据库迁移自动化执行，500 条历史记录与 50 条最近记录触发器自动修剪生效

- [ ] **步骤 1：执行全量单元测试与组件测试**

运行：`npm test` 与 `cargo test`  
预期输出：全部 PASS，0 失败。

- [ ] **步骤 2：执行全工程编译与类型健全性检查**

运行：`npm run build` 与 `cargo check --manifest-path src-tauri/Cargo.toml`  
预期输出：0 警告，0 类型错误，输出标准静态资源。

- [ ] **步骤 3：提交集成测试并标记 MVP 里程碑 Tag**

```bash
git add tests/
git commit -m "test: 添加全量自动化验收测试套件，通过 TC-01 至 TC-07 验收标准"
git tag -a v0.1.0-mvp -m "第一期 MVP 核心里程碑完成"
```
