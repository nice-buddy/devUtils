# Changelog

> 本文件是 GitHub Release 说明的唯一来源。
> 发布流程在 push tag 时读取对应章节，章节标题格式固定为 `## v<版本号>`，
> 必须与 tag 名称（如 `v1.0.0`）去掉前缀 `v` 后一致，否则会回退成默认文案。
>
> 版本号以 tag 为唯一来源：workflow 会在构建前把 tag 版本号写回
> `package.json` 与 `src-tauri/tauri.conf.json`，不需要手工同步。
>
> 每个版本建议按「新增 / 变更 / 修复 / 测试」分类归纳，未涉及的分类可以省略。

## v0.1.0

首个正式版本：一个纯本地离线运行、基于 Tauri 2 + Vue 3 的跨平台开发者工具箱，内置 24 个工具。

### 新增

**工作台**

- 多标签工作台：同一工具只保留一个标签，重复打开只做激活
- 标签 LRU 驻留：最多同时保留 5 个标签的 DOM，超出自动卸载
- 状态持久化：标签、输入与视图选项以 250ms 防抖写入本地 SQLite，重启后还原；派生结果不落库
- 命令面板：`⌘K` / `Ctrl+K` 全局搜索并打开工具
- 深色 / 浅色主题切换，默认跟随系统
- macOS 顶部为红绿灯预留留白，并作为窗口拖拽区
- 左下角实时显示本应用进程的 CPU / 内存占用，窗口不可见时暂停采样

**工具（24 个）**

- 代码与格式化：JSON 深度套件、YAML / Properties / JSON 互转、YAML 语法校验器、TOML 语法校验器、JSON 转强类型结构体、SQL 格式化与压缩、Excel / CSV 转 JSON 与 SQL、Markdown / HTML 预览
- 文本与比对：文本与 JSON 对比
- 网络与接口：Postman Lite、URL 解析与构造器、WebSocket 实时测试
- 编码与安全：编码转换与流式哈希、强密码生成与 SSH Key 解析、JWT 解析与调试、X.509 证书解析
- 时间与调度：时间戳与 Cron 中心
- 开发与辅助：进制与命名风格转换、Linux chmod 权限计算器、正则表达式测试、UUID / 雪花 ID / Mock 数据、颜色转换与拾取、图片与 Base64 / SVG、二维码生成与解码

**能力与安全**

- Postman Lite 与 WebSocket 走 Rust 侧原生网络栈，不受浏览器 CORS 限制
- 超大文件哈希采用 2MB 分块流式读取，内存占用恒定，支持中途取消
- 大整数无损保护：19 位雪花 ID 等长整数不经过 `JSON.parse` 浮点截断
- Markdown 预览运行在 `iframe sandbox` 隔离沙箱中，并额外做 HTML 消毒
- CSP 收紧为 `default-src 'self'`，仅按需放行 `connect-src`（ws/wss）与 `img-src data:`
- 应用图标由单一 SVG 母版生成，macOS / Windows / Linux 打包图标保持一致

### 修复

- 关闭标签页时补齐资源释放：`ColorConverter` 与 `MockData` 缺少卸载钩子，防抖快照可能在组件销毁后仍触发一次
- 二维码解码结束后显式释放 `ImageBitmap`，避免大图解码后原生位图内存长期占用
- Postman Lite 关闭标签页时清理大响应的临时落盘文件，并避免在途响应写回已销毁的组件

### 变更

- 发布流程改为 tag 驱动：以 tag 作为唯一版本来源，构建前写回 `package.json` 与 `src-tauri/tauri.conf.json`，Release 说明从本文件自动提取
- 打包图标从 Tauri 默认占位图替换为新设计的应用图标

### 测试

- 前端单测与 CI 级验收用例 340 项；Rust 单测 31 项
- 资源释放实测：关闭标签页后定时器、编辑器 DOM 与图片位图均被释放，LRU 淘汰的标签会真正卸载 DOM
