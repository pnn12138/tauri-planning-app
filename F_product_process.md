# Product Process

This file records the current delivery stage, what is implemented, and how each
module works. It stays aligned with A_product_plan.md, B_frame_plan.md, and
C_Architecture.md.

## Current stage
- MVP (P0 + P1) fully implemented; including vault management, markdown editing, live preview, and web tabs.
- Project structure follows a modular architecture with clear separation between frontend and backend.
- Core functionality is complete, with robust state management and error handling.
- Web tab functionality includes navigation controls, history management, and bridge communication.
- File operations (create, rename, delete) are fully implemented with safety checks.

## Project Code Structure

### Root Directory
```
d:\tauri\tauri-planning-app/
├── .vscode/             # VS Code configuration
├── public/              # Static assets for the web interface
├── src/                 # Frontend React application
├── src-tauri/           # Tauri backend (Rust)
├── index.html           # Entry HTML file
├── package.json         # Frontend dependencies and scripts
├── tsconfig.json        # TypeScript configuration
├── vite.config.ts       # Vite build configuration
└── F_product_process.md # This file
```

## Frontend Code Structure (src/)

### Core Files
| File | Function |
|------|----------|
| `main.tsx` | Entry point for the React application |
| `App.tsx` | Main application component with tab management, window controls, and layout |
| `Home.tsx` | Home page displayed when no tab is active |
| `App.css` | Global styling for the application |

### Entities
| Directory/File | Function |
|----------------|----------|
| `entities/tab/tab.model.ts` | Tab-related type definitions (MarkdownTab, WebTab, Tab) |
| `entities/tab/tab.store.ts` | Tab state management with functions for adding, updating, and removing tabs |

### Features

#### Editor
| File | Function |
|------|----------|
| `features/editor/MarkdownTabView.tsx` | Markdown editor tab component |
| `features/editor/cm/CodeMirrorEditor.tsx` | CodeMirror 6 editor implementation |
| `features/editor/preview/PreviewPane.tsx` | Markdown preview component |
| `features/editor/editor.api.ts` | Editor-related API functions |
| `features/editor/editor.store.ts` | Editor state management |

#### Explorer
| File | Function |
|------|----------|
| `features/explorer/ExplorerPanel.tsx` | File explorer sidebar component |
| `features/explorer/explorer.actions.ts` | File operations (create, rename, delete) |
| `features/explorer/explorer.api.ts` | Explorer API functions |
| `features/explorer/explorer.menus.ts` | Context menu definitions for file explorer |
| `features/explorer/explorer.store.ts` | Explorer state management |

#### Web
| File | Function |
|------|----------|
| `features/web/WebTabView.tsx` | Web tab component for displaying web content |
| `features/web/bridge.ts` | Communication bridge between webview and main app |
| `features/web/web.actions.ts` | Web tab navigation and action functions |
| `features/web/web.store.ts` | Web tab state management with history and loading states |

### Shared
| File | Function |
|------|----------|
| `shared/lib/hooks.ts` | Custom React hooks (e.g., useDebounce) |
| `shared/types/api.ts` | API response/error type definitions |
| `shared/types/file.ts` | File-related type definitions |
| `shared/ui/ContextMenu.tsx` | Context menu UI component |
| `shared/ui/status.store.ts` | Status message and notification state management |

## Backend Code Structure (src-tauri/)

| File | Function |
|------|----------|
| `src-tauri/src/main.rs` | Entry point for the Tauri application |
| `src-tauri/src/lib.rs` | Main Rust library with all backend logic |
| `src-tauri/Cargo.toml` | Rust dependencies and build configuration |
| `src-tauri/tauri.conf.json` | Tauri configuration file |
| `src-tauri/capabilities/default.json` | Tauri capabilities configuration |

## Modules and Implementation Details

### Vault selection and lifecycle (backend authoritative)
- **Command**: `select_vault` opens a system folder picker and stores the selected vault as the backend source of truth.
- **Persistence**: Vault root is stored in `vault.json` under the app config dir and restored on startup.
- **Frontend Integration**: Frontend mirrors the vault path for UI only; all reads/writes rely on the backend state.
- **Error Handling**: Returns `NoVaultSelected` when no vault is set.

### Vault scanning and file tree
- **Command**: `scan_vault` scans the vault and returns a tree of `FileNode`.
- **Filtering**: Directories first, then files; hidden entries and non-`.md` files are excluded.
- **Safety**: Symlinks are rejected; all paths are relative to the vault.
- **Windows**: Symlink checks avoid probing bare drive prefixes (e.g. `C:`) to prevent metadata errors.
- **Large Vault Feedback**: Warnings returned when the entry count is high.
- **Partial Results**: Permission-denied directories are skipped with warnings.
- **Lazy Loading**: `scan_vault` accepts an optional relative `path` to load the children of a directory on demand.

### Read markdown
- **Command**: `read_markdown` accepts a relative path and validates vault boundary and symlink rules before reading.
- **UTF-8 Enforcement**: Decode errors return `DecodeFailed`.
- **Response**: Includes content and optional mtime.
- **Frontend Handling**: Ignores stale responses using a monotonically increasing request id.

### Write markdown
- **Command**: `write_markdown` accepts a relative path and validates vault boundary.
- **Atomic Writes**: Uses temp file -> rename/replace pattern for safe writes.
- **Error Reporting**: Includes `step` and `path` details for troubleshooting.
- **Frontend Handling**: Keeps `dirty=true` on failure and shows an error message.

### Editor (CodeMirror 6)
- **Implementation**: Uses CodeMirror 6 for editing with Markdown language support.
- **State Management**: Dirty state flips on change; save clears dirty on success.
- **Save Mechanisms**: Supports Ctrl/Cmd+S keyboard shortcut and automatic debounced saving.

### Live preview
- **Implementation**: Uses `react-markdown` + `remark-gfm` + `rehype-highlight` for rendering.
- **Security**: HTML is disabled by default; URL transform blocks dangerous protocols.
- **Performance**: Uses `useDeferredValue` to reduce update pressure on the UI.

### UI layout and states
- **Layout**: Sidebar (file tree) + content pane (editor/preview/web).
- **Sidebar**: Can be toggled; active file is highlighted.
- **Empty/Error States**: Provide user guidance and feedback.
- **Saving State**: Disables navigation and shows status messages during save operations.
- **Window Controls**: Custom top bar with minimize/maximize/close buttons wired to Tauri window API.
- **Drag Behavior**: Top bar supports dragging via `startDragging` API.

### Web tabs and webview bridge
- **Webviews**: Web tabs are hosted as Tauri webviews in the main window, each with a unique label.
- **Bridge Script**: Injects a bridge script into webviews to communicate with the main app.
- **State Sync**: Webviews emit `webview-state` events with title/url/loading status.
- **Link Handling**: Links with `target="_blank"` or `window.open` are intercepted and opened as new web tabs.
- **Navigation Controls**: Back/Forward/Reload buttons implemented for web tabs.
- **History Management**: Web tab state maintains a history stack with current index for navigation.
- **Loading States**: Web tabs display loading indicators during navigation.
- **Error Handling**: Web tab errors are captured and displayed to the user.
- **URL Normalization**: Input URLs are normalized to ensure proper protocol handling.
- **Search Integration**: Non-URL inputs are converted to Google search queries.

### File Operations
- **Create**: `create_entry` command for creating new files and directories.
- **Rename**: `rename_markdown` command for renaming files and directories.
- **Delete**: `delete_entry` command for deleting files and directories.
- **Safety Checks**: All operations validate vault boundaries and file types.

## Backend Implementation Details

### Core State Management
- **VaultState**: Struct with a mutex-protected vault root path and config path.
- **Configuration**: Vault path is persisted in `vault.json` under the app config directory.
- **Default Vault**: Falls back to a default path if no vault is selected.

### API Commands
| Command | Function |
|---------|----------|
| `select_vault` | Open folder picker and set vault root |
| `scan_vault` | Scan vault and return file tree |
| `read_markdown` | Read markdown file content |
| `write_markdown` | Write markdown file content |
| `rename_markdown` | Rename file or directory |
| `delete_entry` | Delete file or directory |
| `create_entry` | Create new file or directory |

### Webview Bridge
- **Script Injection**: Injects a bridge script into each webview to enable communication.
- **Event Handling**: Listens for webview events and manages webview lifecycle.
- **Navigation**: Handles webview navigation requests and new tab creation.

## Manual Verification Status
- ✅ App starts and loads a previously selected vault.
- ✅ File tree shows only markdown files; directories are expandable.
- ✅ Open file → edit → live preview updates → save → disk updates.
- ✅ Dirty prompt appears when switching files with unsaved changes.
- ✅ Vault boundary and symlink rules prevent outside access.
- ✅ Window controls (minimize/maximize/close) work in Tauri runtime.
- ✅ Top bar drag works without blocking button/input interaction.
- ✅ Web tabs load and display content correctly.
- ✅ Web tab navigation controls (Back/Forward/Reload) work.
- ✅ Web tab history management works correctly.
- ✅ File operations (create/rename/delete) work correctly.
- ✅ Sidebar can be toggled open/closed.
- ✅ Status messages are displayed for operations and errors.
- ✅ Multiple tabs can be opened and switched between.
- ✅ Tabs can be closed individually.
- ✅ URL normalization and search integration work correctly.
- ✅ Web tab loading states are displayed.

## Remaining Work
- Refine web tab navigation UX for smoother transitions.
- Add IPC usage examples to documentation.
- Enhance error handling and user feedback for edge cases.
- Optimize performance for large vaults with many files.
- Add more customization options for the editor and preview.

## Technology Stack

### Frontend
- **Framework**: React 19
- **Language**: TypeScript
- **Build Tool**: Vite
- **Editor**: CodeMirror 6
- **Markdown Rendering**: React Markdown with GFM support
- **Styling**: CSS
- **State Management**: `useSyncExternalStore` for custom store implementation

### Backend
- **Language**: Rust
- **Framework**: Tauri 2
- **File System**: Rust standard library `std::fs`
- **IPC**: Tauri commands and events
- **Serialization**: Serde
- **GUI**: Tauri WebView

### Development Tools
- **IDE**: VS Code
- **Package Manager**: pnpm
- **Version Control**: Git

## Architecture Principles
- **Backend Authoritative**: All file operations and vault state are managed by the backend.
- **Type Safety**: Full TypeScript coverage on frontend, Rust type safety on backend.
- **Modular Design**: Clear separation of concerns between features with entities, features, and shared directories.
- **Security First**: All file paths are validated, symlinks are rejected, and dangerous protocols are blocked.
- **Responsive UI**: Use of deferred values and efficient state management for smooth user experience.
- **Custom State Management**: Leveraging `useSyncExternalStore` for efficient, centralized state management.
- **Tab-Based Navigation**: Flexible tab system supporting both markdown and web content.
- **Cross-Platform Compatibility**: Built with Tauri for desktop applications across Windows, macOS, and Linux.

This document provides a comprehensive overview of the current project structure, implementation details, and remaining work for the Tauri Planning App.
