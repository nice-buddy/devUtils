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
    expect(tab1).toContain('postman_')
    expect(tab2).toContain('postman_')
  })

  it('当 Tab 超过 5 个时，将最久未访问的 Tab 从 keepAlive 中剔除以释放 DOM', () => {
    const store = useTabStore()
    const tabIds: string[] = []
    for (let i = 1; i <= 6; i++) {
      tabIds.push(store.openTab(`tool_${i}`, `Tool ${i}`))
    }

    expect(store.openTabs.length).toBe(6)
    expect(store.keepAliveTabIds.length).toBe(5)
    // 最先打开且未再次激活的 tabIds[0] 应该被剔出 keepAlive
    expect(store.keepAliveTabIds.includes(tabIds[0])).toBe(false)
    // 其余 5 个应在 keepAlive 中
    expect(store.keepAliveTabIds.includes(tabIds[1])).toBe(true)
    expect(store.keepAliveTabIds.includes(tabIds[5])).toBe(true)
  })

  it('再次激活最旧的 Tab 时，应将其召回 keepAlive 并淘汰次久未访问的 Tab', () => {
    const store = useTabStore()
    const tabIds: string[] = []
    for (let i = 1; i <= 6; i++) {
      tabIds.push(store.openTab(`tool_${i}`, `Tool ${i}`))
    }

    // 当前 tabIds[0] 不在 keepAlive 中
    expect(store.keepAliveTabIds.includes(tabIds[0])).toBe(false)

    // 重新激活 tabIds[0]
    store.activateTab(tabIds[0])

    expect(store.activeTabId).toBe(tabIds[0])
    expect(store.keepAliveTabIds.includes(tabIds[0])).toBe(true)
    // 现在次旧的 tabIds[1] 应被淘汰出 keepAlive
    expect(store.keepAliveTabIds.includes(tabIds[1])).toBe(false)
  })

  it('关闭 Tab 时正确切换激活状态与更新 keepAlive', () => {
    const store = useTabStore()
    const tab1 = store.openTab('tool_1', 'Tool 1')
    const tab2 = store.openTab('tool_2', 'Tool 2')
    const tab3 = store.openTab('tool_3', 'Tool 3')

    expect(store.activeTabId).toBe(tab3)

    // 关闭当前激活的 tab3，激活态应回退到前一个 tab2
    store.closeTab(tab3)
    expect(store.openTabs.map(t => t.id)).toEqual([tab1, tab2])
    expect(store.activeTabId).toBe(tab2)
    expect(store.keepAliveTabIds.includes(tab3)).toBe(false)

    // 关闭非激活的 tab1，激活态应保持在 tab2
    store.closeTab(tab1)
    expect(store.openTabs.map(t => t.id)).toEqual([tab2])
    expect(store.activeTabId).toBe(tab2)

    // 关闭最后一个 tab
    store.closeTab(tab2)
    expect(store.openTabs.length).toBe(0)
    expect(store.activeTabId).toBe('')
    expect(store.keepAliveTabIds.length).toBe(0)
  })

  it('支持保存与更新 Tab 状态快照', () => {
    const store = useTabStore()
    const tabId = store.openTab('postman', '新请求')

    store.updateTabSnapshot(tabId, { url: 'https://api.devutils.local', method: 'POST' })

    const tab = store.openTabs.find(t => t.id === tabId)
    expect(tab?.snapshot).toEqual({ url: 'https://api.devutils.local', method: 'POST' })
  })

  it('支持批量关闭其他标签页与关闭全部标签页', () => {
    const store = useTabStore()
    const tab1 = store.openTab('tool_1', 'Tool 1')
    const tab2 = store.openTab('tool_2', 'Tool 2')
    const tab3 = store.openTab('tool_3', 'Tool 3')

    expect(store.openTabs.map(t => t.id)).toEqual([tab1, tab2, tab3])

    store.closeOtherTabs(tab2)
    expect(store.openTabs.length).toBe(1)
    expect(store.openTabs[0].id).toBe(tab2)
    expect(store.activeTabId).toBe(tab2)

    store.closeAllTabs()
    expect(store.openTabs.length).toBe(0)
    expect(store.activeTabId).toBe('')
    expect(store.keepAliveTabIds.length).toBe(0)
  })
})
