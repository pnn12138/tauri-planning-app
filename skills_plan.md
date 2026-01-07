# skills_implementation_plan.md
> 目的：在本仓库内建立一套“可复用能力（skills）”的工程化机制，使规划 agent 与 coding agent 能**自动发现**技能、**按路由规则**选择技能、并通过**一致的验收机制**落地实现与回归测试。

---

## 0. 背景与原则

本项目为 **Tauri 桌面应用**：
- 前端：React + TypeScript（Vite）
- 后端：Rust（Tauri）
- 目标：先实现“Markdown 文件浏览/编辑/渲染”的稳定框架，再接入 AI 规划能力。

### 0.1 关键原则
1. **Skill = 可复用能力单元**：围绕一个清晰目标，提供稳定输入/输出与验收方式。
2. **双文档规范**：每个 skill 必须同时提供
   - `skill.md`（人类可读：目标/边界/用法/踩坑）
   - `spec.json`（机器可读：输入输出 schema / invoke / checks）
3. **契约先行**：跨前后端交互必须落到 `ipc_contract.md`（可版本化的协议）。
4. **验收可自动化**：每个 skill 至少提供 1 个冒烟测试（smoke test）。
5. **路由明确**：任务必须绑定 skill；agent 开工前必须先读 skill.md。

---

## 1. 目标产物清单

仓库新增/规范化以下内容：

- `/skills/**`：技能库目录（按 frontend/backend/shared 分域）
- `/skills/registry.json`：技能索引（可自动生成，也可手写维护）
- `/skills/README.md`：技能总览（如何新增、如何验收、如何路由）
- `/docs/AGENTS.md`（或仓库根 AGENTS.md）：写明路由规则与流程约束
- `/skills/shared/ipc_contract/ipc_contract.md`：前后端 IPC 契约
- 每个 skill：`skill.md` + `spec.json` + `tests/`

---

## 2. skills 目录结构（推荐）

/skills
/README.md
/registry.json

/shared
/ipc_contract
ipc_contract.md
skill.md
spec.json
tests/

/backend
/file_access
skill.md
spec.json
tests/
/workspace_index
skill.md
spec.json
tests/

/frontend
/markdown_editor
skill.md
spec.json
tests/
/app_shell
skill.md
spec.json
tests/


### 2.1 域划分定义
- `shared`：跨域协议/数据结构/错误码/事件定义
- `backend`：文件系统、安全沙箱、索引、搜索等
- `frontend`：编辑器、渲染、UI shell、快捷键、状态管理等

---

## 3. Skill 的统一规范

### 3.1 每个 skill 必须包含的文件
- `skill.md`
- `spec.json`
- `tests/`（至少 1 个冒烟测试）
- （可选）`examples/`（用于 agent few-shot 与 manual QA）

### 3.2 `skill.md` 模板（强制章节）
1. **Purpose（目标）**
2. **Non-goals（非目标）**
3. **Interfaces（接口）**
   - 输入/输出字段
   - 错误码/异常约定
4. **Implementation Notes（实现要点）**
5. **Acceptance（验收标准）**
6. **Pitfalls（常见坑）**
7. **Examples（示例）**

### 3.3 `spec.json` 最小字段规范
```json
{
  "name": "frontend/markdown_editor",
  "version": "0.1.0",
  "owner": "frontend",
  "purpose": "Markdown 编辑与渲染能力",
  "inputs_schema": { "type": "object", "properties": {}, "required": [] },
  "outputs_schema": { "type": "object", "properties": {}, "required": [] },
  "invokes": [
    { "kind": "ipc", "name": "open_file", "contract": "skills/shared/ipc_contract/ipc_contract.md#open_file" }
  ],
  "checks": [
    { "kind": "command", "cmd": "pnpm test -w --filter markdown_editor" }
  ]
}
