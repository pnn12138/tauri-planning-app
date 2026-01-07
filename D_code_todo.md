# code_todo.md

本文件列出基于 `A_product_plan.md` 与 `B_frame_plan.md` 的**代码落地详细规划**，按优先级排序（P0 最高）。

---

## P0 - MVP 闭环（必须优先完成）
1. 后端：实现 `select_vault` 命令，使用系统对话框选择目录并缓存当前 vault（后端为权威，前端镜像）。
2. 后端：vault 生命周期与持久化约定（默认持久化上次 vault，启动自动恢复；未选择时返回 `NoVaultSelected`）。
3. 后端：vaultRoot 持久化策略分级（仅内存作为 MVP 备选 / 记住上次 vault 作为 P1），并明确 `NoVaultSelected` 触发条件与恢复流程。
4. 后端：实现 `scan_vault` 扫描，构建文件树（目录优先、按名称排序、仅 `.md`，隐藏文件默认过滤），并在大目录下提供基础保护（异步执行、超时/数量阈值提示、避免前端长时间空白）。
5. 后端：实现 `read_markdown`，基于相对路径读取内容，UTF-8 解码失败返回结构化错误。
6. 后端：实现 `write_markdown`，基于相对路径写入内容，确保路径在 vault 内，原子写入策略明确（同目录临时文件 -> 写入 -> 可选 fsync -> replace/rename）；失败回退策略明确（直接写入或返回 `WriteFailed`，附步骤细节）。
7. 后端：实现统一错误码（至少包含 `NoVaultSelected`、`PathOutsideVault`、`NotFound`、`PermissionDenied`、`DecodeFailed`、`WriteFailed`）。
8. 后端：定义 IPC 输入/输出 schema（含 `scan_vault` 返回结构、`read_markdown`/`write_markdown` envelope 与错误结构），作为前后端联调基线。
9. 后端：路径安全校验流程（join + canonicalize + vault root 前缀校验 + 处理 canonicalize 失败的降级策略）。
10. 后端：symlink 策略明确定义（默认全拒绝或允许但需 realpath 仍在 vault 内），并给出对应错误码（如 `SymlinkNotAllowed`）。
11. 前端：应用启动与 Vault 恢复流程（若有持久化 vault，自动加载；否则引导选择）。
12. 前端：文件树 UI（目录可展开/收起、当前文件高亮、仅显示 `.md`）。
13. 前端：双栏编辑/预览布局（Editor + Preview 并排，Sidebar 可折叠）。
14. 前端：集成 CodeMirror 6 作为编辑器，载入文件内容并支持基础编辑。
15. 前端：实时预览（编辑器内容变化驱动 Markdown 渲染，默认禁用 HTML）。
16. 前端：保存行为（快捷键/按钮触发 `write_markdown`，成功/失败提示）。
17. 前端：dirty 状态跟踪与切换文件提示（未保存变更时给予明确提示）。
18. 前端：在 vault 未初始化时屏蔽读写/扫描入口并展示引导，减少错误分支。

---

## P1 - MVP 完整性与稳定性
1. 前端：切换文件时避免旧请求覆盖新内容（读写请求竞态处理），并明确“保存中切换文件”的行为（阻止切换/排队/提示）。
2. 前端：引入 requestId / AbortController 机制，确保仅最新 read 响应落地。
3. 前端：引入 `isSaving` 状态，保存中禁止切换（按钮/点击置灰 + 提示）。
4. 前端：保存失败后的 dirty 行为明确（默认保持 `dirty=true`，并提示重试/另存为）。
5. 前端：读请求乱序的最终显示策略（以最后一次用户选择为准，忽略旧响应）。
6. 前端：空态与错误态提示（未选 Vault、文件读取失败、保存失败）。
7. 前端：编辑器与预览性能优化（节流预览渲染、避免大文件卡顿）。
8. 后端：扫描性能优化（按需加载目录，`scan_vault` 支持传入子目录并返回子节点）。
9. 后端：`scan_vault` 支持 partial result（遇到 `PermissionDenied` 跳过并返回 `warnings: { path, code }[]`）。
10. 后端：写入失败的细化错误信息（权限、锁定、路径无效等）。
11. 前端：键盘快捷键统一（保存、撤销/重做由编辑器默认能力支持）。

---

## P2 - 文档与验证（支撑 MVP 交付）
1. 更新 `test_plan.md`：补充编辑/保存/dirty 提示的验证步骤。
2. 更新 `product_process.md`：明确当前阶段与已决策范围。
3. 为 IPC 命令补充使用说明（输入/输出/错误码示例）。
4. 手工验收清单：按 `A_product_plan.md` 的 6 条标准逐项验证。
