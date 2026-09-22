import { defineStore } from 'pinia'
import { ref } from 'vue'

const THEME_KEY = 'devutils_theme'

export const useThemeStore = defineStore('theme', () => {
  const isDark = ref<boolean>(initTheme())

  function initTheme(): boolean {
    try {
      const saved = localStorage.getItem(THEME_KEY)
      if (saved !== null) {
        return saved === 'dark'
      }
    } catch {
      // ignore
    }
    return typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : true
  }

  function applyTheme() {
    if (typeof document !== 'undefined') {
      if (isDark.value) {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }
    }
    try {
      localStorage.setItem(THEME_KEY, isDark.value ? 'dark' : 'light')
    } catch {
      // ignore
    }
  }

  function toggleTheme() {
    isDark.value = !isDark.value
    applyTheme()
  }

  // Initial apply
  applyTheme()

  return {
    isDark,
    toggleTheme,
    applyTheme
  }
})
