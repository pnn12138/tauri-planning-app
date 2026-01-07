# frame_plan.md

本文件用于给出本项目的**框架规划与演进方向**，服务于长期结构决策与阶段性实现边界。它应与 `product_plan.md`、`product_process.md` 与 `ARCHITECTURE.md` 保持一致；当阶段变化或边界调整时，先更新过程文档再更新本文件。

---

## 1. 文档定位
- 描述“做什么”和“如何组织”的**长期框架**，不包含细节实现与短期任务。
- 约束：不得超出 `product_plan.md` 的范围，也不得与 `product_process.md` 的阶段决策冲突。

---

## 2. 当前阶段对齐
- 当前阶段以 `product_process.md` 为准。
- 若阶段信息尚未补充，应先完善 `product_process.md`，再细化本文件中的分期内容。

---

## 3. 产品框架目标（长期方向）
- 核心定位：本地优先、边界清晰、可扩展的 Markdown Vault 编辑器。
- MVP 闭环：选择 Vault -> 浏览文件树 -> 打开文件 -> 编辑 -> 实时预览 -> 本地保存。
- 原则：先闭环再扩展、轻量优先、边界清晰、渐进增强。

---

## 4. 系统框架与职责边界

### 4.1 前端（React + TypeScript）
- UI 结构：`AppShell` 统筹布局，包含 `Sidebar`（文件树）、`Editor`（CodeMirror 6）、`Preview`（Markdown 渲染）。
- 布局模式：编辑区与预览区**双栏并排**为默认 MVP 形态；后续可扩展单栏或折叠预览。
- 状态管理：集中管理 `vaultRoot`、`fileTree`、`activeFile`、`editorContent`、`dirty`、`sidebarOpen` 等最小状态集。
- 渲染管线：预览独立于编辑器，默认不渲染危险 HTML（避免 XSS）。

### 4.2 后端（Rust / Tauri）
- 文件系统能力：扫描目录、读取文件内容、保存文件内容。
- 安全边界：所有路径必须限定在用户选择的 Vault 内（仅相对路径）。
- IPC 约束：命令数量小、输入输出结构明确、错误可被前端稳定处理。

### 4.3 IPC 交互
- 交互风格：前端通过 `invoke` 调用后端命令；后端返回统一 Envelope 结构（ok/data 或 ok/error）。
- 命令范围（MVP）：`select_vault`、`scan_vault`、`read_markdown`、`write_markdown`。

---

## 5. 核心数据模型（框架级）

### 5.1 FileNode
- `type`: "dir" | "file"
- `name`: string
- `path`: string（相对路径）
- `children?`: FileNode[]

### 5.2 Editor State（最小集）
- `vaultRoot`: string | null
- `fileTree`: FileNode[] | null
- `activeFile`: string | null
- `editorContent`: string | null
- `dirty`: boolean
- `sidebarOpen`: boolean

---

## 6. 核心流程（MVP 级）
1. 用户选择 Vault（后端对话框返回路径）
2. 后端扫描 Vault，返回文件树（仅 `.md`，隐藏文件不展示）
3. 用户点击 `.md` 文件，前端发起读取命令并加载到编辑器
4. 编辑器内容变化触发实时预览刷新
5. 用户执行保存动作，前端调用写入命令并反馈结果
6. 切换文件时，如 `dirty` 为真，需提示未保存风险

---

## 7. 技术选型与约束
- 前端：React + TypeScript + Vite
- 编辑器：CodeMirror 6
- 预览：前端 Markdown 渲染管线（如 `react-markdown` + `remark-gfm`）
- 后端：Rust + Tauri
- 包管理：pnpm
- 约束：前端不得直接访问 OS，所有文件访问必须经由后端。

---

## 8. 安全与性能框架
- Vault 边界验证为强制规则，不接受绝对路径输入。
- 禁止通过 symlink 或 `../` 访问 Vault 之外路径。
- 目录扫描与读写应异步执行，避免阻塞 UI。
- 默认不渲染危险 HTML；若未来开启，需严格清洗。

---

## 9. 未来扩展方向（仅框架提示）
- 预览模式切换：单栏/折叠预览。
- 文件监听与增量刷新：后端 watch + 前端更新树。
- 搜索与索引：后端索引、前端查询显示。
- 双向链接与知识图谱。
- 状态持久化：记住上次 Vault、选中项与布局状态。

> 以上为“方向级”规划，具体实现必须等 `product_process.md` 进入对应阶段后再展开。

---

## 10. 维护规则
- 任何新增能力或边界变化，先更新 `product_process.md`，再同步此文档。
- 若与 `ARCHITECTURE.md` 有冲突，以 `product_process.md` 的当前阶段决策为准并修正两者。
