import { defineStore } from 'pinia'
import { ref } from 'vue'
import { nanoid } from 'nanoid'
import { invoke } from '@tauri-apps/api/core'

export interface TabItem {
  id: string
  toolId: string
  title: string
  snapshot?: Record<string, any>
  lastActive: number
}

// 已关闭标签的快照：保留在 SQLite 里，重开同一工具时复活，但重启不会自动恢复成打开的标签
interface DormantSnapshot {
  id: string
  title: string
  snapshot?: Record<string, any>
}

const MAX_KEEPALIVE_TABS = 5
let accessCounter = 0

function nextTimestamp(): number {
  return Date.now() + (++accessCounter * 0.001)
}

// Helper functions for SQLite persistence with safe fallback for test/web environments
async function persistTabToDb(tab: TabItem, sortOrder: number) {
  try {
    await invoke('db_execute', {
      query: `INSERT OR REPLACE INTO tool_state_snapshots 
              (tab_id, tool_id, title, sort_order, snapshot_data_json, updated_at) 
              VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
      params: [
        tab.id,
        tab.toolId,
        tab.title,
        sortOrder,
        JSON.stringify(tab.snapshot || {}),
        Date.now()
      ]
    })
  } catch {
    // Ignore in non-Tauri or test environments
  }
}

async function persistActiveTabToDb(tabId: string) {
  try {
    await invoke('db_execute', {
      query: "INSERT OR REPLACE INTO sys_settings (key, value, updated_at) VALUES ('active_tab_id', ?1, ?2)",
      params: [tabId, Date.now()]
    })
  } catch {
    // Ignore
  }
}

// 关闭标签不删快照：把「当前打开的标签 id 列表」写进 sys_settings，
// 重启时据此区分「当时开着的标签」与「已关闭但保留内容的休眠快照」。
async function persistOpenTabIds(ids: string[]) {
  try {
    await invoke('db_execute', {
      query: "INSERT OR REPLACE INTO sys_settings (key, value, updated_at) VALUES ('open_tab_ids', ?1, ?2)",
      params: [JSON.stringify(ids), Date.now()]
    })
  } catch {
    // Ignore
  }
}

async function loadOpenTabIds(): Promise<Set<string> | null> {
  try {
    const settings = await invoke<any[]>('db_query', {
      query: "SELECT value FROM sys_settings WHERE key = 'open_tab_ids'",
      params: []
    })
    const raw = settings && settings[0]?.value
    if (typeof raw === 'string') {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return new Set(parsed.map(String))
    }
  } catch {
    // Ignore
  }
  return null
}

const snapshotDebounceTimers = new Map<string, any>()
function persistSnapshotDebounced(tabId: string, snapshot: Record<string, any>) {
  if (snapshotDebounceTimers.has(tabId)) {
    clearTimeout(snapshotDebounceTimers.get(tabId))
  }
  const timer = setTimeout(async () => {
    try {
      await invoke('db_execute', {
        query: 'UPDATE tool_state_snapshots SET snapshot_data_json = ?1, updated_at = ?2 WHERE tab_id = ?3',
        params: [JSON.stringify(snapshot), Date.now(), tabId]
      })
    } catch {
      // Ignore
    }
    snapshotDebounceTimers.delete(tabId)
  }, 300)
  snapshotDebounceTimers.set(tabId, timer)
}

export const useTabStore = defineStore('tabs', () => {
  const openTabs = ref<TabItem[]>([])
  const activeTabId = ref<string>('')
  const keepAliveTabIds = ref<string[]>([])
  const dormantByTool = new Map<string, DormantSnapshot>()

  async function restoreTabsFromDb(): Promise<boolean> {
    try {
      const rows = await invoke<any[]>('db_query', {
        query: 'SELECT tab_id, tool_id, title, sort_order, snapshot_data_json FROM tool_state_snapshots ORDER BY sort_order ASC',
        params: []
      })

      if (rows && rows.length > 0) {
        const openIds = await loadOpenTabIds()
        const restored: TabItem[] = rows.map((r, i) => {
          let parsedSnapshot: Record<string, any> | undefined = undefined
          try {
            if (r.snapshot_data_json) {
              parsedSnapshot = JSON.parse(r.snapshot_data_json)
            }
          } catch {
            // Ignore parse error
          }
          return {
            id: r.tab_id,
            toolId: r.tool_id,
            title: r.title || r.tool_id,
            snapshot: parsedSnapshot,
            lastActive: nextTimestamp() + i
          }
        })

        // 没有 open_tab_ids 记录（旧数据）时按「全部是打开的标签」处理，保持既有行为
        const isOpen = (tab: TabItem) => (openIds ? openIds.has(tab.id) : true)
        dormantByTool.clear()
        for (const tab of restored) {
          if (!isOpen(tab)) {
            dormantByTool.set(tab.toolId, { id: tab.id, title: tab.title, snapshot: tab.snapshot })
          }
        }

        // 单例：历史数据里可能存在同一工具的多个标签，按 toolId 去重，保留最后访问的那条
        const keptByTool = new Map<string, TabItem>()
        const droppedTabs: TabItem[] = []
        for (const tab of restored) {
          if (!isOpen(tab)) continue
          const kept = keptByTool.get(tab.toolId)
          if (!kept) {
            keptByTool.set(tab.toolId, tab)
            continue
          }
          if (tab.lastActive > kept.lastActive) {
            keptByTool.set(tab.toolId, tab)
            droppedTabs.push(kept)
          } else {
            droppedTabs.push(tab)
          }
        }
        openTabs.value = [...keptByTool.values()]
        for (const tab of droppedTabs) {
          dormantByTool.set(tab.toolId, { id: tab.id, title: tab.title, snapshot: tab.snapshot })
        }
        persistOpenTabIds(openTabs.value.map(t => t.id))
        const settings = await invoke<any[]>('db_query', {
          query: "SELECT value FROM sys_settings WHERE key = 'active_tab_id'",
          params: []
        })

        const savedActiveId = settings && settings[0]?.value
        if (savedActiveId && openTabs.value.some(t => t.id === savedActiveId)) {
          activeTabId.value = savedActiveId
        } else if (openTabs.value.length > 0) {
          activeTabId.value = openTabs.value[0].id
        }

        updateKeepAlive()
        return true
      }
    } catch {
      // Ignore in environments where SQLite IPC is unavailable
    }
    return false
  }

  function openTab(toolId: string, title?: string): string {
    // 单例：同一工具只保留一个标签，重复打开只做激活
    const existing = openTabs.value.find(t => t.toolId === toolId)
    if (existing) {
      activateTab(existing.id)
      return existing.id
    }
    // 之前关闭过同一工具时，复活它的休眠快照，保留上次的输入与视图选项
    const dormant = dormantByTool.get(toolId)
    if (dormant) {
      dormantByTool.delete(toolId)
      const revived: TabItem = {
        id: dormant.id,
        toolId,
        title: title || dormant.title,
        snapshot: dormant.snapshot,
        lastActive: nextTimestamp()
      }
      openTabs.value.push(revived)
      activeTabId.value = revived.id
      updateKeepAlive()
      persistTabToDb(revived, openTabs.value.length - 1)
      persistActiveTabToDb(revived.id)
      persistOpenTabIds(openTabs.value.map(t => t.id))
      return revived.id
    }
    const newId = `${toolId}_${nanoid(8)}`
    const newTab: TabItem = {
      id: newId,
      toolId,
      title: title || toolId,
      lastActive: nextTimestamp()
    }
    openTabs.value.push(newTab)
    activeTabId.value = newId
    updateKeepAlive()

    // Persist to SQLite
    persistTabToDb(newTab, openTabs.value.length - 1)
    persistActiveTabToDb(newId)
    persistOpenTabIds(openTabs.value.map(t => t.id))

    return newId
  }

  function activateTab(tabId: string) {
    const target = openTabs.value.find(t => t.id === tabId)
    if (target) {
      target.lastActive = nextTimestamp()
      activeTabId.value = tabId
      updateKeepAlive()
      persistActiveTabToDb(tabId)
    }
  }

  function closeTab(tabId: string) {
    const idx = openTabs.value.findIndex(t => t.id === tabId)
    if (idx === -1) return

    const [removed] = openTabs.value.splice(idx, 1)
    if (removed) {
      dormantByTool.set(removed.toolId, { id: removed.id, title: removed.title, snapshot: removed.snapshot })
    }
    persistOpenTabIds(openTabs.value.map(t => t.id))

    if (activeTabId.value === tabId) {
      const nextTab = openTabs.value[Math.max(0, idx - 1)]
      if (nextTab) {
        nextTab.lastActive = nextTimestamp()
        activeTabId.value = nextTab.id
        persistActiveTabToDb(nextTab.id)
      } else {
        activeTabId.value = ''
      }
    }
    updateKeepAlive()
  }

  function closeOtherTabs(tabId: string) {
    const kept = openTabs.value.find(t => t.id === tabId)
    for (const tab of openTabs.value) {
      if (tab.id === tabId) continue
      dormantByTool.set(tab.toolId, { id: tab.id, title: tab.title, snapshot: tab.snapshot })
    }
    openTabs.value = kept ? [kept] : []
    persistOpenTabIds(openTabs.value.map(t => t.id))

    if (openTabs.value.length > 0) {
      activeTabId.value = tabId
      persistActiveTabToDb(tabId)
    } else {
      activeTabId.value = ''
    }
    updateKeepAlive()
  }

  function closeAllTabs() {
    for (const tab of openTabs.value) {
      dormantByTool.set(tab.toolId, { id: tab.id, title: tab.title, snapshot: tab.snapshot })
    }
    openTabs.value = []
    activeTabId.value = ''
    keepAliveTabIds.value = []
    persistOpenTabIds([])
  }

  function updateTabSnapshot(tabId: string, snapshot: Record<string, any>) {
    const target = openTabs.value.find(t => t.id === tabId)
    if (target) {
      target.snapshot = { ...target.snapshot, ...snapshot }
      persistSnapshotDebounced(tabId, target.snapshot)
      return
    }
    // 关闭标签时组件卸载还会补一次保存，这里接住它，避免丢掉最后一次输入
    for (const dormant of dormantByTool.values()) {
      if (dormant.id === tabId) {
        dormant.snapshot = { ...dormant.snapshot, ...snapshot }
        persistSnapshotDebounced(tabId, dormant.snapshot)
        return
      }
    }
  }

  function updateTabTitle(tabId: string, title: string) {
    const target = openTabs.value.find(t => t.id === tabId)
    if (target) {
      target.title = title
      try {
        invoke('db_execute', {
          query: 'UPDATE tool_state_snapshots SET title = ?1, updated_at = ?2 WHERE tab_id = ?3',
          params: [title, Date.now(), tabId]
        }).catch(() => {})
      } catch {
        // Ignore
      }
    }
  }

  function updateKeepAlive() {
    const sorted = [...openTabs.value].sort((a, b) => b.lastActive - a.lastActive)
    keepAliveTabIds.value = sorted.slice(0, MAX_KEEPALIVE_TABS).map(t => t.id)
  }

  return {
    openTabs,
    activeTabId,
    keepAliveTabIds,
    openTab,
    activateTab,
    closeTab,
    closeOtherTabs,
    closeAllTabs,
    updateTabSnapshot,
    updateTabTitle,
    restoreTabsFromDb
  }
})
