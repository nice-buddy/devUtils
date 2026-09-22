<script setup lang="ts">
import { computed } from 'vue'
import { getToolById, getCategoryMeta } from '@/types/tool'
import { useTabStore } from '@/stores/tabStore'

const props = defineProps<{
  tabId: string
  initialSnapshot?: Record<string, any>
}>()

const tabStore = useTabStore()

const currentTab = computed(() => {
  return tabStore.openTabs.find(t => t.id === props.tabId)
})

const tool = computed(() => {
  if (!currentTab.value) return undefined
  return getToolById(currentTab.value.toolId)
})

const categoryMeta = computed(() => {
  if (!tool.value) return undefined
  return getCategoryMeta(tool.value.category)
})
</script>

<template>
  <div class="h-full w-full flex flex-col items-center justify-center p-8 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 select-none">
    <div class="max-w-md w-full bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 p-6 flex flex-col items-center text-center">
      <div class="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-4 text-2xl font-bold border border-indigo-200 dark:border-indigo-800">
        {{ tool?.name?.slice(0, 1) || '🛠' }}
      </div>

      <div class="flex items-center gap-2 mb-1">
        <h2 class="text-xl font-bold">{{ tool?.name || currentTab?.title || '工具面板' }}</h2>
        <span v-if="tool?.isMvp" class="px-2 py-0.5 text-xs font-semibold rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
          MVP
        </span>
      </div>

      <p class="text-xs text-slate-500 dark:text-slate-400 mb-3">
        分类：{{ categoryMeta?.name || tool?.category || '通用' }}
      </p>

      <p class="text-sm text-slate-600 dark:text-slate-300 mb-5 leading-relaxed">
        {{ tool?.description || '该工具界面将在后续开发任务中落地接入。' }}
      </p>

      <div class="w-full bg-slate-100 dark:bg-slate-900 rounded-lg p-3 text-xs font-mono text-left mb-4 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800">
        <div class="flex justify-between py-0.5">
          <span class="text-slate-400">实例 ID:</span>
          <span class="text-indigo-600 dark:text-indigo-400 font-semibold">{{ tabId }}</span>
        </div>
        <div class="flex justify-between py-0.5">
          <span class="text-slate-400">工具 ID:</span>
          <span>{{ currentTab?.toolId }}</span>
        </div>
        <div class="flex justify-between py-0.5">
          <span class="text-slate-400">LRU 状态:</span>
          <span class="text-emerald-600 dark:text-emerald-400">活跃 (KeepAlive: {{ tabStore.keepAliveTabIds.includes(tabId) ? '驻留' : '冷态' }})</span>
        </div>
      </div>

      <div class="flex gap-2">
        <button
          @click="tool && tabStore.openTab(tool.id, `${tool.name} (副本)`)"
          class="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
        >
          打开新实例
        </button>
        <button
          @click="tabStore.closeTab(tabId)"
          class="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 transition-colors"
        >
          关闭标签
        </button>
      </div>
    </div>
  </div>
</template>
