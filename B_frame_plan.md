# frame_plan.md

本文件用于给出本项目的**框架规划与演进方向**，服务于长期结构决策与阶段性实现边界。它应与 `A_product_plan.md`、`F_product_process.md` 与 `C_Architecture.md` 保持一致；当阶段变化或边界调整时，先更新过程文档再更新本文件。

---

## 1. 文档定位
- 描述“做什么”和“如何组织”的**长期框架**，不包含细节实现与短期任务。
- 约束：不得超出 `product_plan.md` 的范围，也不得与 `product_process.md` 的阶段决策冲突。

---

## 2. 当前状态
### Phase 1 DONE
- MVP 核心功能完成：vault 管理、文件树浏览、Markdown 编辑、实时预览、Web 标签页
- 架构实现：feature 模块化、IPC 封装、command registry、dirty guard
- 技术栈：React 19 + TypeScript + Vite + CodeMirror 6 + Tauri 2

### Phase 2 IN PROGRESS
- **目标**：平台可扩展性与安全隔离
- **核心功能**：Vault 内插件 + Worker 隔离 + 插件 v0
- **已实现**：
  - 插件目录结构与加载机制
  - WebWorker 隔离运行环境
  - 插件命令注册与执行
  - 系统事件订阅机制
  - 受控文件读写权限
  - 插件权限管理
  - 后端插件 API 命令
  - 插件面板 UI

---

## 3. 当前阶段对齐
- 当前阶段以 `product_process.md` 为准。
- 若阶段信息尚未补充，应先完善 `product_process.md`，再细化本文件中的分期内容。
### 当前阶段能力（MVP）
- 已有能力以 `F_product_process.md` 为准。
### 新需求对齐（requirements.md）
- 顶部导航栏固定在窗口最上方，作为全局 UI 容器。
- Tab 体系与内容视图一一绑定，切换时不出现残留内容。
- Home Tab 固定存在且不可关闭。
- 右上角提供原生窗口控制按钮（最小化 / 最大化 / 关闭）。

---

## 3. 产品框架目标（长期方向）
- 核心定位：本地优先、边界清晰、可扩展的 Markdown Vault 编辑器。
- MVP 闭环：选择 Vault -> 浏览文件树 -> 打开文件 -> 编辑 -> 实时预览 -> 本地保存。
- 原则：先闭环再扩展、轻量优先、边界清晰、渐进增强。
- 补充约束：应用级导航必须稳定，Tab 与内容实例强绑定，避免“假切换”。

---

## 4. 系统框架与职责边界

### 4.1 前端（React + TypeScript）
- UI 结构：顶部导航栏（Logo/应用名、Tab 区、地址/状态区预留、右侧功能区、窗口控制按钮）+ 主内容区（Sidebar + Tab 内容）。
- 顶部导航栏固定在窗口最上方，作为全局 UI 容器，不随内容滚动。
- 内容路由：按 Tab 类型渲染对应视图（Home / Markdown 编辑预览 / Web 页）。
- Home 看板：内容区内独立滚动，顶部头部保持在内容容器内且层级低于 App 顶栏。
- Tab 规则：Home Tab 固定存在且不可关闭；其他 Tab 可关闭。
- 布局模式：Markdown 编辑区与预览区**双栏并排**为默认 MVP 形态；后续可扩展单栏或折叠预览。
- 状态管理：集中管理 `vaultRoot`、`fileTree`、`tabs`、`activeTabId`、`sidebarOpen` 等最小状态集。
- 渲染管线：预览独立于编辑器，默认不渲染危险 HTML（避免 XSS）。
- UI 显示规则：Vault 显示名使用 `basename(path)`，不展示完整绝对路径。
- UI 交互约束：Hide files 为 icon-only 小方块按钮，明确两态，悬停提示。
- UI 交互约束：Home 看板支持跨列拖拽（包含进行中列），空列也可作为合法落点，使用列级 droppable + 指针碰撞检测并在必要时用 `elementsFromPoint` 命中回退确定落点。
- UI 交互约束：任务卡片右键打开状态/优先级菜单，双击打开任务编辑界面。
- 错误处理：预览渲染失败时给出可诊断提示并提供降级显示，编辑器仍可用。

### 4.2 后端（Rust / Tauri）
- 文件系统能力：扫描目录、读取文件内容、保存文件内容。
- 安全边界：所有路径必须限定在用户选择的 Vault 内（仅相对路径）。
- IPC 约束：命令数量小、输入输出结构明确、错误可被前端稳定处理。
- Planning tasks：backend enforces status-driven constraints (due_date/completed_at) and requires board_id; frontend ensures scheduled tasks moved to todo include a due date and the timeline drag indicator maps to scheduled start.
- Planning tasks use UTC timestamps for completed_at.

### 4.3 IPC 交互
- 交互风格：前端通过 `invoke` 调用后端命令；后端返回统一 Envelope 结构（ok/data 或 ok/error）。
- 命令范围（MVP + 插件 v0）：
  - Vault 管理：`select_vault`、`scan_vault`
  - 文件操作：`read_markdown`、`write_markdown`、`rename_markdown`、`delete_entry`、`create_entry`
  - 插件管理：`plugins_list`、`plugins_read_manifest`、`plugins_read_entry`、`plugins_set_enabled`、`vault_read_text`、`vault_write_text`

---

## 5. 核心数据模型（框架级）

### 5.1 FileNode
- `type`: "dir" | "file"
- `name`: string
- `path`: string（相对路径）
- `children?`: FileNode[]

### 5.2 Tab State（最小集）
- `tabs`: Tab[]
- `activeTabId`: string
- `Tab`:
  - `id`: string
  - `type`: "home" | "markdown" | "web"
  - `title`: string
  - `url?`: string (web tab)
  - `filePath?`: string (markdown tab)
  - `loading?`: boolean

### 5.3 Editor State（按 Tab 归属）
- `vaultRoot`: string | null
- `fileTree`: FileNode[] | null
- `editorByTab`: Record<string, { content: string; dirty: boolean; mtime?: number | null }>
- `sidebarOpen`: boolean

---

## 6. 架构原则与禁做事项（框架约束）
### 6.1 后端入口职责边界（lib.rs）
- lib.rs 仅作为应用入口与注册点，不承载业务规则与状态变更逻辑。
- 业务逻辑应拆分为命令层/服务层/策略层的清晰边界（概念约束，不要求立刻拆文件）。

### 6.2 Tab 为一等公民
- Tab 是内容实例的唯一宿主，Tab 与内容视图一一绑定、不可复用。
- 切换 Tab = 切换完整内容实例，禁止仅通过 CSS 显隐完成“假切换”。
- Home Tab 为特殊 Tab（不可关闭），但仍遵循统一 Tab 模型。

### 6.3 Web 内容接入约束
- Web 内容是 Tab 类型的一种，不是独立窗口的特权存在。
- Web Tab 的生命周期由 Tab 状态管理，打开/关闭/切换遵循 Tab 规则。
- 默认不新增额外窗口；如需阶段性方案，必须保留替换为同窗多 webview 的路径。

### 6.4 顶部导航栏系统级定位
- 顶部导航栏属于 App Shell，承载全局交互（Tab / Window / Vault 状态）。
- 导航栏布局不随内容变化而重排，避免拖拽区与按钮操作互相干扰。

---

## 7. 核心流程（MVP 级）
1. 应用启动，默认进入 Home Tab（固定存在、不可关闭）
2. 用户选择 Vault（后端对话框返回路径）
3. 后端扫描 Vault，返回文件树（仅 `.md`，隐藏文件不展示）
4. 用户点击 `.md` 文件，前端打开/激活 Markdown Tab 并加载内容
5. 编辑器内容变化触发实时预览刷新
6. 用户执行保存动作，前端调用写入命令并反馈结果
7. 切换 Tab 时内容实例完整切换，不残留旧页面
8. 选择 Vault 后每 10 秒自动扫描一次，替代手动 Rescan

---

## 8. 技术选型与约束
- 前端：React + TypeScript + Vite
- 编辑器：CodeMirror 6
- 预览：前端 Markdown 渲染管线（如 `react-markdown` + `remark-gfm`）
- 后端：Rust + Tauri
- 包管理：pnpm
- 约束：前端不得直接访问 OS，所有文件访问必须经由后端。
- 窗口控制：使用 Tauri window API 完成最小化 / 最大化 / 关闭。
- Tab 内容：Web 页使用 WebviewWindow 或等效机制实现独立内容实例。

---

## 9. 安全与性能框架
- Vault 边界验证为强制规则，不接受绝对路径输入。
- 禁止通过 symlink 或 `../` 访问 Vault 之外路径。
- Windows：做路径组件安全检查时，不对裸盘符前缀（如 `C:`）进行 metadata 探测，避免扫描失败。
- 目录扫描与读写应异步执行，避免阻塞 UI。
- 默认不渲染危险 HTML；若未来开启，需严格清洗。

---

## 10. Phase 2：Plugins v0
### 10.1 目标
- 实现平台可扩展性与安全隔离
- 支持 Vault 内插件运行
- 插件在 WebWorker 中隔离执行

### 10.2 范围
- **插件目录**：`<VAULT>/.yourapp/plugins/<pluginId>/`
- **运行环境**：WebWorker（每插件一个 worker）
- **核心能力**：
  - 命令注册（Command Palette）
  - 系统事件订阅（白名单）
  - 受控文件读写（vault 内）
  - 插件权限管理
  - 插件启用/禁用机制

### 10.3 交付标准（DoD）
- ✅ 插件可被扫描、加载与执行
- ✅ 插件运行在隔离的 WebWorker 环境中
- ✅ 插件只能访问指定的 vault 内资源
- ✅ 插件可以注册命令并在 Command Palette 中显示
- ✅ 插件可以订阅系统事件
- ✅ 插件可以读取/写入 vault 内文件（受控）
- ✅ 插件可以被启用/禁用
- ✅ 插件拥有权限管理机制

### 10.4 后端新增命令
- `plugins_list`：列出可用插件
- `plugins_read_manifest`：读取插件清单文件
- `plugins_read_entry`：读取插件入口文件
- `plugins_set_enabled`：启用/禁用插件
- `vault_read_text`：插件读取文本文件（受控）
- `vault_write_text`：插件写入文本文件（受控）

### 10.5 前置条件
- ✅ `lib.rs` 已完成瘦身，所有 `#[tauri::command]` 已迁移到 `commands/` 模块
- ✅ 插件目录结构已实现
- ✅ WebWorker 隔离环境已实现
- ✅ 插件命令注册与执行已实现
- ✅ 系统事件订阅机制已实现
- ✅ 受控文件读写权限已实现
- ✅ 插件权限管理已实现
- ✅ 后端插件 API 命令已实现
- ✅ 插件面板 UI 已实现

---

## 11. 未来扩展方向（仅框架提示）
- 预览模式切换：单栏/折叠预览。
- Tab 上下文菜单与历史记录。
- 文件监听与增量刷新：后端 watch + 前端更新树。
- 搜索与索引：后端索引、前端查询显示。
- 双向链接与知识图谱。
- 状态持久化：记住上次 Vault、选中项与布局状态。

> 以上为“方向级”规划，具体实现必须等 `product_process.md` 进入对应阶段后再展开。

---

## 12. 维护规则
- 任何新增能力或边界变化，先更新 `product_process.md`，再同步此文档。
- 若与 `ARCHITECTURE.md` 有冲突，以 `product_process.md` 的当前阶段决策为准并修正两者。
- `lib.rs` 入口化规则必须严格遵守：
  - 任何新增 `#[tauri::command]` 必须位于 `commands/` 模块
  - 业务逻辑必须下沉至 `services/` 或其他专用模块
  - 若未完成 commands 迁移，不允许继续往后端加插件命令
