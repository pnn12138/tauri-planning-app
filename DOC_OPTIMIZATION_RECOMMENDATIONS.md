# 框架规划与约束文件优化建议（基于当前项目进展）

> 目的：让 **A_product_plan / B_frame_plan / C_Architecture / F_product_process** 四份文档在“口径、阶段、约束、验收”上对齐，避免 Phase 2（插件 v0）推进时出现自相矛盾或误导开发的条款。  
> 结论先行：**以 F_product_process 作为唯一事实源（source of truth）**，B/C 作为“路线图 + 硬约束”，A 作为“产品契约”。

---

## 1. 现状结论（你目前最典型的文档问题）

### 1.1 口径冲突：Phase 2 已启动，但 C/A 仍写 plugins 为 non-goal
- 你当前已明确要做 **Vault 内插件 + Worker 隔离 + 插件 v0**，但约束文件仍将 plugins 视为“非目标/不做”。  
- 风险：后续协作（AI coding / 人类协作）会按 C 的 non-goals 去拒绝实现，导致反复拉扯。

### 1.2 约束冲突：C 写“单一集中 store”，但实现已是“feature 就地 store”
- 实现上已经是 `entities/tab` + `features/*/*.store.ts` 的结构；  
- 若 C 不更新，会误导后续继续“集中到一个 store”，反而引入巨石状态管理。

### 1.3 进展滞后：B 的 IPC surface & 后端分层描述落后于已实现能力
- B 的命令/接口表若仍停留在 scan/read/write，将无法指导 Phase 2 的插件扫描/读取 entry/转换 sidecar。

### 1.4 后端风险：lib.rs “入口层”规则未固化为可验收硬标准
- 你正在做 lib.rs 瘦身与 commands 迁移，但如果不写成可 grep 的硬规则，后续新增插件相关命令时很容易“回潮”。

---

## 2. 建议的文档职责重构（让每份文件只做一件事）

### 2.1 A_product_plan.md —— 产品契约（What）
**保留：**
- MVP 必须具备/不具备
- 用户视角功能范围、非目标

**补充：**
- 在 non-goals 中明确：`Plugins = Phase 2+（不影响 MVP 验收）`
- 给出 Phase 2 的一句话目标：**“平台可扩展性与安全隔离”**，而不是功能堆叠

**删除/避免：**
- 具体目录结构、具体命令名、具体实现细节（这些属于 B/C）

### 2.2 F_product_process.md —— 唯一事实源（Now / Done）
**定位：**
- 当前实现到哪一步、已有能力列表、真实目录结构、真实接口 surface、当前风险与待办

**建议增强：**
- 增加“Phase 2 in progress”区块：
  - commands 迁移进度（是否还有 `#[tauri::command]` 在 lib.rs）
  - plugins v0 进度（scan/list/enable/worker/markdown postprocess/sidecar）
- 每次合并 PR 必须先更新 F（先事实、后规划）

### 2.3 B_frame_plan.md —— 路线图 + 阶段门（How / When）
**定位：**
- 分阶段计划（Phase 0/1/2/…）
- 每个 phase 的 DoD（验收清单）
- 推荐的目录结构与模块边界

**必须更新：**
- 增加 Phase 2 插件 v0 路线图（最小闭环）
- 明确“Phase 1 DONE / Phase 2 NEXT”的当前状态
- 将“lib.rs 入口化”写入 Phase 2 的前置条件（或 Phase 1 的收尾）

### 2.4 C_Architecture.md —— 硬约束 + 可验收规则（Constraints）
**定位：**
- 不讨论计划，只写“必须遵守的系统规则”
- 关键点必须可自动验收（grep/脚本/检查项）

**必须修正：**
- Non-goals 改为“分阶段 non-goals”（MVP 不做 ≠ 永远不做）
- State management 规则更新为“核心实体 store + feature 就地 store”
- 后端架构写成“目录分层 + 禁止项 + grep 验收”
- IPC contract 列表扩展为 P1 已实现 surface（并标注稳定性）

---

## 3. Phase 2 需要写进 B/C 的关键新增条款（建议直接复制粘贴）

### 3.1 “lib.rs 瘦身”硬规则（写入 C_Architecture.md）

**规则：**
- `src-tauri/src/lib.rs` **只允许**：模块声明、状态初始化、命令注册（invoke_handler）、setup
- `src-tauri/src/lib.rs` **禁止**：
  - 任何业务实现（文件读写、manifest 解析、路径校验、sidecar 调度）
  - 任何与插件逻辑相关的实现细节

**验收方式（必须写进文档）：**
- `rg "#\[tauri::command\]" src-tauri/src` 结果中 **不得出现** `lib.rs`
- `lib.rs` 行数维持在注册层规模（建议 < 200 行，按实际调整）

### 3.2 后端分层目录规范（写入 C_Architecture.md）

推荐结构：
```
src-tauri/src/
  lib.rs
  commands/      # 仅 IPC 入口（薄）
  services/      # 业务编排（厚）
  security/      # 路径边界/大小限制/策略（硬）
  repo/          # 设置持久化（读写 .yourapp/settings.json）
```

分层约束：
- commands 不允许直接做文件 IO（必须调用 services）
- services 不允许绕过 security（路径/大小限制必须统一走 security）

### 3.3 状态管理口径统一（写入 C_Architecture.md）

- 全局核心实体：`entities/tab`（可加 `entities/vault`）
- 业务状态：`features/*/*.store.ts` 就地管理
- 跨模块通信：只通过 **eventBus（系统事件白名单）** 或 **command registry**
- 禁止 feature 之间互相 import 对方 store（防耦合回潮）

### 3.4 Phase 2 插件 v0 的边界（写入 B_frame_plan.md）

- 插件目录：`<VAULT>/.yourapp/plugins/<pluginId>/`
- 插件运行：WebWorker（每插件一个 worker）
- v0 只做：
  - 命令注册（Command Palette）
  - 系统事件订阅（白名单）
  - 受控文件读写（vault 内）
  - Markdown 后处理（Preview postprocess）
- v1/v2 才做：CodeMirror 扩展、UI 注入、插件市场

---

## 4. 建议新增一个“约束索引/验收脚本”区块（让文档可执行）

> 强烈建议在 C_Architecture.md 底部加一个 “Checks” 段落，列出可运行的自检命令。

示例：
```bash
# 1) lib.rs 不允许出现 tauri command
rg "#\[tauri::command\]" src-tauri/src

# 2) 禁止跨 feature 直接引用 store（按你项目结构调整路径）
rg "from\s+['\"]\.{1,2}/features/.*/.*\.store" src

# 3) IPC envelope 使用率（检查是否仍有裸 invoke 返回）
rg "invoke\(" src -g"*.ts" -g"*.tsx"
```

---

## 5. 建议对 B_frame_plan.md 的具体改法（最小变更）

1. 在顶部增加 “Current Status” 段落：
   - Phase 1 DONE（列举已完成：feature 模块化、IPC 封装、eventBus、command registry、dirty guard 等）
   - Phase 2 NEXT（插件 v0）

2. 增加 “Phase 2：Plugins v0” 专节：
   - 目标、范围、DoD、PR 拆分建议
   - 后端新增 commands 列表（plugins_list/read_entry/convert_with_markitdown…）

3. 把 “lib.rs 入口化”从建议升级为“必须满足的前置条件”：
   - 若未完成 commands 迁移，不允许继续往后端加插件命令

---

## 6. 建议对 C_Architecture.md 的具体改法（必须修正冲突）

1. Non-goals 改为分阶段：
   - MVP non-goals：plugins（当时不做）
   - Phase 2+：plugins v0（开始做）

2. State management 改为：核心实体 store + feature 就地 store（与现实一致）

3. Backend architecture 增加：lib.rs 瘦身硬规则 + 分层目录规范 + grep 验收

4. IPC contracts：补齐 P1 已实现命令/事件，并标注稳定等级（Stable / Experimental）

---

## 7. 推荐的执行顺序（最省力且避免返工）

1. **先更新 F_product_process.md**：补 Phase 2 状态与当前真实结构（事实先行）  
2. **再更新 B_frame_plan.md**：加入 Phase 2 路线图 + 阶段门 + DoD  
3. **最后更新 C_Architecture.md**：修正冲突 + 写死硬约束 + 增加可执行 checks  
4. （可选）A_product_plan.md 只补一句“插件属于 Phase 2+，不改变 MVP 验收”即可

---

## 8. 你可以直接采用的“增补段落”（可复制到文档）

### 8.1 插件阶段说明（写入 A/C）
> 插件系统不属于 MVP 验收范围，但属于 Phase 2+ 的平台演进目标。Phase 2 将引入插件 v0：仅命令/事件/受控文件读写/Markdown 后处理，插件在 WebWorker 中隔离运行，后端不执行插件代码。

### 8.2 lib.rs 入口层红线（写入 C）
> lib.rs 仅作为 Tauri 入口与命令注册层存在，禁止出现任何业务逻辑。任何新增 `#[tauri::command]` 必须位于 `commands/` 模块，业务逻辑必须下沉至 `services/`，路径/权限/大小限制必须统一走 `security/`。

---

## 9. 最终产出预期（文档优化后的效果）

- A：清晰定义“产品要什么/不要什么”，不与实现冲突  
- F：准确反映“当前做到哪”，成为协作的唯一事实基线  
- B：告诉你“下一步做什么、怎么验收、每一步的风险边界”  
- C：告诉你“什么绝对不能做、如何自动检查、怎么防回潮”

---

## 10. 下一步我可以直接帮你做什么（不需要你补充太多信息）

- 基于现有四个文件内容，直接生成一套 **vNext 对齐版**：
  - `A_product_plan.vNext.md`
  - `B_frame_plan.vNext.md`
  - `C_Architecture.vNext.md`
  - 同步更新 `F_product_process.vNext.md`
- 并在每个文件顶部加入 “Last updated / Status / Source of truth” 说明，避免再次漂移。
