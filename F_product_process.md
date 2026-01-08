# Product Process

This file records the current delivery stage, what is implemented, and how each
module works. It stays aligned with A_product_plan.md, B_frame_plan.md, and
C_Architecture.md.

## Current stage
- MVP (P0 + P1) largely implemented; remaining work is mostly web tab navigation UX.
- P2 documentation partly done; remaining: add IPC usage examples.

## Modules and implementation details

### Vault selection and lifecycle (backend authoritative)
- Command: `select_vault` opens a system folder picker and stores the selected
  vault as the backend source of truth.
- Persistence: vault root is stored in `vault.json` under the app config dir and
  restored on startup.
- Frontend mirrors the vault path for UI only; all reads/writes rely on the
  backend state.
- Error handling: returns `NoVaultSelected` when no vault is set.

### Vault scanning and file tree
- Command: `scan_vault` scans the vault and returns a tree of `FileNode`.
- Filtering: directories first, then files; hidden entries and non-`.md` files are
  excluded.
- Safety: symlinks are rejected; all paths are relative to the vault.
- Large vault feedback: warnings returned when the entry count is high.
- Partial results: permission-denied directories are skipped with warnings.
- Lazy loading: `scan_vault` accepts an optional relative `path` to load the
  children of a directory on demand.

### Read markdown
- Command: `read_markdown` accepts a relative path and validates vault boundary
  and symlink rules before reading.
- UTF-8 enforcement: decode errors return `DecodeFailed`.
- Response includes content and optional mtime.
- Frontend ignores stale responses using a monotonically increasing request id.

### Write markdown
- Command: `write_markdown` accepts a relative path and validates vault boundary.
- Writes are atomic: temp file -> rename/replace.
- Error reporting includes `step` and `path` details for troubleshooting.
- Frontend keeps `dirty=true` on failure and shows an error message.

### Editor (CodeMirror 6)
- Frontend uses CodeMirror 6 for editing with Markdown language support.
- Dirty state flips on change; save clears dirty on success.
- Save uses Ctrl/Cmd+S and a toolbar button.

### Live preview
- Frontend uses `react-markdown` + `remark-gfm` + `rehype-highlight`.
- HTML is disabled by default; URL transform blocks dangerous protocols.
- Preview rendering uses `useDeferredValue` to reduce update pressure.

### UI layout and states
- Layout: sidebar (file tree) + editor + preview (side-by-side).
- Sidebar can be toggled; active file is highlighted.
- Empty and error states provide user guidance.
- Saving state disables navigation and shows a progress label.
- Custom top bar replaces the native title bar; dragging uses `startDragging`
  from empty top-bar space, and window controls are wired to minimize/maximize/close.

### Web tabs and webview bridge
- Web tabs are hosted in the main window as Tauri webviews.
- A bridge script emits `webview-state` updates (title/url/loading) back to the
  main app for address bar sync and loading states.
- Links that request a new window (`target="_blank"` / `window.open`) are
  intercepted and opened as a new in-app web tab.

## Manual verification status (MVP)
- App starts and loads a previously selected vault.
- File tree shows only markdown files; directories are expandable.
- Open file -> edit -> live preview updates -> save -> disk updates.
- Dirty prompt appears when switching files with unsaved changes.
- Vault boundary and symlink rules prevent outside access.
- Window controls (minimize/maximize/close) work in Tauri runtime.
- Top bar drag works without blocking button/input interaction.

## Remaining work
- P0-4b: main window sends Back/Forward/Reload to active web tab without recreating windows.
- P2-3: add IPC usage examples (input/output/error) to C_Architecture.md or IPC.md.
