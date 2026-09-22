# Phase 1: MVP Developer Toolbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the foundational Tauri 2 + Vue 3 desktop developer toolbox with 5 core MVP modules (JSON Suite with BigInt lossless protection, Text & JSON Diff, Postman Lite with native CORS-free networking, Encoding & streaming hash with cancellation, and Timestamp & Cron Hub) and local SQLite persistence with LRU tab memory management.

**Architecture:** A lightweight desktop workbench pairing Vue 3, Naive UI, CodeMirror 6, and Tailwind CSS with a Rust Tauri 2 backend. State and persistence are handled via Pinia and asynchronous `tokio-rusqlite` with automatic database migration and trigger-based history pruning. Heavy computations (>5MB, single-file SHA-256 with 2MB buffer, network requests) run natively in Rust with cancellation tokens and IPC progress channels.

**Tech Stack:** Tauri 2, Rust (tokio, reqwest, tokio-rusqlite, similar, sha2, md-5, sha3, hex), Vue 3, TypeScript, Vite, Tailwind CSS, Naive UI, CodeMirror 6, Pinia, Vitest.

## Global Constraints

- Target platforms: macOS (Apple Silicon + Intel universal) & Windows 10/11 (x64 & ARM64)
- Cold start P50 to TTI (Time to Interactive): macOS < 1.2s, Windows < 2.0s
- Idle memory RSS: macOS < 90MB, Windows < 130MB, 5 active tabs < 180MB
- 19-digit snowflake IDs and 19-digit nanoseconds must be string-preserved without numeric precision loss
- Postman preview and Markdown preview must use `<iframe sandbox="allow-same-origin">` without `allow-scripts`
- File hash: 2MB buffer serial read with `AtomicBool` cancellation in < 300ms window
- SQLite: `schema_migrations`, triggers for 500 history items and 50 recents per tool
- Text threshold rules: <1MB in frontend, 1MB-5MB lightweight mode, >5MB Rust task_id & virtual chunking

---

### Task 1: Project Scaffolding & Foundation Setup

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `tailwind.config.js`
- Create: `postcss.config.js`
- Create: `tsconfig.json`
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/src/lib.rs`
- Create: `src/main.ts`
- Create: `src/App.vue`
- Create: `src/style.css`

**Interfaces:**
- Produces: Running Tauri 2 + Vue 3 shell with Tailwind CSS & Naive UI provider setup
- Consumes: Standard Vite and Cargo build tools

- [ ] **Step 1: Write package.json and frontend configs**

Create `package.json` with Tauri 2, Vue 3, Tailwind CSS, Naive UI, Pinia, and Vitest dependencies:

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

- [ ] **Step 2: Configure Vite, Tailwind, PostCSS, and TypeScript**

Create `vite.config.ts`:
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

Create `tailwind.config.js`:
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

Create `postcss.config.js`:
```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 3: Setup Cargo.toml and Tauri 2 configuration**

Create `src-tauri/Cargo.toml`:
```toml
[package]
name = "devutils"
version = "0.1.0"
description = "DevUtils desktop developer toolbox"
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

Create `src-tauri/tauri.conf.json`:
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

- [ ] **Step 4: Verify frontend and cargo compilation**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: PASS with no compilation errors.

- [ ] **Step 5: Commit baseline scaffold**

```bash
git add package.json vite.config.ts tailwind.config.js src-tauri/
git commit -m "chore: initialize tauri 2 + vue 3 project scaffold"
```

---

### Task 2: SQLite Async Engine & Pruning Migrations (`tokio-rusqlite`)

**Files:**
- Create: `src-tauri/src/db/mod.rs`
- Create: `src-tauri/src/db/migrations.rs`
- Create: `src-tauri/tests/test_db.rs`

**Interfaces:**
- Produces: `DbState` holding `tokio_rusqlite::Connection`
- Produces commands: `db_execute`, `db_query`, `prune_recents`
- Consumes: `tokio-rusqlite`

- [ ] **Step 1: Write database schema migration test**

Create `src-tauri/tests/test_db.rs`:
```rust
use tokio_rusqlite::Connection;

#[tokio::test]
async fn test_migrations_and_triggers() {
    let conn = Connection::open_in_memory().await.unwrap();
    
    // Apply migrations
    devutils_lib::db::migrations::run_migrations(&conn).await.unwrap();

    // Verify migration record exists
    let version: i32 = conn.call(|conn| {
        let mut stmt = conn.prepare("SELECT MAX(version) FROM schema_migrations")?;
        let v = stmt.query_row([], |row| row.get(0))?;
        Ok(v)
    }).await.unwrap();
    assert_eq!(version, 1);

    // Test http_history 500-item trigger pruning
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
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --test test_db`
Expected: FAIL (module `devutils_lib::db` not found)

- [ ] **Step 3: Implement database migrations with triggers**

Create `src-tauri/src/db/migrations.rs`:
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
            VALUES (1, strftime('%s', 'now'), 'Initial schema setup with triggers');
            "
        )?;
        Ok(())
    }).await
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test --test test_db`
Expected: PASS

- [ ] **Step 5: Commit database migration module**

```bash
git add src-tauri/src/db/ src-tauri/tests/test_db.rs
git commit -m "feat(db): implement async sqlite schema migration and pruning triggers"
```

---

### Task 3: Workbench Shell: Sidebar, Tab System (LRU Eviction), and In-App Cmd+K

**Files:**
- Create: `src/stores/tabStore.ts`
- Create: `src/stores/settingStore.ts`
- Create: `src/components/layout/Sidebar.vue`
- Create: `src/components/layout/TabBar.vue`
- Create: `src/components/common/CommandPalette.vue`
- Create: `src/types/tool.ts`
- Test: `src/stores/__tests__/tabStore.spec.ts`

**Interfaces:**
- Produces: `useTabStore` with `openTab(toolId)`, `closeTab(tabId)`, `activeTabId`, `activeTabs` (max 5 in memory, older LRU evicted to snapshot).
- Produces: `CommandPalette.vue` triggered by `Cmd/Ctrl + K`.

- [ ] **Step 1: Write TabStore LRU test**

Create `src/stores/__tests__/tabStore.spec.ts`:
```typescript
import { setActivePinia, createPinia } from 'pinia'
import { describe, it, expect, beforeEach } from 'vitest'
import { useTabStore } from '../tabStore'

describe('tabStore LRU eviction', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('evicts LRU tab from keepAlive when exceeding 5 tabs', () => {
    const store = useTabStore()
    for (let i = 1; i <= 6; i++) {
      store.openTab(`tool_${i}`)
    }
    expect(store.openTabs.length).toBe(6)
    expect(store.keepAliveTabIds.length).toBe(5)
    // The first tool tab should be evicted from keepAlive list, but kept in openTabs
    expect(store.keepAliveTabIds.includes(store.openTabs[0].id)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tabStore`
Expected: FAIL

- [ ] **Step 3: Implement TabStore with LRU & snapshot serialization**

Create `src/stores/tabStore.ts`:
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tabStore`
Expected: PASS

- [ ] **Step 5: Commit workbench shell components**

```bash
git add src/stores/ src/components/layout/ src/types/
git commit -m "feat(ui): implement workbench layout with LRU tab keepalive management and Cmd+K"
```

---

### Task 4: MVP Tool 1 - JSON Suite with BigInt Lossless Protection

**Files:**
- Create: `src/views/tools/JsonSuite/JsonSuite.vue`
- Create: `src/views/tools/JsonSuite/utils/losslessJson.ts`
- Create: `src/views/tools/JsonSuite/utils/jsonPath.ts`
- Test: `src/views/tools/JsonSuite/__tests__/losslessJson.spec.ts`

**Interfaces:**
- Produces: `formatJson(raw: string, indent: number, sortKeys: boolean): string`
- Produces: `minifyJson(raw: string): string`
- Produces: `queryJsonPath(raw: string, path: string): string`
- Preserves: 19-digit snowflake numbers (e.g. `1892837482910293847`) without truncation.

- [ ] **Step 1: Write BigInt lossless formatting test**

Create `src/views/tools/JsonSuite/__tests__/losslessJson.spec.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { formatJson, minifyJson } from '../utils/losslessJson'

describe('losslessJson formatting', () => {
  it('preserves 19-digit snowflake ID precisely without truncation', () => {
    const input = '{"orderId":1892837482910293847,"code":"OK"}'
    const formatted = formatJson(input, 2, false)
    expect(formatted).toContain('1892837482910293847')
    expect(formatted).not.toContain('1892837482910293800')

    const minified = minifyJson(formatted)
    expect(minified).toContain('1892837482910293847')
  })

  it('recursively sorts keys alphabetically', () => {
    const input = '{"b":1,"a":{"d":4,"c":3}}'
    const formatted = formatJson(input, 2, true)
    expect(formatted.indexOf('"a"')).toBeLessThan(formatted.indexOf('"b"'))
    expect(formatted.indexOf('"c"')).toBeLessThan(formatted.indexOf('"d"'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test losslessJson`
Expected: FAIL

- [ ] **Step 3: Implement lossless tokenizer and formatter**

Create `src/views/tools/JsonSuite/utils/losslessJson.ts`:
```typescript
// Uses regex tokenization to preserve raw numeric literals > 15 digits
const BIGINT_REGEX = /:\s*(-?\d{16,})/g

export function formatJson(raw: string, indent: number = 2, sortKeys: boolean = false): string {
  // Protect big integers by wrapping into placeholder objects
  const protectedRaw = raw.replace(BIGINT_REGEX, ': "__BIGINT_$1__"')
  const parsed = JSON.parse(protectedRaw)

  const processed = sortKeys ? deepSort(parsed) : parsed
  const formatted = JSON.stringify(processed, null, indent)

  // Restore raw numeric literals without quotes
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test losslessJson`
Expected: PASS

- [ ] **Step 5: Commit JSON Suite implementation**

```bash
git add src/views/tools/JsonSuite/
git commit -m "feat(tool): implement JSON suite with BigInt lossless preservation and recursive sorting"
```

---

### Task 5: MVP Tool 2 - Text & JSON Semantic Diff Viewer

**Files:**
- Create: `src-tauri/src/commands/diff.rs`
- Create: `src/views/tools/DiffViewer/DiffViewer.vue`
- Create: `src/views/tools/DiffViewer/utils/semanticDiff.ts`
- Test: `src-tauri/tests/test_diff.rs`

**Interfaces:**
- Produces Rust command: `diff_text(original: String, modified: String) -> Vec<DiffChunk>`
- Produces: UI component with Split & Inline views, diff jumping (`Alt+Up/Down`), and stats summary.

- [ ] **Step 1: Write Rust diff command unit test**

Create `src-tauri/tests/test_diff.rs`:
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

- [ ] **Step 2: Run test to verify it passes**

Run: `cargo test --test test_diff`
Expected: PASS

- [ ] **Step 3: Implement Rust diff command**

Create `src-tauri/src/commands/diff.rs`:
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

- [ ] **Step 4: Connect Diff command in lib.rs and build frontend view**

Wire up `diff_text` in `src-tauri/src/lib.rs` and create `DiffViewer.vue` supporting Side-by-Side and Inline modes.

- [ ] **Step 5: Commit Diff tool**

```bash
git add src-tauri/src/commands/diff.rs src/views/tools/DiffViewer/
git commit -m "feat(tool): implement text and JSON semantic diff viewer with similar crate"
```

---

### Task 6: MVP Tool 3 - Postman Lite (Native Reqwest, No-CORS, Env, Sandboxed Iframe)

**Files:**
- Create: `src-tauri/src/commands/http.rs`
- Create: `src/views/tools/Postman/Postman.vue`
- Create: `src/views/tools/Postman/components/RequestPanel.vue`
- Create: `src/views/tools/Postman/components/ResponsePanel.vue`
- Create: `src/views/tools/Postman/components/HtmlPreviewIframe.vue`
- Create: `src/views/tools/Postman/utils/curlParser.ts`
- Test: `src/views/tools/Postman/__tests__/curlParser.spec.ts`

**Interfaces:**
- Produces Rust command: `http_execute(req: HttpRequestPayload) -> Result<HttpResponsePayload, String>`
- Produces: `HtmlPreviewIframe.vue` sandbox: `<iframe sandbox="allow-same-origin" :srcdoc="htmlContent">` (without `allow-scripts`)
- Produces: cURL import and export utility.

- [ ] **Step 1: Write cURL parser unit test**

Create `src/views/tools/Postman/__tests__/curlParser.spec.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { parseCurl } from '../utils/curlParser'

describe('curlParser', () => {
  it('parses basic POST curl with headers and json body', () => {
    const curl = `curl -X POST "https://api.example.com/login" -H "Content-Type: application/json" -d '{"user":"test"}'`
    const parsed = parseCurl(curl)
    expect(parsed.method).toBe('POST')
    expect(parsed.url).toBe('https://api.example.com/login')
    expect(parsed.headers['Content-Type']).toBe('application/json')
    expect(parsed.body).toBe('{"user":"test"}')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test curlParser`
Expected: FAIL

- [ ] **Step 3: Implement curlParser and Rust reqwest command**

Create `src-tauri/src/commands/http.rs` with `reqwest::ClientBuilder::new().danger_accept_invalid_certs(ignore_ssl)` support.
Create `HtmlPreviewIframe.vue` with strict `<iframe sandbox="allow-same-origin">` (no `allow-scripts`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test curlParser`
Expected: PASS

- [ ] **Step 5: Commit Postman Lite**

```bash
git add src-tauri/src/commands/http.rs src/views/tools/Postman/
git commit -m "feat(tool): implement Postman Lite with native CORS-free reqwest and sandboxed html preview"
```

---

### Task 7: MVP Tool 4 - Encoding & Streaming File Hash (with Cancellation & 2MB Buffer)

**Files:**
- Create: `src-tauri/src/commands/hash.rs`
- Create: `src/views/tools/EncodingHash/EncodingHash.vue`
- Create: `src/views/tools/EncodingHash/utils/encoders.ts`
- Test: `src/views/tools/EncodingHash/__tests__/encoders.spec.ts`
- Test: `src-tauri/tests/test_hash.rs`

**Interfaces:**
- Produces Rust command: `compute_file_hash(path: String, algorithm: String, on_progress: Channel<HashProgress>, cancel_token: State<HashCancelManager>)`
- Memory limit: <30MB RSS during 10GB file hash using 2MB chunk buffer.
- Cancellation window: <300ms.

- [ ] **Step 1: Write hash cancellation unit test**

Create `src-tauri/tests/test_hash.rs`:
```rust
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::io::Write;

#[test]
fn test_stream_hash_with_cancel() {
    let mut temp = tempfile::NamedTempFile::new().unwrap();
    let data = vec![0u8; 10 * 1024 * 1024]; // 10MB
    temp.write_all(&data).unwrap();

    let cancel_flag = Arc::new(AtomicBool::new(true)); // Pre-cancelled
    let result = devutils_lib::commands::hash::calculate_file_sha256(
        temp.path().to_str().unwrap(),
        cancel_flag,
        |_, _| {}
    );
    assert!(result.is_err());
    assert_eq!(result.unwrap_err(), "Cancelled");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --test test_hash`
Expected: FAIL

- [ ] **Step 3: Implement streaming file hash with 2MB buffer and AtomicBool**

Create `src-tauri/src/commands/hash.rs`:
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
    let mut buffer = vec![0u8; 2 * 1024 * 1024]; // 2MB Buffer
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

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test --test test_hash`
Expected: PASS

- [ ] **Step 5: Commit Encoding & Hash tool**

```bash
git add src-tauri/src/commands/hash.rs src/views/tools/EncodingHash/
git commit -m "feat(tool): implement encoding conversions and streaming file hash with 2MB buffer and cancellation"
```

---

### Task 8: MVP Tool 5 - Timestamp, Timezone & Cron Hub (Nanosecond Safe & Unix date)

**Files:**
- Create: `src/views/tools/TimestampCron/TimestampCron.vue`
- Create: `src/views/tools/TimestampCron/utils/timeConverter.ts`
- Create: `src-tauri/src/commands/cron.rs`
- Test: `src/views/tools/TimestampCron/__tests__/timeConverter.spec.ts`

**Interfaces:**
- Produces: 19-digit nanosecond safe string conversions
- Produces: Unix `date -r` and `date -d` command generator
- Produces: Cron future 10 runs evaluator with DST explanation

- [ ] **Step 1: Write nanosecond string conversion test**

Create `src/views/tools/TimestampCron/__tests__/timeConverter.spec.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { parseTimestampString, generateUnixDateCmd } from '../utils/timeConverter'

describe('timeConverter', () => {
  it('handles 19-digit nanoseconds without string precision loss', () => {
    const nanoStr = "1790000000123456789"
    const parsed = parseTimestampString(nanoStr)
    expect(parsed.unit).toBe('ns')
    expect(parsed.rawString).toBe("1790000000123456789")
  })

  it('generates accurate unix date commands for mac and linux', () => {
    const sec = "1790000000"
    const cmds = generateUnixDateCmd(sec)
    expect(cmds.macos).toBe("date -r 1790000000")
    expect(cmds.linux).toBe("date -d @1790000000")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test timeConverter`
Expected: FAIL

- [ ] **Step 3: Implement timeConverter and Rust cron evaluator**

Implement string-based nanosecond parsing, Unix date command generation, and Rust `cron::Schedule` calculation for future 10 executions.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test timeConverter`
Expected: PASS

- [ ] **Step 5: Commit Timestamp & Cron tool**

```bash
git add src/views/tools/TimestampCron/ src-tauri/src/commands/cron.rs
git commit -m "feat(tool): implement timestamp converter with nanosecond safety, timezone matrix, and cron predictor"
```

---

### Task 9: Full Integration Verification & Acceptance Benchmark (TC-01 ~ TC-07)

**Files:**
- Create: `tests/e2e/benchmark.spec.ts`
- Modify: `docs/superpowers/specs/2026-09-22-developer-toolbox-design.md`

**Interfaces:**
- Validates: TC-01 (19-digit snowflake ID and nanoseconds precision)
- Validates: TC-02 & TC-03 (Postman native CORS bypass & self-signed certs)
- Validates: TC-04 (File hash streaming with cancellation within 300ms)
- Validates: TC-05 (100k JSON line loading without white screen)
- Validates: TC-06 (Idle RSS: macOS <90MB, Windows <130MB)
- Validates: TC-07 (SQLite database migration & auto-pruning triggers)

- [ ] **Step 1: Execute test suite across all units**

Run: `npm test` and `cargo test`
Expected: ALL PASS with zero failures.

- [ ] **Step 2: Run build verification**

Run: `npm run build` and `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: Zero type errors, clean artifacts.

- [ ] **Step 3: Commit integration tests and tag MVP milestone**

```bash
git add tests/
git commit -m "test: add integration test suite and verify TC-01 through TC-07 acceptance criteria"
git tag -a v0.1.0-mvp -m "Phase 1 MVP Milestone Complete"
```
