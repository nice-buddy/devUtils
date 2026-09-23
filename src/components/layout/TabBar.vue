<script setup lang="ts">
import { useTabStore } from '@/stores/tabStore'
import { useCommandPalette } from '@/composables/useCommandPalette'
import { getToolById } from '@/types/tool'
import { shortcutLabel } from '@/utils/platform'

const tabStore = useTabStore()
const { open: openCommandPalette } = useCommandPalette()

function handleTabClick(tabId: string) {
  tabStore.activateTab(tabId)
}

function handleTabClose(tabId: string, event: MouseEvent) {
  event.stopPropagation()
  tabStore.closeTab(tabId)
}

function handleTabMiddleClick(tabId: string, event: MouseEvent) {
  if (event.button === 1) {
    event.preventDefault()
    tabStore.closeTab(tabId)
  }
}
</script>

<template>
  <div class="h-10 flex items-center bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-2 select-none overflow-hidden">
    <!-- Scrollable Tab List -->
    <div class="flex-1 flex items-center gap-1 overflow-x-auto no-scrollbar py-1">
      <div
        v-for="tab in tabStore.openTabs"
        :key="tab.id"
        @click="handleTabClick(tab.id)"
        @mouseup="handleTabMiddleClick(tab.id, $event)"
        :title="`${tab.title} (${tab.id})`"
        :class="[
          'group relative flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all shrink-0 max-w-[200px]',
          tab.id === tabStore.activeTabId
            ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm border border-slate-200 dark:border-slate-700'
            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-200'
        ]"
      >
        <!-- Tool initial/icon -->
        <span
          :class="[
            'w-4 h-4 rounded text-[10px] flex items-center justify-center font-bold shrink-0',
            tab.id === tabStore.activeTabId
              ? 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300'
              : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
          ]"
        >
          {{ (getToolById(tab.toolId)?.name || tab.title).slice(0, 1) }}
        </span>

        <!-- Tab Title -->
        <span class="truncate min-w-0">
          {{ tab.title }}
        </span>

        <!-- Close Button -->
        <button
          @click="handleTabClose(tab.id, $event)"
          title="关闭标签页"
          class="opacity-60 group-hover:opacity-100 p-0.5 rounded hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors shrink-0 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
        >
          <svg class="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
          </svg>
        </button>
      </div>

      <!-- Quick Add Tab Button -->
      <button
        @click="openCommandPalette"
        :title="`新建工具标签 (${shortcutLabel('K')})`"
        class="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200 transition-colors shrink-0"
      >
        <svg class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
        </svg>
      </button>
    </div>

    <!-- Right Side Controls & LRU Status -->
    <div class="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800 shrink-0 text-xs text-slate-400">
      <span
        v-if="tabStore.openTabs.length > 0"
        class="hidden sm:inline text-[11px] font-mono px-1.5 py-0.5 rounded bg-slate-200/60 dark:bg-slate-800"
        :title="`驻留 DOM 内存: ${tabStore.keepAliveTabIds.length} / 5 (LRU 自动淘汰)`"
      >
        活跃: {{ tabStore.keepAliveTabIds.length }}/5
      </span>

      <button
        v-if="tabStore.openTabs.length > 1"
        @click="tabStore.closeOtherTabs(tabStore.activeTabId)"
        title="关闭其他标签"
        class="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
