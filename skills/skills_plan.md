skills/review —— Rust & TypeScript 代码审核 Skills 规划

目的
建立一套可复用、可量化、可阻断合并的代码审核（review）skills，用于统一审查同一仓库内的 Rust（Tauri 后端） 与 TypeScript（React 前端） 代码改动。
设计原则：一个 review agent 即可，通过 skills 将审查流程标准化，避免语言能力污染与遗漏。

1. 总体设计原则

只审查，不实现业务
Review skills 不写业务逻辑，只做门禁、对齐与风险识别。

跨语言统一标准
用同一套规则审查 TS + RS，避免“双 reviewer 标准不一致”。

强制结构化输出
每次审查必须输出统一格式报告，支持直接粘贴到 PR/commit。

可阻断
明确 blocking_issues，未修复不可进入下一步。

与业务 skills 解耦
Review skills 独立于 backend/*、frontend/* 等业务 skills。

2. Review Skills 划分（推荐 3 个）
/skills
  /review
    /quality_gate
    /contract_consistency
    /change_boundary


review/quality_gate：自动化质量门禁（fmt / lint / test）

review/contract_consistency：IPC 合约一致性（shared ↔ backend ↔ frontend）

review/change_boundary：变更边界与 Scope 越界审查

MVP 阶段：先做前两个，即可覆盖 80% 风险。

3. Skill：review/quality_gate
跨 Rust / TypeScript 的质量门禁
3.1 目标

统一执行 Rust 与 TS 的基础质量检查

汇总结果并生成结构化审查报告

明确哪些问题会阻断合并

3.2 审查范围

Rust：src-tauri/**

TypeScript：src/**

与改动相关的 skills/**

3.3 默认 Checks

Rust（Backend）

cargo fmt --check

cargo clippy -- -D warnings

cargo test

TypeScript（Frontend）

pnpm lint

pnpm test

pnpm typecheck（若工程中已配置）

3.4 Blocking 判定规则

任一 check 失败 → Blocking

clippy 出现 warning（-D warnings）→ Blocking

测试失败 → Blocking

3.5 输出（必须）

Summary：通过/失败数量

Rust Checks：逐条结果

TS Checks：逐条结果

Blocking Issues：必须修复项（≤10）

Quick Fix Suggestions：可直接执行的修复建议

4. Skill：review/contract_consistency
IPC 合约一致性审查（Tauri 项目核心）
4.1 目标

确保以下三者始终一致：

skills/shared/ipc_contract/ipc_contract.md

后端 #[tauri::command] 实现

前端 invoke 调用与类型使用

4.2 审查对象

合约文档：skills/shared/ipc_contract/ipc_contract.md

Rust 后端：src-tauri/**

TS 前端：src/**

4.3 必查清单

合约层

方法名是否唯一、稳定

参数是否明确类型/必填/默认值

返回结构是否区分 success / error

错误码是否可定位（非裸字符串）

Rust 后端

函数签名与合约一致

错误是否统一封装（避免随意 anyhow / String）

async command 中是否存在阻塞 IO

涉及文件操作时是否有路径校验

TypeScript 前端

是否使用 shared 定义的类型

是否存在 any 绕过

是否处理 error 分支（UI 提示/日志）

是否出现“前端自造字段”

4.4 Blocking 判定规则

合约与实现不一致 → Blocking

前端/后端私自扩展字段 → Blocking

错误结构不匹配 → Blocking

4.5 输出（必须）

Contract Diff：逐条不一致项（方法名/字段级）

Blocking Issues

Fix TODOs：按文件路径给出修复建议

5. Skill：review/change_boundary
变更边界与 Scope 越界审查
5.1 目标

防止实现 agent 在一次任务中：

顺手修改另一侧语言代码

混入未声明的 shared/架构改动

造成 TS ↔ RS 能力污染

5.2 输入

Scope-Allow：本任务允许修改的目录

Scope-Deny：明确禁止修改的目录

changed_files：来自 git diff

5.3 规则

命中 Scope-Deny → Blocking

跨域修改但任务未声明 → Blocking

修改 IPC 合约但未同步调用方 → Blocking

5.4 输出

Violations：越界文件列表

Blocking Issues

Suggested Task Split：建议拆分方式

6. Review Agent 的标准执行流程

每次业务实现完成后，review agent 必须严格按顺序执行：

change_boundary
→ 确认没有越界或污染

quality_gate
→ 跑 fmt / lint / test，生成门禁报告

contract_consistency（若涉及 IPC / shared）
→ 输出合约差异与修复建议

最终 Review Report
→ 汇总 Blocking Issues + Fix TODOs

7. 与业务 Skills 的协作方式

业务 skills（如 backend/file_access、frontend/markdown_editor）
→ 只关心“把功能写出来”

Review skills
→ 负责“写得是否安全、是否一致、是否越界”

通过 一个实现 agent + 一个 review agent + review skills 实现：

小步实现

快速审查

风险可控

8. MVP 落地顺序（强烈建议）

先实现 review/quality_gate

立刻提升整体代码质量

再加 review/contract_consistency

显著减少 IPC 返工

最后加 review/change_boundary

防止能力污染与架构漂移

9. 核心结论

✅ 审查能力非常适合做成 skills

✅ 一个 review agent 就够（统一标准更重要）

❌ 不需要按语言拆 reviewer

✅ 用 review skills 把“经验”变成“制度”，才能长期稳定迭代