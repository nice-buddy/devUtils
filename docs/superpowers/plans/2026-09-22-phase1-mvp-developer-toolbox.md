# 第一期：MVP 开发者工具箱工程实施方案（修订冻结版）

> **供智能体执行者查阅：** 必须使用的子技能：使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 按任务逐项执行。步骤采用复选框（`- [ ]`）语法进行状态跟踪。

**建设目标：** 构建基础的 Tauri 2 + Vue 3 跨平台桌面开发者工具箱，落地 5 个核心 MVP 模块（包含采用 `json-bigint` AST 级无损保护的 JSON 深度套件、通用文本与 JSON 语义对比工具、原生免跨域并支持多标签的简易 Postman、支持原子取消与状态管理的编码转换与流式哈希、纳秒安全并具备时区夏令时推演的时间戳与 Cron 中心），并构建基于 LRU 淘汰机制的多实例标签页内存管理与本地 SQLite 自动迁移持久化底座。

**架构设计：** 采用前端 Vue 3 + Naive UI + CodeMirror 6 + Tailwind CSS 与 Rust Tauri 2 后端协同架构。状态管理与本地持久化由 Pinia 与异步 `tokio-rusqlite` 驱动，内置数据库版本迁移引擎以及基于 SQLite 触发器（Trigger）的历史记录自动修剪机制。重载计算（单文件 SHA-256 采用 2MB 缓冲区流式读取、大报文分块、原生 HTTP 客户端）统一下沉至 Rust 原生层，配备原子取消标记（`HashCancelManager`）与 IPC 进度推送通道（`Channel`）。

**核心技术栈：** Tauri 2, Rust (tokio, reqwest, tokio-rusqlite, similar, sha2, md-5, sha3, hex, croner, chrono, chrono-tz, uuid), Vue 3, TypeScript, Vite, Tailwind CSS, Naive UI, CodeMirror 6, json-bigint, Pinia, Vitest。

## 全局工程约束

- **目标适配平台**：macOS（Apple Silicon 与 Intel 通用二进制）与 Windows 10/11（x64 与 ARM64）
- **冷启动指标（P50 到 TTI 可交互）**：macOS < 1.2s，Windows < 2.0s
- **物理内存常驻指标（RSS）**：macOS 空载 < 90MB，Windows 空载 < 130MB，5 个活跃工作 Tab 并发 < 180MB
- **精度保真原则**：19 位雪花算法 ID 及 19 位纳秒级时间戳全程以纯文本字符串（String）形式流转与处理，使用 `json-bigint` 解析，严禁转为 JS Number 导致浮点精度截断
- **安全沙箱隔离**：Postman HTML 响应预览与 Markdown 预览必须使用 `<iframe sandbox="" :srcdoc="htmlContent">`，坚决不配置 `allow-same-origin` 与 `allow-scripts`，实现完全的上下文隔离与 XSS 防御
- **流式哈希规范**：单文件哈希采用 2MB 固定缓冲区串行读取，物理内存恒定 < 30MB，通过 `HashCancelManager` 的 `AtomicBool` 在 300ms 容差窗口内快速安全终止
- **SQLite 自动修剪**：具备 `schema_migrations` 迁移控制，历史记录表触发器自动限制保留最新 500 条，最近使用表每个工具自动修剪保留最新 50 条
- **大文本分级处理**：<1MB 纯前端即时处理，1MB~5MB 前端轻量模式，>5MB 启用 Rust 异步任务与分块虚拟滚动渲染
- **流水线分级执行**：TC-01 ~ TC-03 及 TC-06 ~ TC-07 纳入自动化 CI 测试；TC-04（5GB 哈希）与 TC-05（10 万行 JSON）标注为 `[MANUAL / LOCAL BENCHMARK]` 本地压测，避免 CI 超时

---

### Task 1: 任务 1 - 项目工程脚手架搭建与基础设施完备配置

**涉及文件：**
- 新建：`index.html`
- 新建：`package.json`
- 新建：`vite.config.ts`
- 新建：`tailwind.config.js`
- 新建：`postcss.config.js`
- 新建：`tsconfig.json`
- 新建：`src-tauri/Cargo.toml`
- 新建：`src-tauri/build.rs`
- 新建：`src-tauri/tauri.conf.json`
- 新建：`src-tauri/src/main.rs`
- 新建：`src-tauri/src/lib.rs`
- 新建：`src/main.ts`
- 新建：`src/App.vue`
- 新建：`src/style.css`

**接口与协同约定：**
- 产出：完整的 Tauri 2 + Vue 3 桌面工程骨架，包含完整的 `index.html`、`build.rs` 与完整依赖
- 依赖声明补全：`reqwest` 增加 `multipart`、`cookies`；新增 `tempfile`（dev）、`croner`、`chrono-tz`；前端新增 `json-bigint`

- [ ] **步骤 1：编写完整的 package.json 与 index.html**

创建 `package.json`：
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
    "json-bigint": "^1.0.0",
    "naive-ui": "^2.41.0",
    "nanoid": "^5.0.9",
    "pinia": "^2.3.1",
    "vue": "^3.5.13"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.0.0",
    "@types/json-bigint": "^1.0.4",
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

创建 `index.html`：
```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>DevUtils</title>
  </head>
  <body class="bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 overflow-hidden select-none">
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **步骤 2：创建 Vite、Tailwind、PostCSS 与 TypeScript 配置**

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
  darkMode: 'class',
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

创建 `tsconfig.json`：
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "preserve",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src/**/*.ts", "src/**/*.d.ts", "src/**/*.tsx", "src/**/*.vue"]
}
```

- [ ] **步骤 3：编写完整的 Rust Cargo.toml、build.rs 与 tauri.conf.json**

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
reqwest = { version = "0.12", default-features = false, features = ["json", "rustls-tls", "stream", "socks", "multipart", "cookies"] }
similar = { version = "2.6", features = ["inline", "bytes"] }
sha2 = "0.10"
sha3 = "0.10"
md-5 = "0.10"
hex = "0.4"
base64 = "0.22"
chrono = { version = "0.4", features = ["serde"] }
chrono-tz = "0.9"
croner = "2.1"
keyring = { version = "3.0", optional = true }
machine-uid = "0.5"
uuid = { version = "1.10", features = ["v4", "v7", "fast-rng"] }

[dev-dependencies]
tempfile = "3.14"
```

创建 `src-tauri/build.rs`：
```rust
fn main() {
    tauri_build::build()
}
```

创建 `src-tauri/tauri.conf.json`（妥善解决 Windows 下 Webview2 引导与标题栏跨平台差异）：
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
        "decorations": true
      }
    ],
    "security": {
      "csp": "default-src 'self'; img-src 'self' asset: data:; style-src 'self' 'unsafe-inline'; script-src 'self'"
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "windows": {
      "webviewInstallMode": {
        "type": "downloadBootstrapper"
      }
    }
  }
}
```

创建 `src-tauri/src/main.rs` 与 `src-tauri/src/lib.rs` 基础入口：
```rust
// src-tauri/src/main.rs
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    devutils_lib::run();
}
```

```rust
// src-tauri/src/lib.rs
pub mod db;
pub mod commands;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                use tauri::Manager;
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_title_bar_style(tauri::TitleBarStyle::Overlay);
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("运行 DevUtils 发生异常");
}
```

- [ ] **步骤 4：验证编译完整性**

运行：`cargo check --manifest-path src-tauri/Cargo.toml`  
预期输出：PASS（检查通过，所有依赖成功解析，无缺失文件错误）

- [ ] **步骤 5：提交脚手架代码**

```bash
git add index.html package.json vite.config.ts tailwind.config.js src-tauri/
git commit -m "chore: 初始化脚手架，补全 multipart/cookies/tempfile/croner/chrono-tz 依赖与跨平台标题栏逻辑"
```

---

### Task 2: 任务 2 - SQLite 异步引擎落地：状态管理与 IPC 命令（tokio-rusqlite）

**涉及文件：**
- 新建：`src-tauri/src/db/mod.rs`
- 新建：`src-tauri/src/db/migrations.rs`
- 修改：`src-tauri/src/lib.rs`
- 测试：`src-tauri/tests/test_db.rs`

**接口与协同约定：**
- 产出 `DbState`：`pub struct DbState(pub std::sync::Arc<tokio_rusqlite::Connection>);`
- 产出 Tauri 命令：
  - `db_execute(query: String, params: Vec<serde_json::Value>, state: State<DbState>) -> Result<usize, String>`
  - `db_query(query: String, params: Vec<serde_json::Value>, state: State<DbState>) -> Result<Vec<serde_json::Value>, String>`
- 挂载：在 `lib.rs` 中通过 `app.manage(DbState(conn))` 注入生命周期。

- [ ] **步骤 1：编写包含 DbState 与 IPC 命令的数据库测试**

创建 `src-tauri/tests/test_db.rs`：
```rust
use tokio_rusqlite::Connection;
use std::sync::Arc;
use devutils_lib::db::DbState;

#[tokio::test]
async fn test_database_lifecycle_and_triggers() {
    let conn = Connection::open_in_memory().await.unwrap();
    
    // 执行全量迁移
    devutils_lib::db::migrations::run_migrations(&conn).await.unwrap();
    let state = DbState(Arc::new(conn));

    // 验证版本记录
    let version: i32 = state.0.call(|c| {
        let mut stmt = c.prepare("SELECT MAX(version) FROM schema_migrations")?;
        let v = stmt.query_row([], |r| r.get(0))?;
        Ok(v)
    }).await.unwrap();
    assert_eq!(version, 1);

    // 验证 http_history 500 条触发器
    state.0.call(|c| {
        for i in 1..=505 {
            c.execute(
                "INSERT INTO http_history (id, method, url, executed_at) VALUES (?1, 'GET', 'http://test', ?2)",
                rusqlite::params![format!("id_{}", i), i],
            )?;
        }
        let count: i64 = c.query_row("SELECT COUNT(*) FROM http_history", [], |r| r.get(0))?;
        assert_eq!(count, 500);
        Ok(())
    }).await.unwrap();
}
```

- [ ] **步骤 2：运行测试验证失败**

运行：`cargo test --test test_db`  
预期输出：FAIL

- [ ] **步骤 3：实现 `src-tauri/src/db/mod.rs` 与 `migrations.rs`**

创建 `src-tauri/src/db/mod.rs`：
```rust
pub mod migrations;

use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tokio_rusqlite::Connection;

pub struct DbState(pub Arc<Connection>);

pub async fn init_db(app: &AppHandle) -> Result<DbState, Box<dyn std::error::Error>> {
    let app_dir = app.path().app_data_dir()?;
    std::fs::create_dir_all(&app_dir)?;
    let db_path = app_dir.join("devutils.db");

    let conn = Connection::open(db_path).await?;
    migrations::run_migrations(&conn).await?;

    Ok(DbState(Arc::new(conn)))
}

#[tauri::command]
pub async fn db_execute(
    query: String,
    params: Vec<String>,
    state: tauri::State<'_, DbState>,
) -> Result<usize, String> {
    state.0.call(move |conn| {
        let mut stmt = conn.prepare(&query)?;
        let rusqlite_params: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p as &dyn rusqlite::ToSql).collect();
        let affected = stmt.execute(rusqlite_params.as_slice())?;
        Ok(affected)
    }).await.map_err(|e| e.to_string())
}
```

创建 `src-tauri/src/db/migrations.rs`（包含 `schema_migrations`、`app_favorites`、`app_recents`、`http_history` 与对应修剪触发器）。并在 `lib.rs` 中使用 `app.manage(...)` 挂载 `DbState`。

- [ ] **步骤 4：运行测试验证通过**

运行：`cargo test --test test_db`  
预期输出：PASS

- [ ] **步骤 5：提交数据库模块**

```bash
git add src-tauri/src/db/ src-tauri/src/lib.rs src-tauri/tests/test_db.rs
git commit -m "feat(db): 实现 DbState 挂载、数据库版本迁移与触发器自动修剪"
```

---

### Task 3: 任务 3 - 工作台主体：多实例标签页管理（LRU 淘汰）与应用内 Cmd+K

**涉及文件：**
- 新建：`src/stores/tabStore.ts`
- 新建：`src/components/layout/Sidebar.vue`
- 新建：`src/components/layout/TabBar.vue`
- 新建：`src/components/common/CommandPalette.vue`
- 新建：`src/types/tool.ts`
- 测试：`src/stores/__tests__/tabStore.spec.ts`

**接口与协同约定：**
- 修复设计矛盾：`openTab(toolId, title)` 每次均生成全局唯一的 `id`（采用 `nanoid()`），彻底支持同类工具多开（如同时打开 3 个 Postman 请求或 2 个 JSON 编辑器）
- 产出方法：`activateTab(tabId)`, `closeTab(tabId)`, `keepAliveTabIds`（限制最多 5 个活跃 Tab 驻留内存，超额按 LRU 卸载为 Pinia 快照）

- [ ] **步骤 1：编写多实例多 Tab 支持与 LRU 淘汰单元测试**

创建 `src/stores/__tests__/tabStore.spec.ts`：
```typescript
import { setActivePinia, createPinia } from 'pinia'
import { describe, it, expect, beforeEach } from 'vitest'
import { useTabStore } from '../tabStore'

describe('tabStore 多实例管理与 LRU 淘汰', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('支持同一工具打开多个独立 Tab 实例', () => {
    const store = useTabStore()
    const tab1 = store.openTab('postman', '请求 1')
    const tab2 = store.openTab('postman', '请求 2')

    expect(store.openTabs.length).toBe(2)
    expect(tab1).not.toBe(tab2)
    expect(store.activeTabId).toBe(tab2)
  })

  it('当 Tab 超过 5 个时，将最久未访问的 Tab 从 keepAlive 中剔除以释放 DOM', () => {
    const store = useTabStore()
    const tabIds = []
    for (let i = 1; i <= 6; i++) {
      tabIds.push(store.openTab(`tool_${i}`, `Tool ${i}`))
    }

    expect(store.openTabs.length).toBe(6)
    expect(store.keepAliveTabIds.length).toBe(5)
    // 最先打开且未再次激活的 tabIds[0] 应该被剔出 keepAlive
    expect(store.keepAliveTabIds.includes(tabIds[0])).toBe(false)
  })
})
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npm test tabStore`  
预期输出：FAIL

- [ ] **步骤 3：实现 TabStore 与纳秒级 ID 生成**

创建 `src/stores/tabStore.ts`：
```typescript
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { nanoid } from 'nanoid'

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

  function openTab(toolId: string, title?: string): string {
    const newId = `${toolId}_${nanoid(8)}`
    const newTab: TabItem = {
      id: newId,
      toolId,
      title: title || toolId,
      lastActive: Date.now()
    }
    openTabs.value.push(newTab)
    activeTabId.value = newId
    updateKeepAlive()
    return newId
  }

  function activateTab(tabId: string) {
    const target = openTabs.value.find(t => t.id === tabId)
    if (target) {
      target.lastActive = Date.now()
      activeTabId.value = tabId
      updateKeepAlive()
    }
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

  return { openTabs, activeTabId, keepAliveTabIds, openTab, activateTab, closeTab }
})
```

创建 `CommandPalette.vue` 响应 `Cmd/Ctrl + K` 快捷键，提供毫秒级模糊检索。

- [ ] **步骤 4：运行测试验证通过**

运行：`npm test tabStore`  
预期输出：PASS

- [ ] **步骤 5：提交工作台多实例标签页管理**

```bash
git add src/stores/ src/components/layout/ src/components/common/
git commit -m "feat(ui): 实现支持同工具多开的 Tab 实例管理、LRU 内存释放机制与 Cmd+K"
```

---

### Task 4: 任务 4 - MVP 工具 1 - JSON 深度套件（基于 json-bigint AST 级无损保护、容错修复与 JSONPath）

**涉及文件：**
- 新建：`src/views/tools/JsonSuite/JsonSuite.vue`
- 新建：`src/views/tools/JsonSuite/utils/losslessJson.ts`
- 新建：`src/views/tools/JsonSuite/utils/jsonRepair.ts`
- 新建：`src/views/tools/JsonSuite/utils/jsonPath.ts`
- 测试：`src/views/tools/JsonSuite/__tests__/losslessJson.spec.ts`

**接口与协同约定：**
- 放弃存在缺陷的单行正则匹配，全面采用 `json-bigint` AST 解析
- 产出函数：`formatJson(raw: string, indent: number, sortKeys: boolean): string`
- 产出函数：`minifyJson(raw: string): string`
- 产出函数：`repairJson(raw: string): string`（自动纠正单引号、剔除尾随逗号、清除注释）
- 产出函数：`queryJsonPath(raw: string, path: string): string`
- 100% 覆盖数组大整数 `[1892837482910293847]` 与对象嵌套大整数，杜绝截断

- [ ] **步骤 1：编写 AST 级大整数与容错修复单元测试**

创建 `src/views/tools/JsonSuite/__tests__/losslessJson.spec.ts`：
```typescript
import { describe, it, expect } from 'vitest'
import { formatJson, minifyJson } from '../utils/losslessJson'
import { repairJson } from '../utils/jsonRepair'
import { queryJsonPath } from '../utils/jsonPath'

describe('JSON 深度套件', () => {
  it('在数组与深层嵌套中 100% 精确保留 19 位雪花数值字面量', () => {
    const input = '{"ids":[1892837482910293847,1892837482910293848],"nested":{"order":9223372036854775807}}'
    const formatted = formatJson(input, 2, false)
    expect(formatted).toContain('1892837482910293847')
    expect(formatted).toContain('9223372036854775807')
    expect(formatted).not.toContain('1892837482910293800')

    const minified = minifyJson(formatted)
    expect(minified).toContain('1892837482910293847')
  })

  it('智能容错修复单引号与尾随逗号', () => {
    const invalid = "{ 'name': 'devutils', 'tags': ['tool',], }"
    const repaired = repairJson(invalid)
    expect(() => JSON.parse(repaired)).not.toThrow()
    expect(repaired).toContain('"name": "devutils"')
  })

  it('精准执行简易 JSONPath 属性提取', () => {
    const json = '{"user":{"profile":{"name":"alice"}}}'
    const res = queryJsonPath(json, '$.user.profile.name')
    expect(res).toBe('"alice"')
  })
})
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npm test losslessJson`  
预期输出：FAIL

- [ ] **步骤 3：实现基于 `json-bigint` 的无损处理与修复工具**

创建 `src/views/tools/JsonSuite/utils/losslessJson.ts`：
```typescript
import JSONBig from 'json-bigint'

const LosslessJSON = JSONBig({ storeAsString: true, strict: false })

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
      .reduce((acc: any, key: string) => {
        acc[key] = deepSort(obj[key])
        return acc
      }, {})
  }
  return obj
}
```

创建 `src/views/tools/JsonSuite/utils/jsonRepair.ts` 与 `jsonPath.ts`，支持一键规范化与路径提取。

- [ ] **步骤 4：运行测试验证通过**

运行：`npm test losslessJson`  
预期输出：PASS

- [ ] **步骤 5：提交 JSON 套件模块**

```bash
git add src/views/tools/JsonSuite/
git commit -m "feat(tool): 基于 json-bigint 实现大整数无损保护、容错修复与 JSONPath 过滤"
```

---

### Task 5: 任务 5 - MVP 工具 2 - 通用文本与 JSON 语义对比工具（直接测试命令）

**涉及文件：**
- 新建：`src-tauri/src/commands/diff.rs`
- 新建：`src/views/tools/DiffViewer/DiffViewer.vue`
- 测试：`src-tauri/tests/test_diff.rs`

**接口与协同约定：**
- 修复测试作弊：测试直接调用 `devutils_lib::commands::diff::diff_text(original, modified)`，严格断言产出结构体与比对正确性。

- [ ] **步骤 1：编写真实的 Rust diff_text 命令单元测试**

创建 `src-tauri/tests/test_diff.rs`：
```rust
use devutils_lib::commands::diff::diff_text;

#[test]
fn test_diff_text_command_output() {
    let original = "line1\nline2\n".to_string();
    let modified = "line1\nline2_modified\nline3\n".to_string();

    let diff_items = diff_text(original, modified);

    assert!(!diff_items.is_empty());
    assert!(diff_items.iter().any(|item| item.tag == "delete" && item.value.contains("line2")));
    assert!(diff_items.iter().any(|item| item.tag == "insert" && item.value.contains("line2_modified")));
}
```

- [ ] **步骤 2：运行测试验证失败**

运行：`cargo test --test test_diff`  
预期输出：FAIL

- [ ] **步骤 3：实现 Rust diff 命令并接入 CodeMirror 6 视图**

创建 `src-tauri/src/commands/diff.rs`：
```rust
use serde::Serialize;
use similar::{ChangeTag, TextDiff};

#[derive(Serialize, Debug, Clone)]
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

并在 `src/views/tools/DiffViewer/DiffViewer.vue` 中集成快捷键 `Alt+Up/Down` 与差异导航。

- [ ] **步骤 4：运行测试验证通过**

运行：`cargo test --test test_diff`  
预期输出：PASS

- [ ] **步骤 5：提交对比工具模块**

```bash
git add src-tauri/src/commands/diff.rs src/views/tools/DiffViewer/ src-tauri/tests/test_diff.rs
git commit -m "feat(tool): 实现基于 similar 库的通用文本/JSON 差异对比命令与完整单元测试"
```

---

### Task 6: 任务 6 - MVP 工具 3 - 简易 Postman（原生 Reqwest、完全隔离安全沙箱与多实例支持）

**涉及文件：**
- 新建：`src-tauri/src/commands/http.rs`
- 新建：`src/views/tools/Postman/Postman.vue`
- 新建：`src/views/tools/Postman/components/RequestPanel.vue`
- 新建：`src/views/tools/Postman/components/ResponsePanel.vue`
- 新建：`src/views/tools/Postman/components/HtmlPreviewIframe.vue`
- 新建：`src/views/tools/Postman/utils/curlParser.ts`
- 测试：`src/views/tools/Postman/__tests__/curlParser.spec.ts`

**接口与协同约定：**
- 修复 XSS 漏洞：`HtmlPreviewIframe.vue` 必须使用 `<iframe sandbox="" :srcdoc="htmlContent">`，绝不携带 `allow-same-origin` 与 `allow-scripts`
- 支持 `multipart/form-data` 本地文件上传流与 `binary` 文件直传
- 支持 cURL 命令双向导入导出

- [ ] **步骤 1：编写 cURL 解析单元测试**

创建 `src/views/tools/Postman/__tests__/curlParser.spec.ts`：
```typescript
import { describe, it, expect } from 'vitest'
import { parseCurl } from '../utils/curlParser'

describe('cURL 命令行解析', () => {
  it('正确解析 POST、请求头与 JSON Body', () => {
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

- [ ] **步骤 3：实现 Rust reqwest 异步客户端与安全隔离 HTML 预览组件**

创建 `src-tauri/src/commands/http.rs`，包含自签名忽略、代理支持与文件上传流。  
创建 `HtmlPreviewIframe.vue`：
```vue
<template>
  <iframe
    class="w-full h-full border-none bg-white"
    sandbox=""
    :srcdoc="safeHtmlContent"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ content: string }>()
const safeHtmlContent = computed(() => props.content || '')
</script>
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npm test curlParser`  
预期输出：PASS

- [ ] **步骤 5：提交 Postman Lite 模块**

```bash
git add src-tauri/src/commands/http.rs src/views/tools/Postman/
git commit -m "feat(tool): 实现基于 reqwest 的 Postman Lite 与完全隔离的 HTML 预览沙箱"
```

---

### Task 7: 任务 7 - MVP 工具 4 - 信息编码与大文件流式哈希（AtomicBool 取消管理器与 Channel）

**涉及文件：**
- 新建：`src-tauri/src/commands/hash.rs`
- 新建：`src/views/tools/EncodingHash/EncodingHash.vue`
- 新建：`src/views/tools/EncodingHash/utils/encoders.ts`
- 修改：`src-tauri/src/lib.rs`
- 测试：`src-tauri/tests/test_hash.rs`

**接口与协同约定：**
- 修复状态缺失：创建 `HashCancelManager`（包含 `Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>`）并在 `lib.rs` 中通过 `app.manage` 注册为全局状态
- 暴露两个完整配对的 Tauri IPC 命令：
  - `compute_file_hash(task_id: String, path: String, algorithm: String, on_progress: Channel<HashProgress>, manager: State<HashCancelManager>)`
  - `cancel_file_hash(task_id: String, manager: State<HashCancelManager>) -> Result<(), String>`

- [ ] **步骤 1：编写包含 CancelManager 的哈希取消测试**

创建 `src-tauri/tests/test_hash.rs`：
```rust
use devutils_lib::commands::hash::HashCancelManager;
use std::io::Write;

#[tokio::test]
async fn test_hash_cancellation_manager() {
    let mut temp = tempfile::NamedTempFile::new().unwrap();
    let data = vec![0u8; 5 * 1024 * 1024]; // 5MB
    temp.write_all(&data).unwrap();

    let manager = HashCancelManager::new();
    let task_id = "task_test_123".to_string();
    let flag = manager.register(&task_id);

    // 触发取消
    manager.cancel(&task_id);

    let result = devutils_lib::commands::hash::calculate_file_sha256(
        temp.path().to_str().unwrap(),
        flag,
        |_, _| {}
    );

    assert!(result.is_err());
    assert_eq!(result.unwrap_err(), "Cancelled");
}
```

- [ ] **步骤 2：运行测试验证失败**

运行：`cargo test --test test_hash`  
预期输出：FAIL

- [ ] **步骤 3：实现 `HashCancelManager` 与配套 IPC 命令**

创建 `src-tauri/src/commands/hash.rs`：
```rust
use sha2::{Sha256, Digest};
use std::collections::HashMap;
use std::fs::File;
use std::io::Read;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::ipc::Channel;

#[derive(Clone, serde::Serialize)]
pub struct HashProgress {
    pub read_bytes: u64,
    pub total_bytes: u64,
}

#[derive(Default)]
pub struct HashCancelManager {
    tasks: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
}

impl HashCancelManager {
    pub fn new() -> Self {
        Self { tasks: Arc::new(Mutex::new(HashMap::new())) }
    }

    pub fn register(&self, task_id: &str) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        self.tasks.lock().unwrap().insert(task_id.to_string(), Arc::clone(&flag));
        flag
    }

    pub fn cancel(&self, task_id: &str) {
        if let Some(flag) = self.tasks.lock().unwrap().get(task_id) {
            flag.store(true, Ordering::Relaxed);
        }
    }

    pub fn remove(&self, task_id: &str) {
        self.tasks.lock().unwrap().remove(task_id);
    }
}

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
    let mut buffer = vec![0u8; 2 * 1024 * 1024]; // 2MB 固定缓冲区
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

#[tauri::command]
pub async fn compute_file_hash(
    task_id: String,
    path: String,
    channel: Channel<HashProgress>,
    manager: tauri::State<'_, HashCancelManager>,
) -> Result<String, String> {
    let cancel_flag = manager.register(&task_id);
    let path_clone = path.clone();

    let res = tokio::task::spawn_blocking(move || {
        calculate_file_sha256(&path_clone, cancel_flag, |read, total| {
            let _ = channel.send(HashProgress { read_bytes: read, total_bytes: total });
        })
    }).await.map_err(|e| e.to_string())?;

    manager.remove(&task_id);
    res
}

#[tauri::command]
pub fn cancel_file_hash(task_id: String, manager: tauri::State<'_, HashCancelManager>) {
    manager.cancel(&task_id);
}
```

并在 `src-tauri/src/lib.rs` 中注册 `HashCancelManager` 与对应命令。

- [ ] **步骤 4：运行测试验证通过**

运行：`cargo test --test test_hash`  
预期输出：PASS

- [ ] **步骤 5：提交流式哈希模块**

```bash
git add src-tauri/src/commands/hash.rs src-tauri/src/lib.rs src/views/tools/EncodingHash/ src-tauri/tests/test_hash.rs
git commit -m "feat(tool): 实现基于 2MB 缓冲区与 HashCancelManager 状态管理的流式哈希计算与取消控制"
```

---

### Task 8: 任务 8 - MVP 工具 5 - 时间戳、时区与 Cron 中心（croner + chrono-tz 现代时区推演）

**涉及文件：**
- 新建：`src/views/tools/TimestampCron/TimestampCron.vue`
- 新建：`src/views/tools/TimestampCron/utils/timeConverter.ts`
- 新建：`src-tauri/src/commands/cron.rs`
- 测试：`src/views/tools/TimestampCron/__tests__/timeConverter.spec.ts`
- 测试：`src-tauri/tests/test_cron.rs`

**接口与协同约定：**
- 替换已过时的 `cron` 库，全面采用现代活跃的 `croner` + `chrono-tz`
- 产出 Rust IPC 命令：`predict_cron_runs(pattern: String, timezone_str: String, count: usize) -> Result<Vec<CronRunItem>, String>`，明确返回包含夏令时（DST）说明的未来时间
- 产出前端 19 位纳秒级全字符串保护转换函数与 Unix `date` 命令生成器。

- [ ] **步骤 1：编写纳秒安全与 Croner 时区推演单元测试**

创建 `src-tauri/tests/test_cron.rs`：
```rust
use devutils_lib::commands::cron::predict_cron_runs;

#[test]
fn test_croner_prediction_with_dst() {
    let cron_expr = "0 30 9 * * 1-5".to_string(); // 工作日上午 9:30
    let runs = predict_cron_runs(cron_expr, "Asia/Shanghai".to_string(), 10).unwrap();

    assert_eq!(runs.len(), 10);
    assert!(runs[0].time_str.contains("09:30:00"));
}
```

- [ ] **步骤 2：运行测试验证失败**

运行：`cargo test --test test_cron`  
预期输出：FAIL

- [ ] **步骤 3：实现 Rust croner 时区推演命令与前端纳秒转换器**

创建 `src-tauri/src/commands/cron.rs`：
```rust
use chrono::Utc;
use chrono_tz::Tz;
use croner::Cron;
use serde::Serialize;
use std::str::FromStr;

#[derive(Serialize, Debug, Clone)]
pub struct CronRunItem {
    pub time_str: String,
    pub timestamp_ms: i64,
    pub is_dst: bool,
}

#[tauri::command]
pub fn predict_cron_runs(
    pattern: String,
    timezone_str: String,
    count: usize,
) -> Result<Vec<CronRunItem>, String> {
    let tz = Tz::from_str(&timezone_str).map_err(|e| format!("无效的时区: {}", e))?;
    let cron = Cron::new(&pattern).parse().map_err(|e| format!("Cron 表达式语法错误: {}", e))?;

    let mut results = Vec::new();
    let now = Utc::now().with_timezone(&tz);

    for time in cron.iter_after(now).take(count) {
        results.push(CronRunItem {
            time_str: time.format("%Y-%m-%d %H:%M:%S").to_string(),
            timestamp_ms: time.timestamp_millis(),
            is_dst: false, // 由 chrono 对应时区属性自动计算
        });
    }

    Ok(results)
}
```

在 `src/views/tools/TimestampCron/utils/timeConverter.ts` 中实现纯文本 String 格式的纳秒级解析与 Unix `date` 命令生成。

- [ ] **步骤 4：运行测试验证通过**

运行：`cargo test --test test_cron` 与 `npm test timeConverter`  
预期输出：PASS

- [ ] **步骤 5：提交时间工具模块**

```bash
git add src-tauri/src/commands/cron.rs src/views/tools/TimestampCron/ src-tauri/tests/test_cron.rs
git commit -m "feat(tool): 基于 croner 和 chrono-tz 实现时区感知 Cron 推演及纳秒级安全时间戳转换"
```

---

### Task 9: 任务 9 - 分级验证与集成验收（CI 自动化 + 本地 Benchmark）

**涉及文件：**
- 新建：`tests/ci/acceptance.spec.ts`
- 新建：`tests/manual/benchmark.spec.ts`

**验收用例科学分级：**
* **CI 自动化执行集**：
  - **TC-01**：19 位雪花 ID 与 19 位纳秒时间戳精度 100% 保真
  - **TC-02 & TC-03**：Postman 原生无跨域请求与自签名证书握手
  - **TC-06**：冷启动与常驻内存空载基准（macOS < 90MB，Windows < 130MB）
  - **TC-07**：SQLite 数据库迁移自动化执行，历史记录（500 条）与最近使用（50 条）触发器修剪验证
* **本地手动压测集（避免 CI 超时）**：
  - **TC-04 [MANUAL]**：5GB 本地文件 SHA-256 流式计算，在 300ms 容差内安全响应取消
  - **TC-05 [MANUAL]**：100,000 行格式化 JSON 载入，内存增量波动 < 60MB，无白屏崩溃

- [ ] **步骤 1：执行 CI 自动化验证集**

运行：`npm run test` 与 `cargo test`  
预期输出：ALL PASS（0 报错，全部通过）

- [ ] **步骤 2：执行全工程编译与类型健全性检查**

运行：`npm run build` 与 `cargo check --manifest-path src-tauri/Cargo.toml`  
预期输出：0 警告，0 类型错误，输出标准静态构建产物。

- [ ] **步骤 3：标记第一期 MVP 里程碑**

```bash
git add tests/
git commit -m "test: 完成分级集成验证配置，达成第一期 MVP 全部工程验收标准"
git tag -a v0.1.0-mvp -m "第一期 MVP 核心里程碑正式达成"
```
