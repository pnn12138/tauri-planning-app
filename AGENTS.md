# Repository Guidelines

## Project Status
- **Phase 1 DONE**: MVP core features (vault management, file tree, Markdown editing, live preview, web tabs)
- **Phase 2 NEXT**: Platform extensibility and secure isolation (Vault plugins + Worker isolation + Plugins v0)

## Project Structure & Module Organization
- `src/` contains the React + TypeScript frontend (app shell, UI, styles).
  - `src/entities/` - Core entities (tab, vault) with state management
  - `src/features/` - Feature modules with local state management
  - `src/shared/` - Shared utilities, types, and UI components
- `src-tauri/` contains the Rust backend and Tauri config.
  - `src-tauri/src/lib.rs` - Thin entry layer (no business logic)
  - `src-tauri/src/commands/` - IPC command handlers
  - `src-tauri/src/services/` - Business logic layer
  - `src-tauri/src/security/` - Path boundary and security policies
  - `src-tauri/src/repo/` - Settings persistence
- `public/` holds static assets served by Vite.
- Planning docs: `A_product_plan.md`, `B_frame_plan.md`, `C_Architecture.md`, `D_code_todo.md`, `F_product_process.md`, `E_test_plan.md`.

## Build, Test, and Development Commands
- `pnpm dev`: run the Vite dev server for frontend UI work.
- `pnpm build`: type-check and build the frontend bundle.
- `pnpm preview`: serve the built frontend locally.
- `pnpm tauri dev`: run the full Tauri desktop app in dev mode.
- `pnpm tauri build`: produce a packaged Tauri build.

## Coding Style & Naming Conventions
- TypeScript/React: keep components and hooks in `src/`, use `PascalCase` for components and `camelCase` for functions/variables.
- Rust: follow `rustfmt` defaults and standard Rust naming (`snake_case`).
- Indentation: 2 spaces for TS/TSX, 4 spaces for Rust where applicable.
- No formatter or linter is configured yet; keep changes minimal and consistent with nearby code.

## Testing Guidelines
- No automated test framework is configured yet.
- `E_test_plan.md` is the place to record manual checks.
- Run architecture validation commands from `C_Architecture.md` to ensure compliance.

## Architecture & Safety Rules
- **Frontend**: Never accesses the OS directly; all filesystem operations go through Tauri commands.
- **Backend**: All file paths from the frontend must be relative to the selected vault root.
- **State Management**: Use core entity stores + feature local stores; no cross-feature store imports.
- **lib.rs Rules**: Must remain as a thin entry layer only; no business logic allowed.
- **Vault Boundary**: Enforce strict vault boundary rules from `C_Architecture.md`.
- **IPC Surface**: Keep small and stable; add commands deliberately with explicit approval.

## Commit & Pull Request Guidelines
- Commit history uses short, descriptive messages (some in Chinese, some in English); there is no enforced convention.
- Keep commits scoped and explain intent (what/why).
- PRs should include a brief summary, testing notes (if any), and screenshots for UI changes.
- Ensure all architecture validation commands pass before submitting PRs.

## Agent-Specific Instructions
- This repo is document-driven: read `A_product_plan.md`, `F_product_process.md`, `B_frame_plan.md`, `C_Architecture.md`, and `D_code_todo.md` before code changes.
- Follow the phase-based approach: MVP features are DONE, Phase 2 focuses on plugins v0.
- Do not expand IPC surface or relax security boundaries without explicit approval.
- Ensure all new Tauri commands are added to `commands/` module, not directly in `lib.rs`.
- Follow feature-based state management; do not import stores from other features.
- **Restriction 1**: When performing project modification tasks, do not modify library files or code not tracked by git.
- **Restriction 2**: Use the commands from `README.md#L8-13` to start the project:
  - `pnpm dev`: 启动前端 Vite 开发服务器。
  - `pnpm build`: 类型检查并构建前端资源。
  - `pnpm preview`: 本地预览构建产物。
  - `pnpm tauri dev`: 启动 Tauri 桌面应用开发模式。
  - `pnpm tauri build`: 构建可分发的桌面应用。

## Document Update Process
- When making changes to the codebase, update `F_product_process.md` first to reflect the current state.
- Then update `B_frame_plan.md` and `C_Architecture.md` to align with the new implementation.
- Finally, update `A_product_plan.md` if there are changes to the product scope.

## Phase 2 Guidelines (Plugins v0)
- Plugins are isolated in WebWorkers, one per plugin
- Plugin directory: `<VAULT>/.yourapp/plugins/<pluginId>/`
- Core plugin capabilities: Command Palette registration, event subscription, controlled file access, Markdown postprocessing
- Backend commands for plugins must follow the same architecture rules as MVP commands
