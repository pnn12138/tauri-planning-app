# ARCHITECTURE.md

This document describes the architecture, responsibility boundaries, and IPC contracts for this Tauri desktop app.

## 1. Goals and scope

### 1.1 MVP scope
- Desktop app (Tauri) with a three-pane layout:
  - Left: File Explorer (workspace/vault file list, collapsible)
  - Middle: Markdown editor (CodeMirror 6)
  - Right: Live Markdown preview (read-only preview for `.md` files)
- Open, edit, and save Markdown files within the vault.
- Only Markdown is supported for now.

### 1.2 Non-goals (for now)
- Search / favorites / tags / graph view / plugins
- Multi-tab / split view / multi-window layout persistence
- Sync / account / cloud storage
- Rich attachments management (images/pdf) beyond basic Markdown rendering

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

### 5.2 State model (MVP)
Minimal frontend state:
- `vaultRoot` (string | null)
- `fileTree` (tree structure)
- `activeFile` (relative path)
- `editorContent` (string)
- `dirty` (boolean)
- `sidebarOpen` (boolean)
- `sidebarWidth` (number; optional)

State should be centralized (single store) to avoid cross-component drift.

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

### 6.1 Responsibilities
Backend provides:
- Directory scan to build file tree (folders + `.md` files)
- Read file content by relative path
- Write file content by relative path
- Enforce vault boundary for all file operations
- Provide consistent error responses

### 6.2 Boundary enforcement (security)
For any file request:
1. Join `vault_root + rel_path`
2. Canonicalize the resulting path
3. Ensure canonical path starts with canonical vault root
4. If not, reject with `PathOutsideVault`
5. If the path crosses a symlink outside the vault, reject

No backend command should accept arbitrary absolute paths from the frontend.

### 6.3 Encoding handling
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

### 7.2 Commands (MVP)

#### 7.2.1 `select_vault`
Purpose:
- Ask user to select a directory and set it as vault root (or return existing)

Input:
- none

Output:
- `{ vaultRoot: string }` (absolute path)

Notes:
- Can be implemented via Tauri dialog APIs.

#### 7.2.2 `scan_vault`
Purpose:
- Scan vault root and return a file tree.

Input:
- `{ vaultRoot: string }` (optional if stored server-side; prefer backend stores the active vault)

Output:
- `FileNode` tree:
  - `type: "dir" | "file"`
  - `name: string`
  - `path: string` (relative path)
  - `children?: FileNode[]`

Filtering:
- include `.md` files only (in MVP)

#### 7.2.3 `read_markdown`
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
