# tauri-planning-app

本项目是一个本地优先的 Markdown Vault 编辑器，使用 Tauri + React +
TypeScript 构建。支持浏览 Vault 目录、以 Tab 方式打开 Markdown 文件、
使用 CodeMirror 编辑，并提供左右分栏预览；同时支持在同一窗口内打开
基础 Web Tab 以访问外部链接。

## 开发命令
- `pnpm dev`: 启动前端 Vite 开发服务器。
- `pnpm build`: 类型检查并构建前端资源。
- `pnpm preview`: 本地预览构建产物。
- `pnpm tauri dev`: 启动 Tauri 桌面应用开发模式。
- `pnpm tauri build`: 构建可分发的桌面应用。

## 推荐开发环境
- [VS Code](https://code.visualstudio.com/) +
  [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) +
  [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## 短期规划
1. 右侧支持修改文件名。
2. Dashboard 设计。
3. 下载功能与设置模块设计。
4. MarkItDown 功能与插件设计（核心）。
5. 接入 AI（框架选型、API、可本地运行等）。
