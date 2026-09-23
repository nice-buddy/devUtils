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

async function persistDeleteTabFromDb(tabId: string) {
  try {
    await invoke('db_execute', {
      query: 'DELETE FROM tool_state_snapshots WHERE tab_id = ?1',
      params: [tabId]
    })
  } catch {
    // Ignore
  }
}

async function persistDeleteOtherTabsFromDb(tabId: string) {
  try {
    await invoke('db_execute', {
      query: 'DELETE FROM tool_state_snapshots WHERE tab_id != ?1',
      params: [tabId]
    })
  } catch {
    // Ignore
  }
}

async function persistDeleteAllTabsFromDb() {
  try {
    await invoke('db_execute', {
      query: 'DELETE FROM tool_state_snapshots',
      params: []
    })
  } catch {
    // Ignore
  }
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

  async function restoreTabsFromDb(): Promise<boolean> {
    try {
      const rows = await invoke<any[]>('db_query', {
        query: 'SELECT tab_id, tool_id, title, sort_order, snapshot_data_json FROM tool_state_snapshots ORDER BY sort_order ASC',
        params: []
      })

      if (rows && rows.length > 0) {
        openTabs.value = rows.map((r, i) => {
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

    openTabs.value.splice(idx, 1)
    persistDeleteTabFromDb(tabId)

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
    openTabs.value = openTabs.value.filter(t => t.id === tabId)
    persistDeleteOtherTabsFromDb(tabId)

    if (openTabs.value.length > 0) {
      activeTabId.value = tabId
      persistActiveTabToDb(tabId)
    } else {
      activeTabId.value = ''
    }
    updateKeepAlive()
  }

  function closeAllTabs() {
    openTabs.value = []
    activeTabId.value = ''
    keepAliveTabIds.value = []
    persistDeleteAllTabsFromDb()
  }

  function updateTabSnapshot(tabId: string, snapshot: Record<string, any>) {
    const target = openTabs.value.find(t => t.id === tabId)
    if (target) {
      target.snapshot = { ...target.snapshot, ...snapshot }
      persistSnapshotDebounced(tabId, target.snapshot)
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
