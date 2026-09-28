/// <reference types="vite/client" />

// 由 vite.config.ts 的 define 注入，取自构建时的 package.json 版本号
declare const __APP_VERSION__: string

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}
