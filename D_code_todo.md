# code_todo.md

本文件列出基于 `A_product_plan.md` 与 `B_frame_plan.md` 的**代码落地详细规划**，按优先级排序（P0 最高）。

---

## Status
- P0: 顶栏替代原生标题栏、地址栏输入/同步、窗口控制按钮、Webview 权限仍待落地。
- P1: 待规划（需求拆解后补充）。
- P2: 部分落地（仅剩少量文档项，见 P2）。

## Current baseline（现状基线）
- Markdown 预览库：`react-markdown` + `remark-gfm` + `rehype-highlight`，安全策略用 `skipHtml` + `urlTransform`。
- 编辑器：CodeMirror 6（`@uiw/react-codemirror`）。
- 文件树结构：`FileNode { type: "dir" | "file", name, path, mtime?, children? }`（path 为相对路径）。
- 前端状态变量（已存在）：`vaultRoot`, `fileTree`, `tabs`, `activeTabId`, `editorByTab`, `sidebarOpen`, `expandedDirs`, `loadingDirs`, `status`, `statusKind`, `warnings`, `isSaving`, `lastActiveFile`。
- 已有 Home/Markdown/Web Tab 模型，且 Tab 与内容实例绑定。
- 顶部导航栏已固定在窗口最顶部（`position: fixed` + 内容区 padding-top）。
- 右上角原生窗口控制按钮（最小化 / 最大化 / 关闭）未补齐。
- 地址栏目前为展示用 `div`，不可输入/编辑。
- IPC Envelope（实际结构）：`{ ok: true, data }` / `{ ok: false, error: { code, message, details? } }`（与 frame_plan 约定一致）。
- 现有 IPC 命令：`select_vault`, `scan_vault(path?: string)`, `read_markdown`, `write_markdown`（见 `src-tauri/src/lib.rs`）。
- 已集成 Tauri 同窗多 Webview（`Webview` + webview bridge）。
- Tauri capabilities 未声明 `core:webview:allow-create-webview` 权限（运行时会报错）。
- `tauri.conf.json` 仍启用 `decorations: true`（原生标题栏未替代）。

## 写作规范（必须遵守）
- 每条 P0/P1 必须包含：Goal / Requirement Link / User-visible Behavior / Files & Ownership / Implementation Steps / Edge Cases / IPC Contract / DoD & Tests。
- 每条任务必须可在 1 个 PR 内完成；超过则拆分。
- 不允许出现“已落地”但仍列 TODO 的矛盾表述。

## P0 - Requirements（必须优先完成）
### 推荐落地顺序（每步可独立验收）
1) P0-1 顶栏替代原生标题栏与拖拽区域治理
2) P0-2 地址栏输入与同步逻辑
3) P0-3 原生窗口控制按钮
4) P0-4 Webview 权限与新开 Tab 链路

### P0-1 顶栏替代原生标题栏与拖拽区域治理
Goal：自定义顶栏完全替代系统标题栏，且交互区域不被拖拽区覆盖。
Requirement Link：requirement/requirements.md §3.1, §3.4
User-visible Behavior（验收）：
- 顶栏处于窗口最上方，系统标题栏被替代或最小化。
- 顶栏空白区域可拖拽；按钮、Tab、输入框可正常点击/编辑。
Files & Ownership：
- 允许：`src-tauri/tauri.conf.json`, `src/App.tsx`, `src/App.css`
Implementation Steps：
- Tauri：调整窗口 `decorations` 与标题栏配置（Windows 先行验证）。
- 顶栏：梳理 `data-tauri-drag-region` 覆盖范围，仅空白区可拖拽。
- 层级：确保顶栏高于内容区，避免 webview 层覆盖导致点击失效。
Edge Cases：
- 小窗口高度下避免双滚动或控件被遮挡。
- 非 Windows 平台先保持现状或做兼容分支。
IPC Contract / Data Shape：无变更。
DoD & Tests：
- 顶栏可拖拽、按钮/输入框可用，且交互不被拖拽区干扰。
- 窗口顶部不再出现系统标题栏重复区域。

### P0-2 地址栏输入与同步逻辑
Goal：地址栏可编辑，并与当前 Tab 的 URL/路径状态一致。
Requirement Link：requirement/requirements.md §3.3
User-visible Behavior（验收）：
- 地址栏可点击输入/复制粘贴，Enter 触发导航或搜索。
- 切换 Tab 时地址栏展示对应 URL/路径。
- Loading 状态与 Webview 实际加载一致，错误可见。
Files & Ownership：
- 允许：`src/App.tsx`, `src/App.css`
Implementation Steps：
- 将地址栏替换为 `input`，维护 focus/编辑态与显示态（必要时分离）。
- Web Tab：Enter 触发导航（复用当前 webview），非 URL 走搜索模板。
- Markdown/Home：Enter 时新开 Web Tab 或提示（明确策略）。
- 同步：使用 webview-state 回传更新地址栏与 loading 状态。
Edge Cases：
- 非法 URL 或空输入时的行为（保持输入或提示）。
- 切换 Tab 时避免覆盖用户正在编辑的输入值。
IPC Contract / Data Shape：无变更。
DoD & Tests：
- 地址栏可输入/粘贴，Enter 导航生效。
- Tab 切换与页面跳转后地址栏正确更新。

### P0-3 原生窗口控制按钮
Goal：补回最小化/最大化/关闭按钮并保持系统行为一致。
Requirement Link：requirement/requirements.md §3.1
User-visible Behavior（验收）：
- 导航栏右侧显示最小化、最大化/还原、关闭按钮。
- 按钮行为与系统窗口一致。
Files & Ownership：
- 允许：`src/App.tsx`, `src/App.css`
Implementation Steps：
- 使用 `@tauri-apps/api/window` 调用 `minimize`/`toggleMaximize`/`close`。
- 状态：根据 `isMaximized` 更新最大化/还原按钮的显示。
- 样式：放置在导航栏最右侧，视觉不抢焦点。
Edge Cases：
- macOS/Windows 差异暂仅预留，不硬编码平台样式。
IPC Contract / Data Shape：无变更。
DoD & Tests：
- 三个按钮在 Tauri 运行时可用并触发系统行为。

### P0-4 Webview 权限与新开 Tab 链路
Goal：消除 `webview.create_webview not allowed` 并确保新开 Tab 可用。
Requirement Link：requirement/requirements.md §3.5
User-visible Behavior（验收）：
- 新开 Web Tab 不再报权限错误。
- 预览区外链可在应用内新开 Tab，原 Tab 状态保持。
Files & Ownership：
- 允许：`src-tauri/capabilities/default.json`, `src/App.tsx`
- 不允许：新增业务型 IPC 命令
Implementation Steps：
- Capabilities：声明 `core:webview:allow-create-webview` 权限。
- UI：对 webview 创建失败给出可见提示（复用 status 区）。
- 链接策略：外链默认新开 Tab，可预留“系统浏览器打开”开关入口。
Edge Cases：
- 非 Tauri 运行时显示可理解的降级提示。
IPC Contract / Data Shape：无变更。
DoD & Tests：
- 不再出现权限报错；新开 Tab 正常加载页面。

--- 

## P2 - 文档与验证（支撑 MVP 交付）
### P2-2 更新 F_product_process.md
Goal：明确当前阶段与已决策范围，保持文档一致。
Requirement Link：N/A
User-visible Behavior（验收）：
- 文档可读，阶段信息一致。
Files & Ownership：
- 允许：`F_product_process.md`
Implementation Steps：
- 文档：更新阶段、模块实现与验收状态。
Edge Cases：N/A
IPC Contract / Data Shape：无变更。
DoD & Tests：
- 文档内容与代码现状一致。

### P2-3 IPC 使用说明补充
Goal：为 IPC 命令提供输入/输出/错误码示例。
Requirement Link：N/A
User-visible Behavior（验收）：
- 开发者可按文档正确调用 IPC。
Files & Ownership：
- 允许：`C_Architecture.md` 或新增 `IPC.md`
- 不允许：扩展 IPC 面向功能
Implementation Steps：
- 文档：为 `select_vault`/`scan_vault`/`read_markdown`/`write_markdown` 增加示例。
Edge Cases：
- 错误码示例包含 `PathOutsideVault`/`PermissionDenied`。
IPC Contract / Data Shape：
- 与当前 Envelope 保持一致。
DoD & Tests：
- 文档示例可直接用于前后端联调。
