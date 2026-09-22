import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import path from 'path'

// Local-only benchmark tier. Kept separate from `npm test` so the >5MB fixtures
// and 65k-element payloads never run inside CI.
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  test: {
    include: ['tests/manual/**/*.spec.ts']
  }
})
