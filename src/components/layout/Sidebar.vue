<script setup lang="ts">
import { ref, computed } from 'vue'
import { TOOLS, TOOL_CATEGORIES, ToolCategory, ToolDefinition } from '@/types/tool'
import { useTabStore } from '@/stores/tabStore'
import { useToolStore } from '@/stores/toolStore'
import { useThemeStore } from '@/stores/themeStore'
import { useCommandPalette } from '@/composables/useCommandPalette'

const tabStore = useTabStore()
const toolStore = useToolStore()
const themeStore = useThemeStore()
const { open: openCommandPalette } = useCommandPalette()

const isCollapsed = ref(false)
const selectedCategory = ref<ToolCategory | 'all' | 'favorites'>('all')
const filterQuery = ref('')

const favoriteCount = computed(() => toolStore.favoriteIds.length)

const displayedTools = computed(() => {
  let list = TOOLS

  if (selectedCategory.value === 'favorites') {
    list = list.filter(t => toolStore.isFavorite(t.id))
  } else if (selectedCategory.value !== 'all') {
    list = list.filter(t => t.category === selectedCategory.value)
  }

  const q = filterQuery.value.trim().toLowerCase()
  if (q) {
    list = list.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.id.toLowerCase().includes(q) ||
      t.keywords?.some(k => k.toLowerCase().includes(q))
    )
  }

  // Sort: MVP tools first, then alphabetically
  return [...list].sort((a, b) => {
    if (a.isMvp && !b.isMvp) return -1
    if (!a.isMvp && b.isMvp) return 1
    return a.name.localeCompare(b.name, 'zh-CN')
  })
})

function getOpenInstancesCount(toolId: string): number {
  return tabStore.openTabs.filter(t => t.toolId === toolId).length
}

function handleToolClick(tool: ToolDefinition) {
  tabStore.openTab(tool.id, tool.name)
}

function toggleFavorite(toolId: string, event: MouseEvent) {
  event.stopPropagation()
  toolStore.toggleFavorite(toolId)
}
</script>

<template>
  <aside
    :class="[
      'h-full flex flex-col bg-slate-50 dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 transition-all duration-200 select-none shrink-0',
      isCollapsed ? 'w-14' : 'w-64'
    ]"
  >
    <!-- App Brand & Title -->
    <div data-tauri-drag-region="deep" class="h-12 flex items-center justify-between px-3 border-b border-slate-200 dark:border-slate-800">
      <div v-if="!isCollapsed" class="flex items-center gap-2 min-w-0">
        <div class="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-sm">
          D
        </div>
        <div class="min-w-0 flex items-baseline gap-1.5">
          <span class="font-bold text-sm tracking-tight text-slate-900 dark:text-slate-100">DevUtils</span>
          <span class="text-[10px] text-indigo-500 dark:text-indigo-400 font-mono">v0.1</span>
        </div>
      </div>
      <div v-else class="w-full flex justify-center">
        <div class="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-sm">
          D
        </div>
      </div>

      <button
        v-if="!isCollapsed"
        @click="isCollapsed = !isCollapsed"
        title="收起侧边栏"
        class="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
        </svg>
      </button>
    </div>

    <!-- Quick Search / CommandPalette Trigger -->
    <div class="p-2 border-b border-slate-200 dark:border-slate-800">
      <button
        v-if="!isCollapsed"
        @click="openCommandPalette"
        class="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-200/60 dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors text-xs"
      >
        <div class="flex items-center gap-2">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span>快速查找...</span>
        </div>
        <kbd class="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700">
          ⌘K
        </kbd>
      </button>

      <button
        v-else
        @click="openCommandPalette"
        title="快速查找 (⌘K)"
        class="w-full flex justify-center py-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </button>
    </div>

    <!-- Category Selector (Full Mode) -->
    <div v-if="!isCollapsed" class="p-2 border-b border-slate-200 dark:border-slate-800 flex flex-col gap-0.5">
      <div class="text-[11px] font-semibold text-slate-400 px-2 py-1 uppercase tracking-wider">
        分类导航
      </div>

      <div class="grid grid-cols-2 gap-1 text-xs">
        <button
          @click="selectedCategory = 'all'"
          :class="[
            'px-2 py-1 rounded text-left transition-colors flex items-center justify-between',
            selectedCategory === 'all'
              ? 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 font-medium'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-900'
          ]"
        >
          <span>全部工具</span>
          <span class="text-[10px] opacity-70">{{ TOOLS.length }}</span>
        </button>

        <button
          @click="selectedCategory = 'favorites'"
          :class="[
            'px-2 py-1 rounded text-left transition-colors flex items-center justify-between',
            selectedCategory === 'favorites'
              ? 'bg-amber-50 dark:bg-amber-950/70 text-amber-600 dark:text-amber-400 font-medium'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-900'
          ]"
        >
          <span class="flex items-center gap-1">
            <span class="text-amber-500">★</span> 收藏
          </span>
          <span class="text-[10px] opacity-70">{{ favoriteCount }}</span>
        </button>
      </div>

      <!-- Quick category filter pills -->
      <div class="flex flex-wrap gap-1 mt-1">
        <button
          v-for="cat in TOOL_CATEGORIES"
          :key="cat.id"
          @click="selectedCategory = selectedCategory === cat.id ? 'all' : cat.id"
          :class="[
            'px-1.5 py-0.5 rounded text-[11px] transition-colors',
            selectedCategory === cat.id
              ? 'bg-indigo-600 text-white font-medium'
              : 'bg-slate-200/50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
          ]"
        >
          {{ cat.name }}
        </button>
      </div>
    </div>

    <!-- Tool List -->
    <div class="flex-1 overflow-y-auto p-2 space-y-1">
      <div
        v-if="!isCollapsed"
        class="text-[11px] font-semibold text-slate-400 px-2 py-1 flex items-center justify-between uppercase tracking-wider"
      >
        <span>工具清单 ({{ displayedTools.length }})</span>
      </div>

      <div
        v-for="tool in displayedTools"
        :key="tool.id"
        @click="handleToolClick(tool)"
        :title="tool.description"
        :class="[
          'group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-colors text-xs',
          getOpenInstancesCount(tool.id) > 0
            ? 'bg-slate-200/50 dark:bg-slate-900/80 text-slate-900 dark:text-slate-100 font-medium'
            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-900'
        ]"
      >
        <!-- Tool Icon -->
        <span
          :class="[
            'w-6 h-6 rounded-md flex items-center justify-center font-bold text-xs shrink-0',
            tool.isMvp
              ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400'
              : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
          ]"
        >
          {{ tool.name.slice(0, 1) }}
        </span>

        <!-- Tool Name & Meta (Full mode) -->
        <div v-if="!isCollapsed" class="min-w-0 flex-1 flex flex-col">
          <div class="flex items-center gap-1.5">
            <span class="truncate">{{ tool.name }}</span>
            <span
              v-if="tool.isMvp"
              class="px-1 text-[9px] font-bold rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 shrink-0"
            >
              MVP
            </span>
          </div>
          <span class="text-[10px] text-slate-400 truncate">{{ tool.description }}</span>
        </div>

        <!-- Right Side: Instances count & Star favorite -->
        <div v-if="!isCollapsed" class="flex items-center gap-1 shrink-0">
          <span
            v-if="getOpenInstancesCount(tool.id) > 0"
            class="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300 font-semibold"
            title="已打开实例数"
          >
            {{ getOpenInstancesCount(tool.id) }}
          </span>

          <button
            @click="toggleFavorite(tool.id, $event)"
            :title="toolStore.isFavorite(tool.id) ? '取消收藏' : '添加收藏'"
            :class="[
              'p-1 rounded transition-colors',
              toolStore.isFavorite(tool.id)
                ? 'text-amber-500 hover:text-amber-600'
                : 'text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 hover:text-slate-500 dark:hover:text-slate-400'
            ]"
          >
            ★
          </button>
        </div>
      </div>
    </div>

    <!-- Bottom Actions: Theme & Expand -->
    <div class="p-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
      <button
        @click="themeStore.toggleTheme"
        :title="themeStore.isDark ? '切换至明亮模式' : '切换至暗色模式'"
        class="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors"
      >
        <span v-if="themeStore.isDark">🌙 暗色</span>
        <span v-else>☀️ 明亮</span>
      </button>

      <button
        v-if="isCollapsed"
        @click="isCollapsed = !isCollapsed"
        title="展开侧边栏"
        class="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  </aside>
</template>
