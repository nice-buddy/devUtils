# Changelog

> 发布流程会在 push tag 时读取本文件内容，作为 GitHub Release 的说明。
> 发布前请先更新本文件，写清该版本的变更。章节标题格式固定为 `## v<版本号>`，
> 必须与 tag 名称（如 `v1.0.0`）去掉前缀 `v` 后对应，以便 workflow 自动提取。
>
> 版本号以 tag 为唯一来源：workflow 会在构建前把 tag 版本号写回
> `package.json` 与 `src-tauri/tauri.conf.json`，不需要手工同步。

## v0.1.0

首个正式版本：一个纯本地离线运行、基于 Tauri 2 + Vue 3 的跨平台开发者工具箱。

### 新增

**工作台基座**

- 多标签工作台：同一工具只保留一个标签（单例），重复打开只做激活
- 标签 LRU 驻留：最多同时保留 5 个标签的 DOM，超出自动卸载
- 状态持久化：标签、输入与视图选项防抖写入本地 SQLite，重启后还原；派生结果不落库
- 命令面板：`⌘K` / `Ctrl+K` 全局搜索工具
- 深色 / 浅色主题切换；macOS 顶部为红绿灯预留留白并作为窗口拖拽区
- 左下角实时显示本应用进程的 CPU / 内存占用

**24 个工具**

- 代码与格式化：JSON 深度套件、YAML / Properties / JSON 互转、YAML 校验器、TOML 校验器、JSON 转强类型结构体、SQL 格式化与压缩、Excel / CSV 转 JSON 与 SQL、Markdown / HTML 预览
- 文本与比对：文本与 JSON 对比（行级 / 字符级、双栏 / 单栏、差异导航）
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
- 应用图标统一由单一 SVG 母版生成，macOS / Windows / Linux 打包图标保持一致

### 变更

- 无（首个版本）
