<script setup lang="ts">
import { computed, defineAsyncComponent, defineComponent, h, onMounted, watch } from 'vue'
import {
  NConfigProvider,
  NMessageProvider,
  NDialogProvider,
  darkTheme,
  zhCN,
  dateZhCN
} from 'naive-ui'
import Sidebar from '@/components/layout/Sidebar.vue'
import TabBar from '@/components/layout/TabBar.vue'
import CommandPalette from '@/components/common/CommandPalette.vue'
import { useTabStore, TabItem } from '@/stores/tabStore'
import { useThemeStore } from '@/stores/themeStore'
import { useCommandPalette } from '@/composables/useCommandPalette'
import { TOOLS, ToolDefinition } from '@/types/tool'
import { isMacOS, shortcutLabel } from '@/utils/platform'

// Tool views are code-split so cold start does not pay for tools the user has not opened.
const ToolPlaceholder = defineAsyncComponent(() => import('@/views/tools/ToolPlaceholder.vue'))
const JsonSuite = defineAsyncComponent(() => import('@/views/tools/JsonSuite/JsonSuite.vue'))
const DiffViewer = defineAsyncComponent(() => import('@/views/tools/DiffViewer/DiffViewer.vue'))
const Postman = defineAsyncComponent(() => import('@/views/tools/Postman/Postman.vue'))
const EncodingHash = defineAsyncComponent(() => import('@/views/tools/EncodingHash/EncodingHash.vue'))
const TimestampCron = defineAsyncComponent(() => import('@/views/tools/TimestampCron/TimestampCron.vue'))
const JsonToTypes = defineAsyncComponent(() => import('@/views/tools/JsonToTypes/JsonToTypes.vue'))
const UrlParser = defineAsyncComponent(() => import('@/views/tools/UrlParser/UrlParser.vue'))
const RadixCase = defineAsyncComponent(() => import('@/views/tools/RadixCase/RadixCase.vue'))
const ChmodCalc = defineAsyncComponent(() => import('@/views/tools/ChmodCalc/ChmodCalc.vue'))
const PasswordSsh = defineAsyncComponent(() => import('@/views/tools/PasswordSsh/PasswordSsh.vue'))

const tabStore = useTabStore()
const themeStore = useThemeStore()
const { open: openCommandPalette } = useCommandPalette()

const activeTab = computed(() => {
  return tabStore.openTabs.find(t => t.id === tabStore.activeTabId)
})

// Dynamic component registry & wrapper cache for KeepAlive per tab instance
const componentCache = new Map<string, any>()

function resolveBaseComponent(toolId: string) {
  if (toolId === 'json-suite' || toolId === 'json_suite') {
    return JsonSuite
  }
  if (toolId === 'diff-viewer' || toolId === 'diff_viewer') {
    return DiffViewer
  }
  if (toolId === 'postman') {
    return Postman
  }
  if (toolId === 'encoding-hash' || toolId === 'encoding_hash') {
    return EncodingHash
  }
  if (toolId === 'timestamp-cron' || toolId === 'timestamp_cron') {
    return TimestampCron
  }
  if (toolId === 'json-to-types' || toolId === 'json_to_types') {
    return JsonToTypes
  }
  if (toolId === 'url-parser' || toolId === 'url_parser') {
    return UrlParser
  }
  if (toolId === 'radix-case' || toolId === 'radix_case') {
    return RadixCase
  }
  if (toolId === 'chmod-calc' || toolId === 'chmod_calc') {
    return ChmodCalc
  }
  if (toolId === 'password-ssh' || toolId === 'password_ssh') {
    return PasswordSsh
  }
  return ToolPlaceholder
}

function getTabComponent(tab: TabItem) {
  if (!componentCache.has(tab.id)) {
    const rawComponent = resolveBaseComponent(tab.toolId)
    const wrapper = defineComponent({
      name: tab.id,
      setup() {
        return () =>
          h(rawComponent, {
            tabId: tab.id,
            initialSnapshot: tab.snapshot
          })
      }
    })
    componentCache.set(tab.id, wrapper)
  }
  return componentCache.get(tab.id)
}

// Clean up cached components when tabs are closed
watch(
  () => tabStore.openTabs.map(t => t.id),
  (currentIds) => {
    const currentIdSet = new Set(currentIds)
    for (const cachedId of componentCache.keys()) {
      if (!currentIdSet.has(cachedId)) {
        componentCache.delete(cachedId)
      }
    }
  }
)

const activeComponent = computed(() => {
  if (!activeTab.value) return null
  return getTabComponent(activeTab.value)
})

const mvpTools = computed(() => TOOLS.filter(t => t.isMvp))

function openTool(tool: ToolDefinition) {
  tabStore.openTab(tool.id, tool.name)
}

onMounted(async () => {
  await tabStore.restoreTabsFromDb()
})
</script>

<template>
  <NConfigProvider
    :theme="themeStore.isDark ? darkTheme : null"
    :locale="zhCN"
    :date-locale="dateZhCN"
  >
    <NMessageProvider>
      <NDialogProvider>
        <div class="h-screen w-screen flex bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 overflow-hidden font-sans select-none">
          <!-- Left: Collapsible Sidebar -->
          <Sidebar />

          <!-- Right: Main Workbench Area -->
          <div class="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
            <!-- macOS 顶部红绿灯留白，同时作为窗口拖拽区 -->
            <div
              v-if="isMacOS"
              data-tauri-drag-region="deep"
              class="h-7 w-full shrink-0 bg-slate-100 dark:bg-slate-950"
            ></div>

            <!-- Window Drag & Title Area -->
            <header
              data-tauri-drag-region="deep"
              class="h-8 w-full bg-slate-100 dark:bg-slate-950 flex items-center justify-between px-3 shrink-0 border-b border-slate-200/60 dark:border-slate-800/60 text-xs text-slate-500"
            >
              <div class="flex items-center gap-2">
                <span class="font-semibold text-slate-700 dark:text-slate-300">DevUtils</span>
                <span class="text-[11px] text-slate-400">跨平台开发者工具箱</span>
              </div>
              <div class="flex items-center gap-3">
                <button
                  @click="openCommandPalette"
                  class="flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-200/50 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors text-[11px]"
                >
                  <span>查找</span>
                  <kbd class="font-mono text-[9px]">{{ shortcutLabel('K') }}</kbd>
                </button>
              </div>
            </header>

            <!-- Multi-Instance Tab Bar -->
            <TabBar />

            <!-- Main Content Area with KeepAlive LRU Caching -->
            <main class="flex-1 overflow-auto relative bg-slate-50 dark:bg-slate-900">
              <!-- When Tabs are Open -->
              <div v-if="tabStore.openTabs.length > 0 && activeTab" class="h-full w-full">
                <KeepAlive :include="tabStore.keepAliveTabIds">
                  <component
                    :is="activeComponent"
                    :key="tabStore.activeTabId"
                  />
                </KeepAlive>
              </div>

              <!-- Empty State / Quick Launcher -->
              <div
                v-else
                class="h-full w-full flex flex-col items-center justify-center p-8 overflow-y-auto"
              >
                <div class="max-w-2xl w-full flex flex-col items-center text-center">
                  <div class="w-16 h-16 rounded-2xl bg-indigo-600 text-white flex items-center justify-center text-3xl font-black shadow-lg shadow-indigo-500/20 mb-4">
                    D
                  </div>
                  <h1 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 mb-2">
                    DevUtils 工作台
                  </h1>
                  <p class="text-sm text-slate-500 dark:text-slate-400 max-w-md mb-6">
                    纯本地离线运行、AST 级大整数无损保护、原生免 CORS 限制的现代化桌面开发者工具箱。
                  </p>

                  <!-- Search trigger button -->
                  <button
                    @click="openCommandPalette"
                    class="w-full max-w-md flex items-center justify-between px-4 py-3 rounded-xl bg-white dark:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shadow-sm border border-slate-200 dark:border-slate-700 hover:border-indigo-400 transition-all mb-8 group"
                  >
                    <div class="flex items-center gap-3">
                      <svg class="w-5 h-5 text-slate-400 group-hover:text-indigo-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      <span class="text-sm">搜索工具名称或输入关键词...</span>
                    </div>
                    <kbd class="font-mono text-xs px-2 py-1 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 border border-slate-200 dark:border-slate-600">
                      {{ shortcutLabel('K') }}
                    </kbd>
                  </button>

                  <!-- MVP Tools Quick Access Cards -->
                  <div class="w-full text-left mb-3">
                    <h3 class="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      核心 MVP 工具推荐
                    </h3>
                  </div>

                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                    <div
                      v-for="tool in mvpTools"
                      :key="tool.id"
                      @click="openTool(tool)"
                      class="group p-4 rounded-xl bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/80 hover:border-indigo-500/50 hover:shadow-md transition-all cursor-pointer text-left"
                    >
                      <div class="flex items-center justify-between mb-2">
                        <div class="flex items-center gap-2">
                          <span class="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-sm">
                            {{ tool.name.slice(0, 1) }}
                          </span>
                          <span class="font-semibold text-sm text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                            {{ tool.name }}
                          </span>
                        </div>
                        <span class="px-1.5 py-0.5 text-[10px] font-bold rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300">
                          MVP
                        </span>
                      </div>
                      <p class="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                        {{ tool.description }}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </main>
          </div>

          <!-- Global Command Palette Modal -->
          <CommandPalette />
        </div>
      </NDialogProvider>
    </NMessageProvider>
  </NConfigProvider>
</template>
