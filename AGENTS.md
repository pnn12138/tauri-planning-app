# AGENTS.md

This repository is a **Tauri desktop application** built as an Obsidian-like Markdown workspace.

- **Frontend**: React + TypeScript (Vite)
- **Backend**: Rust (Tauri)
- **Package manager**: pnpm
- **Build system**: Vite + Cargo
- **Target platforms**: Windows / macOS / Linux

This file defines **how humans and agents should understand the project state, follow the development process, and make safe changes**.

---

## 1. How to understand this repository

This project is intentionally documented-first.

Before modifying code, always consult the following documents **in order**:

1. **product_plan.md**  
   - What the product is trying to be  
   - What is explicitly in-scope / out-of-scope  

2. **product_process.md**  
   - Current development phase  
   - What is being built now  
   - What decisions have already been made and why  

3. **frame_plan.md**  
   - Technology stack and high-level structure  
   - Long-term framing and evolution direction  

4. **ARCHITECTURE.md**  
   - Frontend / backend responsibility boundaries  
   - IPC contracts and filesystem rules  
   - Security and correctness constraints  

5. **test_plan.md**  
   - How correctness is verified  
   - What must be checked before merging  

6. **code_todo.md**  
   - Concrete implementation tasks for the current phase  

**AGENTS.md does not replace these files — it tells you how to use them together.**

---

## 2. Current project phase (authoritative)

The current phase of this project is defined in **product_process.md**.

Typical phases include:
- Architecture & skeleton
- Core workflow MVP
- Feature expansion
- Hardening & refinement

Agents and contributors must:
- Align their changes with the **current phase**
- Avoid implementing future-phase features prematurely
- Treat decisions recorded in `product_process.md` as *active constraints*, not suggestions

---

## 3. Project structure overview

- `src/` React + TypeScript frontend (App shell, UI, styles)
- `public/` Static assets served by Vite
- `src-tauri/` Rust backend and Tauri configuration
  - `src-tauri/src/` Tauri commands and backend logic
  - `src-tauri/tauri.conf.json` App configuration
- Root configs: `package.json`, `pnpm-lock.yaml`, `vite.config.ts`, `tsconfig*.json`
- Planning docs: `product_plan.md`, `product_process.md`, `frame_plan.md`, `Architecture.md`, `test_plan.md`, `code_todo.md`

## 4. Core architectural rules (non-negotiable)

### 4.1 Frontend / Backend boundary
- **Frontend (React)** is responsible for:
  - UI layout and interaction
  - Markdown rendering
  - Local UI state management

- **Backend (Rust / Tauri)** is responsible for:
  - File system access
  - Workspace (vault) boundary enforcement
  - Security-sensitive or heavy operations

Frontend must **never** access OS resources directly.

---

### 4.2 Workspace (Vault) rule
- All file operations are scoped to a user-selected workspace (vault)
- Frontend uses **relative paths only**
- Backend resolves and validates paths against the vault root

Any attempt to bypass this boundary is considered a **critical architecture violation**.

---

## 5. Decision handling and evolution

This project uses **phase-aware decisions** rather than permanent global decisions.

Active decisions are recorded in:
- **product_process.md** (current, binding)
- **frame_plan.md** (long-term framing)

Rules:
- Do not silently reverse existing decisions
- If a decision must change:
  1. Update `product_process.md` with rationale
  2. Explain why the change is needed *at this stage*
  3. Only then update code

Agents should **propose decision changes before implementing them**.

---

## 6. How to make changes safely

### 6.1 Before coding
- Identify the current phase
- Confirm the change aligns with `product_plan.md`
- Locate relevant constraints in `ARCHITECTURE.md`

### 6.2 During coding
- Prefer minimal, focused changes
- Avoid refactors unless explicitly required
- Do not expand IPC surface casually

### 6.3 After coding
- Update `code_todo.md` if tasks are completed
- Ensure checks in `test_plan.md` are satisfied
- Keep documentation consistent with behavior

---

## 7. Testing expectations

Testing requirements are defined in `test_plan.md`.

At minimum:
- Core workflow must work end-to-end
- No filesystem access outside the vault
- No regressions in the current phase scope

If behavior changes, tests or manual checks must be updated accordingly.

---

## 8. Agent-specific rules

When acting as an automated agent:

- Prefer **analysis and proposal** over direct modification
- Do not introduce features not listed in `product_process.md`
- Do not restructure folders unless explicitly instructed
- Do not upgrade major dependencies silently
- Ask for confirmation before:
  - Changing IPC contracts
  - Relaxing security boundaries
  - Introducing new system capabilities

If uncertain, default to **read-only reasoning and suggestions**.

---

## 9. Explicit non-goals (current state)

This project is **not** currently:
- A full Obsidian replacement
- A plugin platform
- A cloud-synced knowledge base
- A rich-text editor

These may appear in future phases, but are explicitly out of scope now.

---

## 10. Final note

This repository prioritizes:
- Clear boundaries over quick hacks
- Documented intent over implicit behavior
- Phase-driven evolution over feature accumulation

If a change feels “obviously useful” but undocumented,  
**pause and consult the plans first.**
