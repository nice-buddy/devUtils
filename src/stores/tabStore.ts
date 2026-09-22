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
let accessCounter = 0

function nextTimestamp(): number {
  return Date.now() + (++accessCounter * 0.001)
}

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
      lastActive: nextTimestamp()
    }
    openTabs.value.push(newTab)
    activeTabId.value = newId
    updateKeepAlive()
    return newId
  }

  function activateTab(tabId: string) {
    const target = openTabs.value.find(t => t.id === tabId)
    if (target) {
      target.lastActive = nextTimestamp()
      activeTabId.value = tabId
      updateKeepAlive()
    }
  }

  function closeTab(tabId: string) {
    const idx = openTabs.value.findIndex(t => t.id === tabId)
    if (idx === -1) return

    openTabs.value.splice(idx, 1)
    if (activeTabId.value === tabId) {
      const nextTab = openTabs.value[Math.max(0, idx - 1)]
      if (nextTab) {
        nextTab.lastActive = nextTimestamp()
        activeTabId.value = nextTab.id
      } else {
        activeTabId.value = ''
      }
    }
    updateKeepAlive()
  }

  function closeOtherTabs(tabId: string) {
    openTabs.value = openTabs.value.filter(t => t.id === tabId)
    if (openTabs.value.length > 0) {
      activeTabId.value = tabId
    } else {
      activeTabId.value = ''
    }
    updateKeepAlive()
  }

  function closeAllTabs() {
    openTabs.value = []
    activeTabId.value = ''
    keepAliveTabIds.value = []
  }

  function updateTabSnapshot(tabId: string, snapshot: Record<string, any>) {
    const target = openTabs.value.find(t => t.id === tabId)
    if (target) {
      target.snapshot = { ...target.snapshot, ...snapshot }
    }
  }

  function updateTabTitle(tabId: string, title: string) {
    const target = openTabs.value.find(t => t.id === tabId)
    if (target) {
      target.title = title
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
    updateTabTitle
  }
})
