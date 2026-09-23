<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useMessage, useDialog } from 'naive-ui'
import { invoke } from '@tauri-apps/api/core'
import { nanoid } from 'nanoid'
import { getMethodBg, type PostmanRequestModel } from '../types'

export interface CollectionItem {
  id: string
  parentId: string | null
  name: string
  sortOrder: number
}

export interface SavedRequestItem {
  id: string
  collectionId: string
  name: string
  method: string
  url: string
  headersJson: string
  paramsJson: string
  bodyType: string
  bodyContent: string
  authJson: string
  settingsJson: string
  updatedAt: number
}

const props = defineProps<{
  show: boolean
  currentRequest: PostmanRequestModel
}>()

const emit = defineEmits<{
  (e: 'update:show', val: boolean): void
  (e: 'loadRequest', item: SavedRequestItem): void
}>()

const message = useMessage()
const dialog = useDialog()

const collections = ref<CollectionItem[]>([])
const requests = ref<SavedRequestItem[]>([])
const searchQuery = ref('')
const loading = ref(false)

// Save request dialog state
const showSaveModal = ref(false)
const saveRequestName = ref('')
const saveTargetCollectionId = ref('')

async function loadData() {
  loading.value = true
  try {
    const colRows = await invoke<any[]>('db_query', {
      query: 'SELECT id, parent_id, name, sort_order FROM http_collections ORDER BY sort_order ASC, name ASC',
      params: []
    })

    if (colRows && colRows.length > 0) {
      collections.value = colRows.map((r) => ({
        id: r.id,
        parentId: r.parent_id,
        name: r.name,
        sortOrder: r.sort_order ?? 0
      }))
    } else {
      // 默认初始化一个收藏集合
      const defaultId = `col_${nanoid(8)}`
      await invoke('db_execute', {
        query: 'INSERT INTO http_collections (id, parent_id, name, sort_order) VALUES (?1, NULL, ?2, 0)',
        params: [defaultId, '常用接口收藏']
      })
      collections.value = [{ id: defaultId, parentId: null, name: '常用接口收藏', sortOrder: 0 }]
    }

    const reqRows = await invoke<any[]>('db_query', {
      query: `SELECT id, collection_id, name, method, url, headers_json, params_json, body_type, body_content, auth_json, settings_json, updated_at 
              FROM http_requests ORDER BY updated_at DESC`,
      params: []
    })

    requests.value = (reqRows || []).map((r) => ({
      id: r.id,
      collectionId: r.collection_id,
      name: r.name,
      method: r.method,
      url: r.url,
      headersJson: r.headers_json,
      paramsJson: r.params_json,
      bodyType: r.body_type,
      bodyContent: r.body_content,
      authJson: r.auth_json,
      settingsJson: r.settings_json,
      updatedAt: r.updated_at
    }))
  } catch {
    if (collections.value.length === 0) {
      collections.value = [{ id: 'col_default', parentId: null, name: '本地收藏', sortOrder: 0 }]
    }
  } finally {
    loading.value = false
  }
}

watch(
  () => props.show,
  (val) => {
    if (val) loadData()
  }
)

const filteredCollections = computed(() => {
  if (!searchQuery.value.trim()) return collections.value
  const query = searchQuery.value.trim().toLowerCase()
  return collections.value.filter((c) => {
    const matchesCol = c.name.toLowerCase().includes(query)
    const hasMatchingReq = requests.value.some(
      (r) => r.collectionId === c.id && (r.name.toLowerCase().includes(query) || r.url.toLowerCase().includes(query))
    )
    return matchesCol || hasMatchingReq
  })
})

function getRequestsInCollection(colId: string) {
  let list = requests.value.filter((r) => r.collectionId === colId)
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toLowerCase()
    list = list.filter((r) => r.name.toLowerCase().includes(q) || r.url.toLowerCase().includes(q))
  }
  return list
}

const showCreateFolderModal = ref(false)
const newFolderName = ref('')

function openCreateFolderModal() {
  newFolderName.value = ''
  showCreateFolderModal.value = true
}

async function confirmCreateFolder() {
  const colName = newFolderName.value.trim()
  if (!colName) {
    message.warning('请输入目录名称')
    return
  }

  const newId = `col_${nanoid(8)}`
  try {
    await invoke('db_execute', {
      query: 'INSERT INTO http_collections (id, parent_id, name, sort_order) VALUES (?1, NULL, ?2, ?3)',
      params: [newId, colName, collections.value.length]
    })
    collections.value.push({
      id: newId,
      parentId: null,
      name: colName,
      sortOrder: collections.value.length
    })
    showCreateFolderModal.value = false
    message.success('已新建集合分类')
  } catch {
    message.error('新建集合失败')
  }
}

async function handleDeleteCollection(colId: string) {
  const target = collections.value.find((c) => c.id === colId)
  if (!target) return

  dialog.warning({
    title: '删除集合确认',
    content: `确定要删除集合 "${target.name}" 及其包含的所有请求吗？此操作不可逆。`,
    positiveText: '确认删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await invoke('db_execute', {
          query: 'DELETE FROM http_collections WHERE id = ?1',
          params: [colId]
        })
        collections.value = collections.value.filter((c) => c.id !== colId)
        requests.value = requests.value.filter((r) => r.collectionId !== colId)
        message.success('已删除集合分类')
      } catch {
        message.error('删除集合失败')
      }
    }
  })
}

function openSaveCurrentRequestModal() {
  saveRequestName.value = props.currentRequest.url
    ? `${props.currentRequest.method} ${props.currentRequest.url.split('?')[0]}`
    : '未命名请求'
  saveTargetCollectionId.value = collections.value[0]?.id || ''
  showSaveModal.value = true
}

async function handleConfirmSaveRequest() {
  if (!saveRequestName.value.trim()) {
    message.warning('请输入请求名称')
    return
  }
  if (!saveTargetCollectionId.value) {
    message.warning('请选择目标集合目录')
    return
  }

  const newId = `req_${nanoid(8)}`
  const now = Date.now()
  const reqData = props.currentRequest

  const newSavedReq: SavedRequestItem = {
    id: newId,
    collectionId: saveTargetCollectionId.value,
    name: saveRequestName.value.trim(),
    method: reqData.method,
    url: reqData.url,
    headersJson: JSON.stringify(reqData.headers),
    paramsJson: JSON.stringify(reqData.params),
    bodyType: reqData.bodyType,
    bodyContent: reqData.bodyType === 'raw' ? reqData.bodyRaw : JSON.stringify(reqData.formData || []),
    authJson: JSON.stringify(reqData.auth),
    settingsJson: JSON.stringify(reqData.settings),
    updatedAt: now
  }

  try {
    await invoke('db_execute', {
      query: `INSERT INTO http_requests 
              (id, collection_id, name, method, url, headers_json, params_json, body_type, body_content, auth_json, settings_json, created_at, updated_at)
              VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`,
      params: [
        newSavedReq.id,
        newSavedReq.collectionId,
        newSavedReq.name,
        newSavedReq.method,
        newSavedReq.url,
        newSavedReq.headersJson,
        newSavedReq.paramsJson,
        newSavedReq.bodyType,
        newSavedReq.bodyContent,
        newSavedReq.authJson,
        newSavedReq.settingsJson,
        now,
        now
      ]
    })
    requests.value.unshift(newSavedReq)
    showSaveModal.value = false
    message.success('请求已成功收藏入库')
  } catch (err: any) {
    message.error(`保存失败: ${err?.message || err}`)
  }
}

async function handleDeleteRequest(reqId: string) {
  try {
    await invoke('db_execute', {
      query: 'DELETE FROM http_requests WHERE id = ?1',
      params: [reqId]
    })
    requests.value = requests.value.filter((r) => r.id !== reqId)
    message.success('已从收藏中移除该请求')
  } catch {
    message.error('删除请求失败')
  }
}

function handleSelectRequest(req: SavedRequestItem) {
  emit('loadRequest', req)
  emit('update:show', false)
}

onMounted(() => {
  loadData()
})
</script>

<template>
  <div>
    <!-- Backdrop & Drawer -->
    <div
      v-if="show"
      class="fixed inset-0 z-40 bg-black/40 backdrop-blur-2xs transition-opacity"
      @click="emit('update:show', false)"
    ></div>

    <div
      :class="[
        'fixed inset-y-0 left-0 z-50 w-80 sm:w-96 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col transform transition-transform duration-200 ease-in-out',
        show ? 'translate-x-0' : '-translate-x-full'
      ]"
    >
      <!-- Header -->
      <div class="h-12 px-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50 dark:bg-slate-950">
        <div class="flex items-center gap-2">
          <span class="w-6 h-6 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs">
            📂
          </span>
          <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100">请求集合目录树</h3>
        </div>
        <button
          @click="emit('update:show', false)"
          class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm p-1 rounded"
        >
          ✕
        </button>
      </div>

      <!-- Action & Search Bar -->
      <div class="p-3 border-b border-slate-200 dark:border-slate-800 flex flex-col gap-2 shrink-0 bg-slate-50/50 dark:bg-slate-950/50">
        <div class="flex items-center gap-2">
          <button
            @click="openSaveCurrentRequestModal"
            class="flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-colors flex items-center justify-center gap-1.5"
          >
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            <span>收藏当前请求</span>
          </button>
          <button
            @click="openCreateFolderModal"
            class="py-1.5 px-3 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors shrink-0"
            title="新建集合分类目录"
          >
            + 新目录
          </button>
        </div>

        <div class="relative">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="搜索接口名称或 URL..."
            class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md px-2.5 py-1 text-xs outline-none focus:border-indigo-500 text-slate-800 dark:text-slate-200 transition-colors"
          />
          <button
            v-if="searchQuery"
            @click="searchQuery = ''"
            class="absolute right-2 top-1.5 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            ✕
          </button>
        </div>
      </div>

      <!-- Collection Tree Body -->
      <div class="flex-1 overflow-y-auto p-3 space-y-3">
        <div v-if="filteredCollections.length === 0" class="text-center py-8 text-xs text-slate-400">
          未检索到符合条件的集合目录
        </div>

        <div
          v-for="col in filteredCollections"
          :key="col.id"
          class="border border-slate-200 dark:border-slate-800/80 rounded-xl overflow-hidden bg-white dark:bg-slate-900/60 shadow-xs"
        >
          <!-- Collection Header -->
          <div class="h-8 px-3 bg-slate-100/70 dark:bg-slate-950/70 flex items-center justify-between border-b border-slate-200/60 dark:border-slate-800/60">
            <div class="flex items-center gap-1.5 truncate">
              <span class="text-xs">📁</span>
              <span class="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{{ col.name }}</span>
              <span class="text-[10px] text-slate-400 font-mono">({{ getRequestsInCollection(col.id).length }})</span>
            </div>
            <button
              @click.stop="handleDeleteCollection(col.id)"
              class="text-[10px] text-slate-400 hover:text-rose-500 transition-colors"
              title="删除此集合"
            >
              ✕
            </button>
          </div>

          <!-- Request items under collection -->
          <div class="divide-y divide-slate-100 dark:divide-slate-800/40">
            <div
              v-if="getRequestsInCollection(col.id).length === 0"
              class="py-3 text-center text-[11px] text-slate-400"
            >
              目录内暂无保存的接口
            </div>

            <div
              v-for="req in getRequestsInCollection(col.id)"
              :key="req.id"
              @click="handleSelectRequest(req)"
              class="p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors flex items-center justify-between group"
            >
              <div class="min-w-0 flex-1 pr-2">
                <div class="flex items-center gap-2 mb-1">
                  <span
                    :class="[
                      'px-1.5 py-0.2 rounded text-[10px] font-mono font-bold shrink-0',
                      getMethodBg(req.method)
                    ]"
                  >
                    {{ req.method }}
                  </span>
                  <span class="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                    {{ req.name }}
                  </span>
                </div>
                <p class="text-[11px] text-slate-400 font-mono truncate">
                  {{ req.url }}
                </p>
              </div>

              <button
                @click.stop="handleDeleteRequest(req.id)"
                class="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-500 p-1 text-xs transition-opacity shrink-0"
                title="删除此接口"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Save Current Request Modal -->
    <div
      v-if="showSaveModal"
      class="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
      @click.self="showSaveModal = false"
    >
      <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-md p-5 text-slate-800 dark:text-slate-200">
        <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100 mb-3">收藏当前请求至集合</h3>

        <div class="space-y-3 mb-4">
          <div>
            <label class="block text-xs text-slate-500 dark:text-slate-400 mb-1">接口自定义名称:</label>
            <input
              v-model="saveRequestName"
              type="text"
              class="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label class="block text-xs text-slate-500 dark:text-slate-400 mb-1">选择目标集合分类:</label>
            <select
              v-model="saveTargetCollectionId"
              class="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-indigo-500"
            >
              <option v-for="c in collections" :key="c.id" :value="c.id">
                {{ c.name }}
              </option>
            </select>
          </div>
        </div>

        <div class="flex justify-end gap-2">
          <button
            @click="showSaveModal = false"
            class="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            取消
          </button>
          <button
            @click="handleConfirmSaveRequest"
            class="px-4 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs"
          >
            确认收藏
          </button>
        </div>
      </div>
    </div>

    <!-- New Collection Folder Modal Dialog -->
    <div
      v-if="showCreateFolderModal"
      class="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4"
    >
      <div class="w-full max-w-sm bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
        <div class="h-11 px-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span class="text-sm font-bold text-slate-900 dark:text-slate-100">新建请求集合目录</span>
          <button @click="showCreateFolderModal = false" class="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <div class="p-4 flex flex-col gap-2">
          <label class="text-xs text-slate-500 dark:text-slate-400">目录分类名称：</label>
          <input
            v-model="newFolderName"
            @keyup.enter="confirmCreateFolder"
            type="text"
            placeholder="例如：用户中心、订单模块"
            class="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500"
            autofocus
          />
        </div>
        <div class="h-12 px-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
          <button
            @click="showCreateFolderModal = false"
            class="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            取消
          </button>
          <button
            @click="confirmCreateFolder"
            class="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs"
          >
            确定创建
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
