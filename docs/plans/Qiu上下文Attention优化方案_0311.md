# Qiu 上下文 Attention 优化方案_0311

## 1. 文档目的

本文档用于分析 Qiu 当前 Agent/Chat 上下文组织方式是否满足大模型对 Attention 的要求，并提出一套可执行的优化方案，解决以下问题：

- 提供给模型的提示词缺少明确优先级分层
- 前端与后端当前倾向于把整段会话历史直接提供给模型
- 上下文裁剪发生得过晚，导致 token 浪费和注意力分散
- 附件内容直接拼接进 user message，容易挤占主任务 attention

本文档定位为实现方案，不是 PRD。目标读者是当前项目的研发与架构设计人员。

## 1.1 当前落地状态（2026-03-13）

截至当前版本，方案中的以下能力已经进入运行时主链路：

- prompt 已按 Core Invariants / Task Policy / Memory Context / Preference Layer / Preset Hints 分层组装
- Agent runtime 默认使用有限窗口，不再在无 summary 时退回全量历史
- rolling summary 会在达到阈值后持续更新，并随 checkpoint 一起保存和恢复
- 附件以独立 `Attachment context layer` 注入，不再默认并入 user 正文
- 新增近似 token budget 机制，对 system、memory、recent messages、attachments、tool schema 进行分层预算
- 每轮运行会生成 `contextDiagnostics`，记录送模消息数、各层预算、summary/attachment 开关和裁剪结果

仍需继续补齐的部分主要是更完整的人工回归、收益对比记录，以及对“重新生成”等入口的一致性验证。

## 2. 当前实现分析

## 2.1 Prompt 组织现状

当前 system prompt 由以下内容顺序拼接而成：

1. Base Prompt
2. Strategy Block
3. User Preferences
4. Workflow Template
5. Prompt Presets

对应实现见：
- [`assembler.ts`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/lib/agent/prompt/assembler.ts)

当前问题：

- 虽然已有基础分块，但“硬约束”和“软偏好”没有显式优先级边界
- `workflow` 与 `preset` 都以普通段落形式拼接，没有“必须遵守 / 尽量遵守”的层级表达
- 对模型来说，核心执行边界、任务目标、风格偏好处于同一平面，容易相互稀释

结论：

- 当前 prompt 已有结构，但 attention 优先级表达不够强

## 2.2 会话消息组织现状

前端发送消息时，会把当前会话中的所有消息映射成 `messageHistory` 后提交给后端。

对应实现见：
- [`useChat.ts`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/hooks/useChat.ts)

当前行为：

- 每次发送消息时，前端使用当前 store 中的 `messages` 作为历史
- 再把本轮 user message 追加进去
- 后端以此作为 `llmMessages` 的输入基础

对应实现见：
- [`route.ts`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/app/api/chat/completions/route.ts)

当前问题：

- 请求入口天然偏向“全量历史”
- 在长会话中，模型会持续收到越来越长的上下文
- 与当前问题最相关的最近几轮消息无法获得稳定 attention

结论：

- 当前会话输入方式不满足 attention 收敛要求

## 2.3 Runtime 裁剪现状

Agent runtime 在 `buildTurnMessages` 中处理最终送给模型的消息。

对应实现见：
- [`planner-executor.ts`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/lib/agent/planner-executor.ts)

当前行为：

- 如果 `memoryMode === 'off'`，直接返回全部 `workingMessages`
- 如果还没有 `memorySummary` 且没有 `userMemoryEntries`，也直接返回全部 `workingMessages`
- 只有当已经生成 `memorySummary` 之后，才改成：
  - 第一条 system message
  - 一条 memory system message
  - 最近 8 条消息窗口

当前问题：

- 裁剪依赖于 summary 已经存在，而不是默认启用
- 在 summary 生成前，模型仍然看到全量消息
- 最近窗口策略只在“压缩之后”生效，触发太晚

结论：

- 当前 runtime 裁剪机制属于“后置补救”，不是“前置设计”

## 2.4 Memory Compaction 现状

当前 compaction 的触发条件是总字符数达到阈值。

对应实现见：
- [`planner-executor.ts`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/lib/agent/planner-executor.ts)

当前行为：

- compaction threshold 从 preset 的 `memoryPolicy.compactionThreshold` 获取
- 默认阈值为 `6000` 字符
- compaction 后生成：
  - goal
  - completedSteps
  - pendingSteps
  - keyObservations
  - constraints

当前问题：

- 使用字符数而不是 token budget，控制精度较差
- 触发时机与具体模型上下文窗口无关
- 摘要只在达到阈值后生成，没有滚动维护

结论：

- 当前 compaction 对 attention 的帮助有限，且不稳定

## 2.5 附件注入现状

当前附件内容会被直接拼接到最后一条 user message 中。

对应实现见：
- [`route.ts`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/app/api/chat/completions/route.ts)

当前行为：

- 每个附件若有提取文本，最多取前 `12000` 字符
- 附件上下文直接拼接进用户消息正文

当前问题：

- 主任务与附件正文混在同一个 user message 中
- 附件内容量大时，会抢占模型对真实用户意图的 attention
- 多附件场景下 token 消耗会快速膨胀

结论：

- 附件当前接入方式不满足 attention 优化要求

## 3. 总体判断

从 attention 角度看，当前实现的表现如下：

- 短会话：基本可用
- 中长会话：attention 开始明显涣散
- 长附件 / 多轮 agent 执行：不满足要求

具体原因：

- prompt 优先级分层不够明确
- 历史消息默认全量进入
- 裁剪发生过晚
- 附件文本直接膨胀主上下文
- 没有基于 token budget 的统一上下文预算机制

因此需要进行上下文组织层面的系统性优化，而不是只调一个阈值。

## 4. 方案目标

本方案的目标是建立一套“attention 优先级明确、上下文预算受控、消息窗口稳定收敛”的上下文构建机制。

具体目标如下：

### 4.1 Prompt 优先级目标

送给模型的 system prompt 必须分层表达优先级：

1. Core Invariants：必须遵守的身份、边界、工具约束、停止条件
2. Task Policy：当前任务目标、workflow、输出要求、完成标准
3. Memory Context：会话摘要、用户长期记忆
4. Preference Layer：语气、回复密度、角色提示词
5. Prompt Preset Hints：角色/领域偏好

### 4.2 Message Window 目标

无论会话多长，模型每轮看到的真实消息都应保持在有限窗口内，原则上不再直接接收整个历史。

### 4.3 Summary 目标

会话摘要必须滚动维护，而不是等上下文过大后再一次性补做。

### 4.4 Attachment 目标

附件默认以“摘要上下文”进入主提示词，而不是把全文直接塞进当前 user message。

### 4.5 Budget 目标

上下文构建必须从“字符阈值”升级为“token budget 预算”。

## 5. 核心设计

## 5.1 新的上下文优先级结构

建议将最终传给模型的内容重构为以下顺序：

### Layer 1：Core Invariants

职责：

- 定义 Qiu 的核心身份
- 明确工具权限边界
- 明确停止猜测、失败处理、不可越权等规则

特点：

- 全局最高优先级
- 长度应短且稳定
- 不承载风格性内容

### Layer 2：Task Policy

职责：

- 描述本轮任务目标
- 描述当前 workflow template
- 描述输出格式和完成条件

特点：

- 高优先级，但低于 Core Invariants
- 应围绕当前任务，不承载长期噪音

### Layer 3：Memory Context

职责：

- 提供 session summary
- 提供 user memory
- 提供必要的工具观察结论

特点：

- 不保留冗长原始历史
- 以摘要与事实清单为主

### Layer 4：Preference Layer

职责：

- 表达 tone、density、work mode
- 表达 agent role markdown

特点：

- 属于软约束
- 不应压过任务目标和工具边界

### Layer 5：Preset Hints

职责：

- 表达 prompt preset 的角色或领域偏好

特点：

- 位于最低优先级
- 用于帮助模型“怎么说”，而不是决定“必须做什么”

## 5.2 新的消息窗口策略

建议废弃“summary 不存在时直接返回全量消息”的逻辑，改为始终构建有限窗口上下文。

建议模型输入由以下部分组成：

1. `system`: Core Invariants + Task Policy + Preference + Preset
2. `system`: Session Summary / User Memory / Attachment Summary
3. 最近 `N` 条真实对话消息
4. 必要时补充最近 `M` 条关键 tool result 摘要
5. 当前 user message

建议默认窗口：

- 最近对话窗口：6 到 10 条 message
- 最近关键 observations：3 到 5 条
- session summary：固定预算

注意：

- “最近窗口”按 message 数只是兜底表达，实际应以 token budget 为准
- 当前轮 user message必须始终保留
- 首条 system prompt 必须始终保留

## 5.3 Summary 改造策略

建议把 summary 从“阈值后压缩”改为“滚动摘要”。

### 当前问题

- summary 出现太晚
- 在未压缩前模型已经看了太多历史

### 新策略

- 首次进入 Agent loop 后，在消息超过一个小窗口时就生成首版 session summary
- 后续每轮执行后，按增量更新 summary
- summary 结构保留当前已有字段，但增加更强任务导向字段

建议结构：

```ts
type SessionSummary = {
  goal: string
  currentTask: string
  completedSteps: string[]
  pendingSteps: string[]
  decisions: string[]
  keyObservations: string[]
  openQuestions: string[]
  constraints: string[]
  lastUpdatedAt: number
}
```

相较当前实现，新增：

- `currentTask`
- `decisions`
- `openQuestions`

这样可以让模型把 attention 放在“当前还要做什么”上，而不是只看到历史回顾。

## 5.4 Attachment 接入策略

建议把附件接入从“正文注入”改为“两层模式”。

### 模式 A：默认摘要模式

默认情况下，附件进入主上下文时只提供：

- 文件名
- MIME type
- 简短摘要
- 可用片段列表
- 是否需要进一步读取

示例：

```txt
Attachment summary:
- spec.md (text/markdown)
  - Summary: PRD v2 draft for session memory redesign
  - Key points:
    - mentions token budget
    - proposes rolling summary
  - Full text not inlined
```

### 模式 B：按需深读模式

只有在以下情况才注入更长内容或走工具深读：

- 用户明确要求“根据附件逐段分析”
- workflow template 明确要求精读材料
- 模型在工具调用中判断需要进一步读取

### 设计原则

- 默认不把全文并入 user message
- 默认把附件当作“上下文源”，不是“消息正文”
- 附件正文应通过摘要、片段或工具二次读取进入模型

## 5.5 Token Budget 机制

建议新增统一的上下文预算配置，而不是继续使用字符阈值。

建议新增配置：

```ts
type ContextBudget = {
  maxInputTokens: number
  reservedForOutputTokens: number
  reservedForToolSchemaTokens: number
  maxSystemTokens: number
  maxMemoryTokens: number
  maxRecentMessageTokens: number
  maxAttachmentTokens: number
}
```

建议逻辑：

1. 先确定模型总上下文预算
2. 扣除输出预留
3. 扣除 tools schema 预留
4. system / memory / recent messages / attachment summaries 分别分配子预算
5. 若某层超预算，则对该层独立压缩，而不是把所有层一起截断

收益：

- 控制更稳定
- 各类信息不会相互抢预算
- 有利于后续支持不同模型上下文窗口

## 6. 分阶段实施方案

## Phase 1：Prompt 分层重排

目标：

- 明确 prompt 的 attention 优先级

实施项：

- 重构 [`assembler.ts`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/lib/agent/prompt/assembler.ts)
- 将现有内容拆成：
  - `composeCoreInvariants`
  - `composeTaskPolicy`
  - `composeMemoryContextPrompt`
  - `composePreferencePrompt`
  - `composePresetHints`
- 明确文案：
  - `Must follow`
  - `Task objective`
  - `Context memory`
  - `Preferences`
  - `Hints`

产出：

- 新的 prompt 分层结构
- prompt 相关单测更新

## Phase 2：Runtime 始终裁剪

目标：

- 不再把全量历史直接给模型

实施项：

- 重构 [`planner-executor.ts`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/lib/agent/planner-executor.ts) 的 `buildTurnMessages`
- 即使没有 `memorySummary`，也只保留：
  - system prompt
  - 当前任务说明
  - 最近窗口消息
  - 当前 user message
- 将“最近窗口”从固定 `slice(-8)` 改为 budget 驱动

产出：

- 所有轮次都使用有限窗口
- attention 不再依赖 compaction 之后才收敛

## Phase 3：滚动 Summary

目标：

- 提前生成并持续更新 session summary

实施项：

- 新增 summary builder / updater
- 首次达到最小窗口时就生成 summary
- 每轮依据新增步骤、observation、assistant 输出更新 summary
- checkpoint 中保存新版 summary 结构

产出：

- summary 从“兜底压缩”变为“主上下文组件”

## Phase 4：附件摘要化

目标：

- 控制附件对主上下文的干扰

实施项：

- 重构 [`route.ts`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/app/api/chat/completions/route.ts) 中的 `applyAttachmentsToMessages`
- 将其改为：
  - 生成 attachment summary
  - 写入独立上下文层
  - 不再直接修改 user message 正文
- 为附件正文深读预留工具化入口

产出：

- 默认场景 token 显著下降
- 附件不再稀释主任务 attention

## Phase 5：Token Budget 基础设施

目标：

- 统一用 token budget 管理上下文

实施项：

- 新增 context budget 配置与估算器
- 支持按模型能力设置预算
- `planner-executor` / `chat route` / attachment summary 统一接入预算分配

产出：

- 上下文预算具备统一口径

## 7. 代码层设计建议

## 7.1 建议新增模块

```txt
src/lib/agent/context/
  budget.ts
  estimator.ts
  message-window.ts
  summary-builder.ts
  attachment-summary.ts
```

## 7.2 建议新增类型

建议在 [`types.ts`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/lib/agent/types.ts) 中增加：

```ts
type AgentContextBudget = {
  maxInputTokens: number
  reservedForOutputTokens: number
  reservedForToolSchemaTokens: number
  maxSystemTokens: number
  maxMemoryTokens: number
  maxRecentMessageTokens: number
  maxAttachmentTokens: number
}

type AgentAttachmentSummary = {
  id: string
  name: string
  mimeType: string
  summary: string
  keySnippets: string[]
  truncated: boolean
}
```

## 7.3 建议调整 AgentRunContext

当前 [`types.ts`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/lib/agent/types.ts) 中的 `AgentRunContext` 可增加：

```ts
contextBudget?: AgentContextBudget
attachmentSummaries?: AgentAttachmentSummary[]
currentTask?: string
```

## 7.4 建议调整 ChatRequest

当前 [`chat.ts`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/types/chat.ts) 中的 `ChatRequest` 不一定需要前端显式传递 budget，但后端可在处理时生成：

- attachment summary metadata
- context build diagnostics

可选新增调试字段：

```ts
agent?: {
  ...
  debugContext?: boolean
}
```

仅用于内部验证，不对普通用户暴露。

## 8. 验收标准

## 8.1 功能验收

- 长会话下模型不再直接接收整段历史
- 没有 summary 时也能稳定构建有限上下文窗口
- 附件默认不再全文拼接到 user message
- prompt 层级可以清晰区分硬约束、任务策略、记忆、偏好、提示

## 8.2 质量验收

- 相同会话长度下，平均 prompt token 明显下降
- 长对话中的答非所问、遗忘主任务、被旧消息干扰的情况减少
- 多附件场景下响应质量稳定，不出现主任务被附件正文淹没

## 8.3 工程验收

- 单元测试覆盖：
  - prompt 分层输出
  - message window 裁剪
  - rolling summary 更新
  - attachment summary 构建
  - budget 分配逻辑
- SSE 和 checkpoint 恢复链路不受影响

## 9. 风险与应对

## 风险 1：裁剪过度导致上下文缺失

应对：

- 首版保留较宽的最近窗口
- 对关键 facts 使用 summary 固定保留
- 在 debug 模式输出 context diagnostics，便于回放

## 风险 2：Summary 质量不稳定

应对：

- 先采用规则驱动摘要结构，不完全依赖模型自由生成
- 将 `goal / currentTask / decisions / openQuestions` 设计成固定槽位

## 风险 3：附件摘要过短导致信息损失

应对：

- 保留 key snippets
- 明确“可继续深读”的工具入口
- 对需要精读的 workflow 单独放宽预算

## 风险 4：Token 估算与真实模型计费不完全一致

应对：

- 首版允许保守估算
- 运行时记录 usage，逐步回调预算参数

## 10. 推荐落地顺序

建议按以下顺序实施：

1. Prompt 分层重排
2. `buildTurnMessages` 改为始终裁剪
3. 引入 rolling summary
4. 附件摘要化
5. token budget 基础设施

原因：

- 前两步最直接改善 attention
- 第三步开始提升长会话稳定性
- 第四步解决附件膨胀
- 第五步再把整套机制收敛为统一预算体系

## 11. 最终结论

当前实现尚不能充分满足大模型 attention 的需要。

根本问题不在于某一个阈值太小或太大，而在于：

- 上下文输入默认仍偏向全量历史
- 提示词优先级表达不够强
- summary 生成太晚
- 附件全文默认进入主上下文

因此需要把“上下文构建”升级成显式的架构层，而不是继续把它当作 runtime 的附属逻辑。完成本方案后，Qiu 的模型输入会更聚焦、更省 token，也更适合长会话和 Agent 场景。
