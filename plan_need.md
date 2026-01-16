新建任务及任务生命周期（后端）需求文档
1. 需求目标

本需求用于扩展当前系统的 任务创建能力，并通过后端规则保证任务在不同状态下的数据一致性与语义清晰性。

目标包括：

新建任务时尽量少字段，降低创建成本

通过任务状态（列）驱动字段约束，而非前端写死逻辑

为后续的提醒、统计、复盘等能力提供稳定的数据基础

2. 任务核心模型（Task）
2.1 Task 基础字段定义
字段	类型	是否必填	说明
id	UUID	是	任务唯一标识
title	String	是	任务标题
description	Text	否	任务描述
status	Enum	是	当前任务状态
priority	Enum	否	优先级
due_date	Date	否	计划完成时间
completed_at	DateTime	否	实际完成时间
board_id	UUID	是	所属看板
labels	String[]	否	标签
created_at	DateTime	是	创建时间
updated_at	DateTime	是	更新时间
3. 任务状态（Status）定义
3.1 状态枚举
Backlog        // 待排期
Todo           // 待完成
InProgress     // 进行中
Done           // 已完成

4. 状态驱动的数据约束规则（核心）

后端必须校验，前端只负责提示。

4.1 不同状态对时间字段的约束
状态	due_date	completed_at	规则说明
Backlog	可空	必须为空	不承诺时间
Todo	必填	必须为空	已进入计划
InProgress	必填	必须为空	执行中
Done	可空	必填	记录实际完成
4.2 后端校验规则（示例）

当 status ∈ {Todo, InProgress}：

due_date == null → 拒绝请求

当 status == Done：

自动写入 completed_at = now()

当 status == Backlog：

若传入 completed_at → 拒绝请求

5. 新建任务（Create Task）规则
5.1 创建默认行为

默认状态：Backlog

默认不要求 due_date

不自动生成 completed_at

5.2 Create Task 请求最小集
{
  "title": "准备论文初稿",
  "board_id": "xxx"
}

5.3 Create Task 完整结构（可选字段）
{
  "title": "准备论文初稿",
  "description": "...",
  "status": "Backlog",
  "priority": "Medium",
  "due_date": null,
  "labels": ["论文", "重要"]
}

5.4 创建时后端行为

自动填充：

created_at

updated_at

若启用「自动任务笔记」：

写入一条系统日志：

Task created with status Backlog

6. 任务状态变更（Update Status）
6.1 状态变更接口行为
PATCH /task/{id}/status

6.2 状态迁移规则
Backlog → Todo / InProgress

若 due_date == null

返回错误：DUE_DATE_REQUIRED

任意 → Done

自动：

设置 completed_at = now()

Done → 非 Done

清空：

completed_at = null

7. 截止时间（due_date）更新规则
7.1 更新规则

Backlog 状态：

可设置 / 清空

Todo / InProgress：

允许修改

不允许清空

Done：

允许保留，仅用于统计

8. 数据一致性与约束总结
8.1 后端必须保证的事实

没有完成时间的任务，不能是 Done

没有截止时间的任务，不能是 Todo / InProgress

Backlog 不承诺时间，不应被误用为「延期任务」

9. 可选扩展（不影响本需求）

以下能力不在本期实现范围，但数据结构需兼容：

任务开始时间（start_at）

重复任务规则

子任务 / Checklist

工时记录

10. 本需求的设计边界

本文档仅覆盖：

新建任务

任务状态变更

时间字段约束

不涉及：

UI 布局

提醒策略

统计分析逻辑

11. 设计原则总结

任务可以没有计划，但一旦进入执行，必须对时间负责。