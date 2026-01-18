# ARCHITECTURE.md

This document describes the architecture, responsibility boundaries, and IPC contracts for this Tauri desktop app.

## 1. Goals and scope

### 1.1 MVP scope
- Desktop app (Tauri) with a three-pane layout:
  - Left: File Explorer (workspace/vault file list, collapsible)
  - Middle: Markdown editor (CodeMirror 6)
  - Right: Live Markdown preview (read-only preview for `.md` files)
- Open, edit, and save Markdown files within the vault.
- Web tab support for browsing web content.

### 1.2 Non-goals (分阶段)
#### MVP non-goals
- Search / favorites / tags / graph view / plugins
- Multi-tab / split view / multi-window layout persistence
- Sync / account / cloud storage
- Rich attachments management (images/pdf) beyond basic Markdown rendering

#### Phase 2+ (进行中)
- Plugins v0 (Command Palette + 事件订阅 + 受控文件读写 + Markdown 后处理)

> 插件系统不属于 MVP 验收范围，但属于 Phase 2+ 的平台演进目标。Phase 2 将引入插件 v0：仅命令/事件/受控文件读写/Markdown 后处理，插件在 WebWorker 中隔离运行，后端不执行插件代码。

---

## 2. Tech stack

- Shell: Tauri
- Frontend: React + TypeScript + Vite
- Backend: Rust (Tauri commands)
- Package manager: pnpm
- Markdown rendering (preview): frontend pipeline (e.g., react-markdown + remark-gfm)
- Editor: CodeMirror 6 (required for MVP)

---

## 3. High-level architecture

The app follows a strict separation:

- **UI Layer (Frontend / React)**
  - Layout and interaction (sidebar, editor, preview)
  - Display of file tree, editing surface, and live preview
  - Local UI state (selected file, dirty state, sidebar open state)
  - Calls backend via IPC (invoke)

- **System Layer (Backend / Rust)**
  - File system operations (scan, read, write)
  - Workspace boundary enforcement (only within vault root)
  - (Optional later) file watching, indexing, search

- **IPC Boundary**
  - A small set of commands with stable request/response shapes
  - Typed payloads and explicit error mapping

Principle:
> Frontend never accesses OS resources directly. All filesystem actions go through backend commands.

---

## 3.1 Constraints and boundaries (framework-level)

- Backend entrypoint (`src-tauri/src/lib.rs`) remains an application bootstrap and command registry only.
- Business rules live outside the entrypoint (conceptual separation: command/service/policy layers).
- Tab is the single source of truth for content instances; switching tabs must replace the content instance (no CSS-only fake switching).
- Web content is a tab content type, not a separate window privilege; prefer same-window multi-webview over new windows.
- App shell (top bar) is system-level UI; drag region must not cover interactive controls.

---

## 4. Workspace (Vault) model

### 4.1 Definition
A **Workspace/Vault** is a user-selected root directory. The app only reads (and later writes) files within this root.

### 4.2 Path rules
- Frontend identifies files using **relative paths** to the vault root.
- Backend resolves relative paths to absolute paths and validates they are inside the vault.

### 4.3 Ignore rules (default)
During scan, backend should ignore common non-content directories:
- `.git/`
- `node_modules/`
- `target/`
- `.idea/`, `.vscode/` (optional)
Files starting with `.` should be hidden by default.
Rules can be extended later.

---

## 5. Frontend architecture

### 5.1 UI layout model
- `AppShell`
  - `Sidebar` (File Explorer)
  - `Editor` (CodeMirror 6)
  - `Preview` (Markdown preview)
- Sidebar can be collapsed/expanded via a top-left toggle button.
- When collapsed, editor + preview take full width.
- Home dashboard scrolls within the content pane and stays beneath the app top bar in z-order.
- Home Kanban drag-and-drop uses droppable columns (including doing/empty), pointer-based collision detection with `elementsFromPoint` hit-test fallback, and a drag overlay to keep card sizing stable.
- Home Kanban task cards open the status/priority menu on right click and open the edit modal on double click.

### 5.2 State model (MVP)

#### 5.2.1 State Management Strategy
- **核心实体 store**：
  - `entities/tab`：标签页管理（Tab 状态、activeTabId）
  - `entities/vault`：Vault 管理（vaultRoot）
- **Feature 就地 store**：
  - `features/editor/editor.store.ts`：编辑器状态（内容、dirty 状态、保存状态）
  - `features/explorer/explorer.store.ts`：文件树状态（文件树、展开目录、加载状态）
  - `features/web/web.store.ts`：Web 标签页状态（URL、历史、加载状态）
  - `shared/ui/status.store.ts`：全局状态消息

#### 5.2.2 跨模块通信规则
- 禁止 feature 之间互相 import 对方 store
- 跨模块通信通过 **eventBus**（系统事件白名单）或 **command registry**

#### 5.2.3 Minimal frontend state
- `vaultRoot` (string | null)
- `fileTree` (tree structure)
- `activeFile` (relative path)
- `editorContent` (string)
- `dirty` (boolean)
- `sidebarOpen` (boolean)
- `sidebarWidth` (number; optional)

### 5.3 Rendering pipeline (preview)
- Input: raw Markdown string
- Output: React elements
- Safety:
  - Do not render raw HTML by default
  - If enabling HTML later, sanitize strictly

Links (optional for MVP):
- Support basic relative `.md` links within the vault.

---

## 6. Backend architecture (Rust)

### 6.1 lib.rs 入口层红线（硬规则）
> lib.rs 仅作为 Tauri 入口与命令注册层存在，禁止出现任何业务逻辑。

**规则：**
- `src-tauri/src/lib.rs` **只允许**：模块声明、状态初始化、命令注册（invoke_handler）、setup
- `src-tauri/src/lib.rs` **禁止**：
  - 任何业务实现（文件读写、manifest 解析、路径校验、sidecar 调度）
  - 任何与插件逻辑相关的实现细节

**验收方式：**
- `rg "#[tauri::command]" src-tauri/src` 结果中 **不得出现** `lib.rs`
- `lib.rs` 行数维持在注册层规模（建议 < 200 行）

### 6.2 后端分层目录规范

已实现结构：
```
src-tauri/src/
  lib.rs          # 入口与命令注册（薄）
  commands/       # IPC 入口层，按功能模块拆分
    mod.rs        # 命令模块声明
    vault.rs      # Vault 相关命令
    plugins.rs    # 插件相关命令
  services/       # 业务逻辑层，处理核心业务流程
    mod.rs        # 服务模块声明
    vault_service.rs  # Vault 服务（扫描、文件操作）
    plugins_service.rs # 插件服务（加载、管理）
  security/       # 安全策略层，执行边界校验
    mod.rs        # 安全模块声明
    path_policy.rs    # 路径边界校验
  repo/           # 数据持久化层，处理配置存储
    mod.rs        # 存储模块声明
    settings_repo.rs  # 设置存储
    vault_repo.rs     # Vault 状态存储
  bootstrap.rs    # 应用初始化
  ipc.rs          # IPC 通信工具
  paths.rs        # 路径处理工具
  state.rs        # 应用状态管理
  webview_bridge.rs # WebView 桥接实现
```

**分层约束：**
- commands 层：仅处理 IPC 请求/响应序列化，调用对应 service
- services 层：处理业务逻辑，调用 security 层进行权限校验，调用 repo 层进行数据持久化
- security 层：执行安全策略，如路径边界校验、权限检查
- repo 层：仅处理数据存储，不包含业务逻辑

### 6.3 Responsibilities
Backend provides:
- Directory scan to build file tree (folders + `.md` files)
- Read file content by relative path
- Write file content by relative path
- File operations (create, rename, delete)
- Web tab bridge communication
- Plugin management and execution environment
- Planning task lifecycle validation (due_date/completed_at, board_id)
- Frontend scheduling ensures todo tasks include a due date when needed
- Timeline drag indicator provides the scheduled start time on drop
- Planning tasks use UTC timestamps for completed_at.
- Enforce vault boundary for all file operations
- Provide consistent error responses
- Plugin permission management and isolation

### 6.4 Boundary enforcement (security)
For any file request:
1. Join `vault_root + rel_path`
2. Canonicalize the resulting path
3. Ensure canonical path starts with canonical vault root
4. If not, reject with `PathOutsideVault`
5. If the path crosses a symlink outside the vault, reject
6. Windows: when walking path components for symlink checks, do not probe a bare drive prefix (e.g. `C:`) as a filesystem entry.

No backend command should accept arbitrary absolute paths from the frontend.

### 6.5 Encoding handling
- Prefer UTF-8
- If decoding fails, return a structured error (do not crash)
- Later: consider fallback detection strategies if needed

---

## 7. IPC contracts

All IPC calls return a consistent envelope:

### 7.1 Response envelope (recommended)
- On success:
  - `{ ok: true, data: <payload> }`
- On error:
  - `{ ok: false, error: { code: <string>, message: <string>, details?: <any> } }`

Frontend should not rely on error message text. Use `code` for handling.

### 7.2 Commands (P1 已实现)

#### 7.2.1 `select_vault`
**Status**: Stable

Purpose:
- Ask user to select a directory and set it as vault root (or return existing)

Input:
- none

Output:
- `{ vaultRoot: string }` (absolute path)

Notes:
- Implemented via Tauri dialog APIs.

#### 7.2.2 `scan_vault`
**Status**: Stable

Purpose:
- Scan vault root and return a file tree.

Input:
- `{ vaultRoot: string }` (optional if stored server-side; prefer backend stores the active vault)
- `{ path?: string }` (optional relative path to scan a subdirectory and return its children)

Output:
- `FileNode` tree:
  - `type: "dir" | "file"`
  - `name: string`
  - `path: string` (relative path)
  - `mtime?: number` (optional, file nodes only)
  - `children?: FileNode[]`

Filtering:
- include `.md` files only (in MVP)

#### 7.2.3 `read_markdown`
**Status**: Stable

Purpose:
- Read a markdown file content.

Input:
- `{ path: string }` (relative to vault root)

Output:
- `{ path: string, content: string, mtime?: number }`

Errors:
- `NotFound`
- `PermissionDenied`
- `PathOutsideVault`
- `DecodeFailed`

#### 7.2.4 `write_markdown`
**Status**: Stable

Purpose:
- Write a markdown file content.

Input:
- `{ path: string, content: string }` (relative to vault root)

Output:
- `{ path: string, mtime?: number }`

Errors:
- `NotFound`
- `PermissionDenied`
- `PathOutsideVault`
- `WriteFailed`

#### 7.2.5 `rename_markdown`
**Status**: Stable

Purpose:
- Rename a file or directory.

Input:
- `{ path: string, newName: string }` (relative to vault root)

Output:
- `{ oldPath: string, newPath: string, mtime?: number }`

Errors:
- `NotFound`
- `PermissionDenied`
- `PathOutsideVault`
- `WriteFailed`

#### 7.2.6 `delete_entry`
**Status**: Stable

Purpose:
- Delete a file or directory.

Input:
- `{ path: string }` (relative to vault root)

Output:
- `{ path: string }`

Errors:
- `NotFound`
- `PermissionDenied`
- `PathOutsideVault`
- `WriteFailed`

#### 7.2.7 `create_entry`
**Status**: Stable

Purpose:
- Create a new file or directory.

Input:
- `{ parentPath?: string, kind: string }` (relative to vault root)

Output:
- `{ path: string, kind: string }`

Errors:
- `NotFound`
- `PermissionDenied`
- `PathOutsideVault`
- `WriteFailed`

#### 7.2.8 `plugins_list`
**Status**: Stable

Purpose:
- List available plugins in the vault.

Input:
- none

Output:
- `{ plugins: PluginInfo[] }`
  - `PluginInfo`:
    - `id: string`
    - `name: string`
    - `version: string`
    - `enabled: boolean`
    - `hasError: boolean`
    - `error?: string`

Errors:
- `NoVaultSelected`
- `ScanFailed`

#### 7.2.9 `plugins_read_manifest`
**Status**: Stable

Purpose:
- Read plugin manifest file.

Input:
- `{ pluginId: string }`

Output:
- `{ manifest: PluginManifest }`

Errors:
- `NotFound`
- `NoVaultSelected`
- `DecodeFailed`

#### 7.2.10 `plugins_read_entry`
**Status**: Stable

Purpose:
- Read plugin entry file.

Input:
- `{ pluginId: string }`

Output:
- `{ content: string }`

Errors:
- `NotFound`
- `NoVaultSelected`
- `DecodeFailed`

#### 7.2.11 `plugins_set_enabled`
**Status**: Stable

Purpose:
- Enable or disable a plugin.

Input:
- `{ pluginId: string, enabled: boolean }`

Output:
- `{ pluginId: string, enabled: boolean }`

Errors:
- `NotFound`
- `NoVaultSelected`
- `WriteFailed`

#### 7.2.12 `vault_read_text`
**Status**: Stable

Purpose:
- Read text file content (for plugins).

Input:
- `{ path: string }` (relative to vault root)

Output:
- `{ content: string }`

Errors:
- `NotFound`
- `NoVaultSelected`
- `PathOutsideVault`
- `DecodeFailed`

#### 7.2.13 `vault_write_text`
**Status**: Stable

Purpose:
- Write text file content (for plugins).

Input:
- `{ path: string, content: string }` (relative to vault root)

Output:
- `{ path: string }`

Errors:
- `NotFound`
- `NoVaultSelected`
- `PathOutsideVault`
- `WriteFailed`

### 7.3 Events

#### 7.3.1 `webview-state`
**Status**: Stable

Purpose:
- Webview emits state changes (URL, title, loading status).

Payload:
- `{ label: string, url: string, title: string, readyState: string }`

#### 7.3.2 `webview-open`
**Status**: Stable

Purpose:
- Webview requests to open a URL.

Payload:
- `{ label: string, url: string }`

---

## 8. Error codes (initial)

- `NoVaultSelected`
- `PathOutsideVault`
- `NotFound`
- `PermissionDenied`
- `DecodeFailed`
- `ScanFailed`
- `WriteFailed`
- `Unknown`

---

## 9. Performance considerations (MVP)

- Scan:
  - For large vaults, consider lazy-loading directories later.
  - For MVP, a full recursive scan is acceptable but must not freeze UI:
    - backend runs scan async and returns when ready.
- Read/Write:
  - Reading a single file should be fast; cache in frontend is optional.
  - Writes should be atomic where possible to avoid partial files.

---

## 10. Future extension points

- Editing:
  - Extend editor capabilities (snippets, keymaps) while keeping preview pipeline
- File watching:
  - Backend watches vault changes and emits events to frontend
- Search:
  - Backend indexing for large vaults; frontend performs query + display only
- Wikilinks:
  - Parse `[[name]]` and map to `.md` files; add backlinks later
- Persistence:
  - Store last vault root, last active file, sidebar state

---

## 11. Key architecture rules (must follow)

1. Frontend never reads/writes filesystem directly.
2. Backend never accepts arbitrary absolute paths from frontend.
3. All file operations must be vault-scoped and validated.
4. Keep IPC surface small and stable; add commands deliberately.
5. MVP prioritizes correctness and simplicity over feature richness.
6. lib.rs must remain as a thin entry layer only, no business logic.
7. Feature stores must not be imported directly by other features.
8. Web content must be a tab type, not a separate window.

---

## 12. Checks (可执行验证脚本)

以下命令用于验证架构规则是否被遵守：

```bash
# 1) 检查 lib.rs 中是否存在 tauri command（应为空结果）
rg "#[tauri::command]" src-tauri/src

# 2) 检查是否有跨 feature 直接引用 store（应为空结果）
rg "from\s+['\"].{1,2}/features/.*/.*\.store" src

# 3) 检查 IPC 调用是否都使用了统一的返回格式
rg "invoke\(" src -g"*.ts" -g"*.tsx"

# 4) 检查 lib.rs 行数（应保持在注册层规模）
wsl wc -l src-tauri/src/lib.rs
```
