# Qiuchat Agent 能力强化规划（借鉴 pi-mono，近期 1-2 个迭代）

## Summary
目标是把 Qiuchat 从“带工具调用的单轮 Agent”升级为“极简内核、状态清晰、可恢复、可扩展”的 Agent runtime。  
设计方向参考 `pi-mono` 的核心思路：保持运行时最小化，把能力放到扩展层；以事件流、会话树、上下文压缩、可恢复执行作为一等公民，而不是先做复杂多 Agent 编排。  
近期路线按“先平台后体验”执行，同时纳入两类记忆，但分阶段落地：先完成任务线程记忆/压缩，再补轻量跨会话用户记忆。

参考来源：
- [pi-mono repo](https://github.com/badlogic/pi-mono)
- [pi-mono README](https://github.com/badlogic/pi-mono/blob/main/README.md)
- [pi-mono coding-agent README](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/README.md)
- [deepwiki 索引页](https://deepwiki.com/badlogic/pi-mono)

## Key Changes
### 1. 重构为“极简 Agent 内核 + 扩展能力层”
- 保留 Qiuchat 当前 `PlannerExecutor + ToolRegistry + SkillRegistry + MCP` 骨架，但把内核职责收缩到 4 件事：消息状态、步骤循环、工具执行、事件产出。
- 新增 `AgentSession` / `AgentRunState` 抽象，统一管理当前目标、步骤状态、工具观察结果、停止原因、压缩摘要、恢复点。
- `Skill` 从“提示词片段集合”升级为“行为策略插件”。
  包含：prompt fragment、allowed tools、memory policy、tool selection hint、failure policy。
- `MCP`、本地工具、未来 workflow/memory 都通过同一扩展接口注入，不把能力散落在 route 层。

### 2. 引入 pi-mono 风格的“会话树 + 检查点 + 压缩”
- 每次 Agent 回合都生成可追踪节点，而不是只保存最终消息与 summary。
- 在近期先落地“任务线程记忆”：
  - 记录每轮目标、关键观察、工具结果摘要、最终产出。
  - 超过上下文阈值时做结构化压缩，而不是简单截断消息。
  - 支持从最近稳定检查点续跑，而不是整段历史重新喂给模型。
- 第二步补“跨会话用户记忆”：
  - 仅保存低风险、可验证的长期偏好和项目背景。
  - 与任务线程记忆分层，避免把短期上下文误写成长期事实。
- 默认不做向量数据库优先方案；先做结构化 memory store，后续再评估检索增强。

### 3. 事件流升级为真正的 Agent 运行协议
- 现有 `token / plan_step / tool_call / tool_result / final / error` 扩展为完整生命周期事件：
  - `run_started`
  - `goal_updated`
  - `plan_snapshot`
  - `memory_compacted`
  - `checkpoint_created`
  - `tool_call`
  - `tool_result`
  - `run_paused` / `run_resumed`
  - `final`
  - `error`
- 前后端统一把这些事件当作主协议，不再把 Agent 仅视为“生成文本 + 附带日志”。
- 聊天 UI 优先展示：
  - 当前目标
  - 执行轨迹
  - 最近记忆摘要
  - 工具观察结果
  - 是否从检查点恢复
- 这部分应主要落在 [`route.ts`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/app/api/chat/completions/route.ts)、[`planner-executor.ts`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/lib/agent/planner-executor.ts)、[`chatStore.ts`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/stores/chatStore.ts) 相关链路。

### 4. 近期不做多 Agent，但把委派能力留成扩展位
- 本轮不把 planner/worker 多 Agent 设为主线，避免把复杂度过早转嫁到产品层。
- 先为未来预留 `subtask` / `handoff` 事件、`AgentRole`、`delegationPolicy` 接口，但不默认启用。
- 当前优先把单 Agent 做到：
  - 可恢复
  - 可观测
  - 上下文可压缩
  - 具备稳定记忆边界
  - 对工具/MCP 调用失败有确定性行为

### 5. 分两次迭代交付
- 迭代 1：运行时底座
  - `AgentRunState`
  - 检查点
  - 任务线程记忆
  - 压缩策略
  - 扩展后的事件协议
  - 前端执行轨迹与恢复标记
- 迭代 2：记忆增强
  - 跨会话用户记忆模型
  - memory write/read policy
  - skill 级记忆策略
  - 用户侧记忆可见性与开关
  - 更细的运行诊断与回放入口

## Public Interfaces / Types
- `AgentRuntimeRequest` 增加：
  - `memory?: { mode: 'off' | 'session' | 'session+user'; allowUserProfileWrite?: boolean }`
  - `resumeFromCheckpointId?: string`
  - `executionMode?: 'direct' | 'checkpointed'`
- `AgentEventType` 增加：
  - `run_started`
  - `goal_updated`
  - `plan_snapshot`
  - `memory_compacted`
  - `checkpoint_created`
  - `run_paused`
  - `run_resumed`
- `Message.metadata.agent` 升级为结构化对象，至少包含：
  - `runId`
  - `checkpointId`
  - `goal`
  - `plan`
  - `memorySummary`
  - `resumeFrom`
  - `status`
- 新增持久化对象建议：
  - `AgentRun`
  - `AgentCheckpoint`
  - `AgentMemoryEntry`
  - `UserMemoryProfile`
- `Skill` 元信息增加：
  - `memoryPolicy`
  - `compactionPolicy`
  - `checkpointPolicy`
  - `allowedMemoryScopes`

## Test Plan
- 单元测试
  - 步骤循环在检查点模式下能正确暂停、恢复、结束。
  - 上下文达到阈值时触发压缩，且压缩后仍保留目标、关键观察、未完成任务。
  - 用户记忆写入遵守白名单策略，不把短期任务信息错误提升为长期记忆。
  - 技能切换时 memory policy 与 allowed tools 同时生效。
- 集成测试
  - `/api/chat/completions` 在 `memory=off/session/session+user` 三种模式下行为正确。
  - 同一会话可从最近 checkpoint 恢复继续执行。
  - 工具失败后生成稳定的 `error` 与 `checkpoint_created`/`run_paused` 事件，不丢上下文。
  - 前端能渲染运行目标、计划、压缩事件、恢复事件。
- 验收场景
  - 长任务对话在多轮后仍能保留任务目标与关键事实，不因截断失忆。
  - 用户再次进入同类话题时，可读取显式保存的用户偏好或项目背景。
  - 某轮执行中断后，能够从检查点续跑，而不是完全重算。

## Assumptions
- 近期主线仍是单 Agent，不把多 Agent 协作作为交付前提。
- “长期记忆”拆成两层处理：先任务线程记忆，再轻量跨会话用户记忆。
- 不优先引入重量级外部 Agent 框架；Qiuchat 继续沿现有代码演进。
- 用户记忆默认保守写入，需要可控开关与可解释来源。
- `pi-mono` 对 Qiuchat 最有价值的是运行时哲学和状态模型，而不是原样照搬其具体包结构。



# Qiuchat Agent Runtime 分步演进计划（以架构和依赖为主线）

## Summary
把大方案缩成 5 个按依赖串行落地的步骤。核心原则借鉴 `pi-mono`：内核只负责 `loop + state + events + tool dispatch`，记忆、技能策略、UI、恢复能力都挂在内核外层。  
近期先把单 Agent runtime 做扎实，不把多 Agent 放进主线。

## Core Runtime Loop
Qiuchat 的 Agent Runtime 先统一成一个最小 loop，后续所有能力都围绕它扩展：

```text
load state
-> build turn context
-> ask model for next action
-> if final: emit final and persist checkpoint
-> if tool call: validate policy -> execute tool -> append observation
-> if context too large: compact memory -> continue
-> if interrupted/error: persist checkpoint -> stop or pause
-> repeat until final / maxSteps / fatal error
```

Runtime 只维护这些核心对象：
- `AgentRunState`: 当前 goal、steps、messages、observations、memory summary、status
- `AgentLoopEvent`: 统一事件协议
- `ToolDispatcher`: 工具校验、执行、错误分类
- `CheckpointStore`: 保存和恢复运行状态

## 分步实施
### Step 1. Runtime 内核收敛
目标：先把现有 `PlannerExecutor` 改成稳定 loop，而不是继续叠功能。
- 把 `PlannerExecutor` 重命名或重构为 `AgentRuntime`，职责只保留循环控制和状态推进。
- 明确状态机：`idle -> running -> waiting_tool -> compacting -> completed / failed / paused`
- 统一停止条件：`final`、`maxSteps`、`fatal tool error`、`user interrupt`
- 现有 `plan_step` 不再是临时 UI 数据，而是 `AgentRunState.steps` 的投影
- 本步不做新产品能力，只做运行时边界清理

交付标准：
- 单次回合行为完全由 loop 驱动
- route 层只负责请求解析、流输出、持久化调用
- tool 执行、状态推进、事件生成不再分散在多层

### Step 2. 事件协议与检查点
目标：让 runtime 可观察、可恢复。
- 扩展事件协议：`run_started`、`step_updated`、`tool_call`、`tool_result`、`checkpoint_created`、`final`、`error`
- 每轮结束或异常时落 checkpoint
- checkpoint 至少保存：messages、goal、step 状态、最近工具结果、memory summary、stop reason
- 前端先只消费事件，不要求完整新 UI；先保证协议稳定

交付标准：
- 中断后可以基于 checkpoint 恢复
- SSE 和非流式接口拿到同构事件数据
- `Message.metadata` 不再只存 summary，至少能关联 `runId/checkpointId/status`

### Step 3. Session Memory Compaction
目标：先完成任务线程记忆，不做用户长期画像。
- 在 loop 内加入 context guard：接近上限时触发 compaction
- compaction 输出结构化摘要，而不是一段自由文本
- 摘要最少包含：当前目标、已完成步骤、未完成步骤、关键观察、关键约束
- 后续轮次优先注入摘要和最近窗口，而不是整段历史

交付标准：
- 长会话不会因简单截断而丢失目标
- compaction 事件可见，可追踪压缩前后状态
- 运行时可配置 `memoryMode: off | session`

### Step 4. Skill Policy Layer
目标：把 skill 从 prompt fragment 升级成策略层，但仍然外挂在 runtime 外。
- `Skill` 增加 `toolPolicy`、`memoryPolicy`、`failurePolicy`
- runtime 在每轮组装上下文时读取 skill policy，而不是把所有约束硬编码进 system prompt
- 先保留现有 skill registry 数据源，不扩展成用户自定义平台
- skill 只影响行为边界，不直接改 loop

交付标准：
- 不同 skill 能稳定影响工具可见性、压缩策略、失败处理
- skill 行为差异可通过测试和事件观察到
- runtime 与 skill registry 解耦

### Step 5. 用户侧体验增强
目标：在前 4 步稳定后，再把能力显式暴露给用户。
- 聊天界面展示：当前 goal、步骤状态、工具调用、压缩事件、是否从 checkpoint 恢复
- 增加“继续执行”入口，本质是 `resumeFromCheckpoint`
- 如果要做长期记忆，本步再补最小版 `user memory` 开关和展示，不提前侵入 runtime
- 跨会话用户记忆只保存白名单字段，如偏好、项目背景，不保存未经确认的推断

交付标准：
- 用户能理解 Agent 当前在做什么
- 中断任务能继续，而不是重来
- session memory 和 user memory 在 UI 上有明确边界

## Public Interfaces
- `AgentRuntimeRequest`
  - 增加 `resumeFromCheckpointId?: string`
  - 增加 `memoryMode?: 'off' | 'session' | 'session+user'`
- `AgentEventType`
  - 增加 `run_started | step_updated | checkpoint_created | memory_compacted | run_paused | run_resumed`
- 新增运行时持久化模型
  - `AgentRun`
  - `AgentCheckpoint`
  - `AgentMemoryEntry`（先支持 session memory，user memory 可后加 scope）
- `Skill`
  - 增加 `toolPolicy`
  - 增加 `memoryPolicy`
  - 增加 `failurePolicy`

## Test Plan
- Step 1
  - loop 在无工具、单工具、多工具失败下都能正确停机
- Step 2
  - 工具失败、用户中断、超步数时都能生成 checkpoint
  - checkpoint 恢复后状态连续
- Step 3
  - 触发 compaction 后仍保留 goal、已完成工作和待办
- Step 4
  - 不同 skill 下工具权限和 memory policy 生效
- Step 5
  - 前端能正确展示步骤、恢复状态、压缩事件

## Assumptions
- 近期只做单 Agent 主线
- “长期记忆”拆两层：先 session memory，后 user memory
- `pi-mono` 借鉴重点是最小 loop 和扩展哲学，不照搬其完整产品形态
- 多 Agent、复杂工作流、用户自定义技能市场都不进入本轮主线

