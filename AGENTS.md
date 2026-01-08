# Repository Guidelines

## Project Structure & Module Organization
- `src/` contains the React + TypeScript frontend (app shell, UI, styles).
- `src-tauri/` contains the Rust backend and Tauri config (`src-tauri/src/`, `src-tauri/tauri.conf.json`).
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
- `E_test_plan.md` is the place to record manual checks once MVP work is complete.

## Architecture & Safety Rules
- Frontend never accesses the OS directly; all filesystem operations go through Tauri commands.
- All file paths from the frontend must be relative to the selected vault root.
- Enforce vault boundary rules from `C_Architecture.md` and the P0 tasks in `D_code_todo.md`.

## Commit & Pull Request Guidelines
- Commit history uses short, descriptive messages (some in Chinese, some in English); there is no enforced convention.
- Keep commits scoped and explain intent (what/why).
- PRs should include a brief summary, testing notes (if any), and screenshots for UI changes.

## Agent-Specific Instructions
- This repo is document-driven: read `A_product_plan.md`, `F_product_process.md`, `B_frame_plan.md`, `C_Architecture.md`, and `D_code_todo.md` before code changes.
- Do not expand IPC surface or relax security boundaries without explicit approval.
