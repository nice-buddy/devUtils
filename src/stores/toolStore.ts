import { defineStore } from 'pinia'
import { ref } from 'vue'

const FAVORITES_KEY = 'devutils_favorite_tools'

export const useToolStore = defineStore('tools', () => {
  const favoriteIds = ref<string[]>(loadFavorites())

  function loadFavorites(): string[] {
    try {
      const raw = localStorage.getItem(FAVORITES_KEY)
      if (raw) {
        return JSON.parse(raw)
      }
    } catch {
      // ignore
    }
    // Default favorites: MVP tools
    return ['json-suite', 'diff-viewer', 'postman', 'encoding-hash', 'timestamp-cron']
  }

  function saveFavorites() {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(favoriteIds.value))
    } catch {
      // ignore
    }
  }

  function toggleFavorite(toolId: string) {
    const idx = favoriteIds.value.indexOf(toolId)
    if (idx >= 0) {
      favoriteIds.value.splice(idx, 1)
    } else {
      favoriteIds.value.push(toolId)
    }
    saveFavorites()
  }

  function isFavorite(toolId: string): boolean {
    return favoriteIds.value.includes(toolId)
  }

  return {
    favoriteIds,
    toggleFavorite,
    isFavorite
  }
})
