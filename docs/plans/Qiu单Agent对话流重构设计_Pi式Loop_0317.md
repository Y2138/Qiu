# Qiu 单 Agent 对话流重构设计（Pi 式 Loop）_0317

## Summary
本设计稿聚焦 3 个目标：
- 将 Agent 处理过程以内嵌消息流的方式展示在前端，并和正式回答形成明确视觉分层。
- 将当前 `planner-executor` 重构为更接近 Pi Agent 思路的最小单 Agent loop，降低核心运行时复杂度。
- 收敛 SSE 事件协议、前端消息模型和持久化结构，减少重复翻译、重复组装和过度设计。

本次范围只覆盖：
- 单 Agent
- 前端过程展示
- `planner-executor` 简化重构

本次明确不覆盖：
- 多 Agent 协作
- MCP 产品化扩展
- 自动化任务
- 长时间后台自治执行

---

## Requirements Summary

**Goal**
- 让用户在聊天流里自然感知 Agent “正在想什么、正在做什么、做到哪一步了”，同时让底层 runtime 更轻、更稳、更容易扩展。

**Scope**
- In scope:
  - 聊天页中的 Agent 过程展示重构
  - Agent SSE 事件协议重构
  - assistant 消息数据模型重构
  - `planner-executor` 到最小 loop 的拆分与简化
  - checkpoint / summary / persistence 的瘦身
- Out of scope:
  - 多 Agent
  - MCP 体验设计
  - 新增自动化能力
  - 全量能力平台化

**Constraints**
- 继续基于现有 Next.js / App Router / SSE 链路增量演进。
- 普通用户不应被 `memory / checkpoint / planner` 等底层概念打扰。
- 不展示 raw chain-of-thought，只展示用户可理解的思考摘要与执行状态。

**Success Criteria**
- 用户能在一条 assistant 消息中看到自然、稳定的“处理轨迹 + 最终回答”。
- 前端不再依赖 `metadata.agentEvents -> status card` 的二次推导才能理解当前状态。
- runtime 的核心循环职责清晰，代码层面不再把 planning、summary、compaction、checkpoint、UI event mapping 强耦合在一起。

**Priority**
1. 前端可感知过程展示
2. 事件协议与消息模型收敛
3. runtime 简化与分层

**Assumptions**
- 当前 `AgentRunPanel` 降级为调试视图或后续删除，不再作为主交互结构。
- 现有 context budget / summary 能力保留，但要从 core loop 中拆出去。
- 现有历史消息和 metadata 需要兼容读取。

---

## 背景与问题

当前实现已经具备最小 Agent 骨架，但存在明显的“核心过厚、展示过薄”问题：

### 1. 运行时核心过厚
当前 [`planner-executor.ts`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/lib/agent/planner-executor.ts) 同时承担：
- loop 驱动
- plan step 状态管理
- rolling summary 更新
- context compaction
- checkpoint 创建
- 事件发射
- 观察结果管理
- 最终 summary 组装

这使得一个核心类同时处理“决策、上下文治理、产品事件、持久化快照”四类职责，复杂度偏高。

### 2. 前端过程展示不是 first-class 模型
当前 [`useChat.ts`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/hooks/useChat.ts) 将 SSE 事件收集后塞进 `message.metadata.agentEvents`，再由 [`MessageList/index.tsx`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/components/chat/MessageList/index.tsx) 二次归纳成状态卡片。

问题是：
- 事件语义已经损失顺序细节
- 前端拿到的是“日志片段”，不是“消息组成部分”
- “思考中 / 工具执行中 / 正在总结”这些状态没有稳定的数据结构

### 3. 事件协议偏技术视角，不是产品视角
当前事件主要围绕：
- `step_updated`
- `plan_step`
- `tool_call`
- `tool_result`
- `checkpoint_created`
- `memory_updated`

这套协议适合调试，不适合作为最终产品协议。前端不得不继续做一层“技术事件 -> 用户文案”的翻译。

### 4. 当前设计与产品方向已经偏离
现有规划文档已经明确：
- Agent 状态应嵌入对话，而不是旁路展示
- 普通用户不应理解底层概念
- 默认是“可理解的助手”，不是“复杂的 Agent 面板”

参考：
- [`Qiu 极简 Agent 助手系统迭代规划_0310.md`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/docs/plans/Qiu%20极简%20Agent%20助手系统迭代规划_0310.md)
- [`Step5 Agent用户体验增强_0310.md`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/docs/plans/Step5%20Agent用户体验增强_0310.md)

其中 `Step5` 方案仍然延续了 `Agent Run Panel` 的思路，这与本轮“状态回归消息流主结构”的目标不一致，应以本设计稿为准进行修正。

---

## 设计原则

### 1. 过程可见，但不暴露底层思维原文
- 展示“思考摘要”，不展示 raw chain-of-thought。
- 展示“工具状态”，不展示底层 schema 和参数拼装细节。
- 展示“当前状态”，不展示内部状态机术语。

### 2. 核心 loop 极简，复杂能力外挂
- core loop 只处理：准备上下文、调用模型、执行工具、追加结果、判断结束。
- summary、compaction、checkpoint、UI 事件映射都由独立模块处理。

### 3. 事件协议为产品服务，而不是为内部调试服务
- SSE 默认下发用户可消费事件。
- 需要调试的信息放到 `debug` 字段或 debug-only 视图，不污染主协议。

### 4. 前端以“消息组成部分”建模，而不是“metadata 补丁”
- assistant 消息天然由两部分构成：
  - `trace`
  - `final`
- 过程展示应是 first-class render model。

### 5. 默认单 Agent、串行 loop、有限步数
- 保持 Pi 风格的轻量单线程心智模型。
- 不提前设计复杂 planner、graph、workflow template。

---

## 目标体验

### 用户看到的消息结构
一条 assistant 消息由三层组成：

1. `Agent Trace`
- “正在理解需求”
- “已识别 2 个改动方向”
- “正在读取项目文档”
- “工具执行完成，正在整理结果”

2. `Tool Status`
- 工具名称
- 当前状态：running / success / failed
- 简短结果摘要
- 耗时

3. `Final Answer`
- 正式 markdown 内容

### 视觉规范
- `thinking summary`
  - 低对比、浅底色、轻量文字
  - 默认展开当前项，历史项可折叠
- `tool status`
  - 独立卡片
  - 明确的运行中 / 完成 / 失败态
  - 支持 spinner、耗时、简短结果
- `final answer`
  - 保持现有 assistant markdown 气泡风格

### 暂停与继续
- 当任务暂停或失败时，在 trace 区块直接展示：
  - “处理已暂停，可继续”
  - 一个 `继续处理` 按钮
- 不要求用户理解 checkpoint id。

---

## 总体方案

方案分 3 层：

### A. Frontend Message Layer
将 assistant 消息升级为“结构化消息部件”模型。

### B. Event Protocol Layer
将现有 debug 风格事件收敛成产品事件。

### C. Runtime Core Layer
将 `planner-executor` 改造成最小 loop，并把上下文治理和恢复机制拆出去。

---

## A. 前端消息模型重构

## 目标
从当前：
- `message.content`
- `message.metadata.agentEvents`

迁移到：
- `message.parts.trace[]`
- `message.parts.final`

## 建议数据结构

```ts
type AssistantMessagePart =
  | AgentTracePart
  | FinalContentPart;

interface AgentTracePart {
  kind: 'agent_trace';
  status: 'running' | 'paused' | 'failed' | 'completed';
  items: AgentTraceItem[];
  resumable?: {
    checkpointId: string;
    label: string;
  };
}

type AgentTraceItem =
  | ThinkingSummaryItem
  | ToolStatusItem
  | RunStatusItem;

interface ThinkingSummaryItem {
  type: 'thinking_summary';
  id: string;
  text: string;
  createdAt: number;
}

interface ToolStatusItem {
  type: 'tool_status';
  id: string;
  toolName: string;
  state: 'running' | 'success' | 'failed';
  summary?: string;
  latencyMs?: number;
  createdAt: number;
}

interface RunStatusItem {
  type: 'run_status';
  id: string;
  tone: 'info' | 'warning' | 'success';
  text: string;
  createdAt: number;
}

interface FinalContentPart {
  kind: 'final_content';
  text: string;
  isStreaming?: boolean;
}
```

## 兼容策略
- 服务端短期内仍可继续写入 `metadata.agentEvents` 作为兼容字段。
- 前端新增 `buildAssistantParts(message)`：
  - 优先读取 `metadata.agent.parts`
  - 回退到旧 `agentEvents`
- 这样可以先改渲染层，再改后端事件协议。

## 组件拆分建议

### 新增组件
- `src/components/chat/AgentTrace/index.tsx`
- `src/components/chat/AgentTrace/ThinkingRow.tsx`
- `src/components/chat/AgentTrace/ToolStatusCard.tsx`
- `src/components/chat/AgentTrace/RunStatusRow.tsx`

### 调整组件
- [`MessageList/index.tsx`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/components/chat/MessageList/index.tsx)
  - 移除 `buildStatusCards`
  - 改为渲染结构化 `AgentTrace`
- [`ChatContainer/index.tsx`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/components/chat/ChatContainer/index.tsx)
  - 去掉“会话级 Agent Panel”依赖
  - 保留顶部“继续上次任务”快捷入口

### 降级或删除
- [`AgentRunPanel.tsx`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/components/chat/AgentRunPanel.tsx)
  - 降为 debug-only 组件
  - 不再作为主产品路径

---

## B. SSE 事件协议重构

## 当前问题
当前事件协议过度贴近 runtime 内部状态，导致：
- 前端要自行翻译
- `step_updated` / `plan_step` 有重复
- `tool_call` / `tool_result` 只能由前端拼成一张卡

## 目标
服务端直接下发产品层事件，前端尽量不做语义推断。

## 新协议建议

```ts
type AgentStreamEvent =
  | {
      type: 'agent.status';
      payload: {
        state: 'started' | 'thinking' | 'tool_running' | 'finalizing' | 'paused' | 'completed' | 'failed';
        label: string;
      };
    }
  | {
      type: 'agent.thinking';
      payload: {
        id: string;
        text: string;
      };
    }
  | {
      type: 'agent.tool';
      payload: {
        id: string;
        toolName: string;
        state: 'started' | 'success' | 'failed';
        summary?: string;
        latencyMs?: number;
      };
    }
  | {
      type: 'agent.checkpoint';
      payload: {
        checkpointId: string;
        resumable: boolean;
        label: string;
      };
    }
  | {
      type: 'message.delta';
      payload: {
        content: string;
      };
    }
  | {
      type: 'message.done';
      payload: {
        content: string;
        usage?: {
          promptTokens: number;
          completionTokens: number;
          totalTokens: number;
        };
      };
    }
  | {
      type: 'error';
      payload: {
        message: string;
      };
    };
```

## 事件映射规则

### 运行时内部事件到产品事件
- `run_started` -> `agent.status(started)`
- 步骤分析开始 -> `agent.status(thinking)`
- 规划摘要/下一步摘要 -> `agent.thinking`
- `tool_call` -> `agent.tool(started)`
- `tool_result success` -> `agent.tool(success)`
- `tool_result failed` -> `agent.tool(failed)`
- 最终回答生成阶段 -> `agent.status(finalizing)`
- `run_paused` -> `agent.status(paused)` + `agent.checkpoint`
- 完成 -> `agent.status(completed)` + `message.done`

## 兼容策略
- SSE 解析层 [`stream.ts`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/services/stream.ts) 先同时兼容：
  - 旧 `token/final`
  - 新 `message.delta/message.done`

---

## C. Runtime Core 重构

## 目标
把 [`planner-executor.ts`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/lib/agent/planner-executor.ts) 从“大一统 orchestrator”拆成几个轻模块。

## 目标分层

### 1. `agent-loop.ts`
职责：
- 准备一轮输入
- 请求模型
- 执行工具
- 追加结果
- 判断是否结束

### 2. `context-manager.ts`
职责：
- system / memory / recent / attachment 的组装
- budget 计算
- compaction 策略
- summary 注入

### 3. `checkpoint-manager.ts`
职责：
- pause / failure / interruption 时生成 checkpoint
- resume 时加载 checkpoint

### 4. `trace-mapper.ts`
职责：
- 将内部状态转换成产品事件
- 统一文案和输出结构

### 5. `run-summary.ts`
职责：
- 生成最终 summary
- 收集工具使用情况
- 产出 persistence payload

## 新的最小 loop

```ts
while (stepCount < maxSteps) {
  emitStatus('thinking');

  const turn = contextManager.prepare(state, context);
  const response = await model.completeWithTools(turn.messages, turn.options);

  if (response.content) {
    state.draftAnswer = appendDraft(state.draftAnswer, response.content);
  }

  if (!response.toolCalls?.length) {
    emitStatus('finalizing');
    return finalize(response);
  }

  for (const call of response.toolCalls) {
    emitToolStarted(call);
    const result = await tools.execute(call, context);
    state.toolResults.push(result);
    state.messages.push(toToolResultMessage(result));
    emitToolFinished(result);

    if (!result.success && failureMode === 'stop') {
      return pauseWithCheckpoint(result);
    }
  }

  contextManager.maintain(state, context);
}

return failByStepLimit();
```

## 与当前实现的关键差异

### 当前
- 每轮都显式创建 `PlanStep`
- loop 内部直接更新 summary、compaction、checkpoint、events
- 事件发射和 UI 文案强耦合

### 目标
- 不把 `PlanStep[]` 作为核心运行态
- planning 降级为可选“thinking summary”
- checkpoint 只在需要恢复时产生
- context 维护从 core loop 剥离

---

## Planning 策略调整

## 当前问题
`planner-executor` 把“planning”实现成显式 `PlanStep` 状态机，带来两个问题：
- 对简单任务过重
- 前端最终也只消费了“已拆成 N 步”的摘要

## 新策略
将 planning 降级为两种轻量形态：

### 1. 隐式规划
默认情况下，模型只需输出下一步的思考摘要，不要求生成完整计划列表。

示例：
- “先检查当前实现与产品目标的偏差”
- “接下来读取聊天流和 runtime 实现”

### 2. 条件性显式规划
仅在任务明显复杂时生成短计划快照：
- 2-4 项
- 不持久维护 step state machine
- 仅作为 trace item 展示

这样更接近 Pi 的“scratchpad + loop”，而不是 workflow engine。

---

## Context / Memory / Compaction 策略

## 保留能力
- system prompt
- recent messages window
- attachment context layer
- session summary
- user memory

## 重构原则
- 保留现有预算模型思路
- 从 core loop 移到 `context-manager`
- 不再把 `memory_updated` / `context_compacted` 默认暴露给用户

## 用户可见映射
- `memory refreshed` -> 不展示，或弱化成一条 `thinking_summary`
- `context compacted` -> 只在必要时展示“已整理上下文，继续处理”

## Summary 策略
- rolling summary 仍保留，主要服务恢复和长会话压缩
- 但不再作为前端主展示结构
- summary 是运行时内部资产，不是 UI 主组件

---

## Checkpoint 策略调整

## 当前问题
当前完成态也会创建 checkpoint，这会导致：
- persistence 负担变大
- 恢复模型和最终完成态混在一起
- 用户无感但系统复杂

## 新策略
- 仅在以下情况创建 checkpoint：
  - paused
  - failed
  - interrupted
- completed 不默认落完整 checkpoint
- 如果未来需要审计，可保留轻量 run summary，而不是完整 snapshot

## 恢复入口
- 前端仍使用“继续处理”
- checkpoint id 只在内部流转
- message metadata 中仅保留：
  - `resumable`
  - `checkpointId`
  - `statusLabel`

---

## 持久化与兼容

## 建议写入结构
assistant message metadata 新增：

```ts
interface AgentMessageMetadata {
  agent?: {
    version: 2;
    runId: string;
    status: 'running' | 'paused' | 'failed' | 'completed';
    parts: AssistantMessagePart[];
    checkpoint?: {
      id: string;
      resumable: boolean;
      label: string;
    };
    summary?: Record<string, unknown>;
  };
}
```

## 兼容读取
- 读取顺序：
  1. `metadata.agent.parts`
  2. `metadata.agentEvents`
  3. 纯文本 assistant message

## 数据迁移
- 不做离线批量迁移。
- 采用 runtime read-time fallback。
- 新消息写新结构，旧消息继续可读。

---

## 前端改造点

## 1. 类型层
调整 [`src/types/chat.ts`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/types/chat.ts)：
- 增加 `AssistantMessagePart`
- 增加 `AgentTraceItem`
- 将 `StreamChunk` 兼容新事件协议

## 2. 流式聚合层
调整 [`src/hooks/useChat.ts`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/hooks/useChat.ts)：
- 不再只收集 `agentEvents`
- 改为维护 `assistantParts`
- `message.delta` 只更新 `final_content`
- `agent.tool` 更新对应 tool card
- `agent.thinking` 追加 thinking row

## 3. 渲染层
调整 [`src/components/chat/MessageList/index.tsx`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/components/chat/MessageList/index.tsx)：
- assistant 消息渲染顺序：
  - `AgentTrace`
  - `MarkdownRenderer(final content)`
- streaming 态也展示 trace，而不是只展示 cursor

## 4. 恢复入口
保留 [`ChatContainer/index.tsx`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/components/chat/ChatContainer/index.tsx) 顶部的“继续处理”快捷入口，但其数据来源改为：
- 最近一条 assistant message 中的 `metadata.agent.checkpoint`
- 不再依赖复杂 run panel 聚合

---

## 后端改造点

## 1. Chat Route
调整 [`src/app/api/chat/completions/route.ts`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/app/api/chat/completions/route.ts)：
- SSE 输出兼容新协议
- agent 完成后直接保存结构化 `parts`
- 兼容旧客户端的 token/final 行为，过渡期双写

## 2. Agent Entry
调整 [`src/lib/agent/index.ts`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/lib/agent/index.ts)：
- `runAgentRound` 只负责组装 context 和依赖
- 不再承载复杂 planner 语义

## 3. Runtime Files
建议拆分为：
- `src/lib/agent/agent-loop.ts`
- `src/lib/agent/context-manager.ts`
- `src/lib/agent/checkpoint-manager.ts`
- `src/lib/agent/trace-mapper.ts`
- `src/lib/agent/run-summary.ts`

过渡期可以保留 [`planner-executor.ts`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/lib/agent/planner-executor.ts) 作为门面，内部逐步迁移实现。

---

## 分阶段实施

## Phase 1: 前端结构先行
目标：
- 先让消息流能承载 `trace + final`

变更：
- 新增 `AssistantMessagePart`
- 新增 `AgentTrace` 组件
- `useChat` 支持聚合结构化 parts
- 保留旧事件兼容

验收：
- 不改 runtime 核心，也能先把当前 `agentEvents` 更自然地展示出来

## Phase 2: SSE 协议收敛
目标：
- 让服务端直接输出产品级事件

变更：
- route 层支持新事件
- `trace-mapper` 将内部事件映射为产品事件
- 前端减少二次推理

验收：
- 前端不再需要 `buildStatusCards`

## Phase 3: runtime 简化
目标：
- 从“大一统 planner-executor”迁移到最小 loop

变更：
- 拆出 `context-manager`
- 拆出 `checkpoint-manager`
- checkpoint 只在可恢复场景落地
- plan step 状态机降级

验收：
- runtime 主文件长度和职责明显下降
- 核心 loop 更接近“单 Agent 串行回合”模型

---

## 测试计划

## 单元测试
- `trace-mapper`
  - 内部事件能稳定映射到产品事件
- `context-manager`
  - budget / summary / compaction 逻辑不回归
- `agent-loop`
  - 无工具直接完成
  - 工具成功后继续
  - 工具失败后 pause
  - 超步数后 fail

## 前端测试
- `useChat`
  - 能将 SSE 事件聚合成 `parts`
- `AgentTrace`
  - `thinking_summary`
  - `tool_status`
  - `run_status`
  - 恢复按钮

## 集成测试
- `/api/chat/completions`
  - streaming 下发 `agent.status / agent.thinking / agent.tool / message.delta / message.done`
- assistant message 保存后，metadata 中包含结构化 `parts`
- 旧消息仅有 `agentEvents` 时仍可展示

## 验收场景
- 用户发出复杂请求后，消息中先看到“正在分析”
- 触发工具时，看到明确工具卡片和运行状态
- 最终回答与过程展示样式清晰分层
- 任务失败时，消息内直接可继续
- 普通用户无需理解 `checkpoint / memory / planner`

---

## 风险与取舍

## 1. 过早切断旧事件协议
风险：
- 旧前端或旧消息无法展示

策略：
- 过渡期双写
- 前端优先读取新结构，回退旧结构

## 2. 过度追求“思考可见”
风险：
- 变相泄露 chain-of-thought
- UI 变噪音

策略：
- 只展示 `thinking summary`
- 文案统一由服务端控制
- 限制频率与长度

## 3. runtime 拆分过快
风险：
- 一次性大改引入回归

策略：
- 先引入新模块
- 由 `planner-executor` 做 façade
- 分阶段迁移实现而非一次替换

---

## 结论

本轮不是“增强 planner”，而是“缩小 core loop、增强过程展示、把复杂能力移出核心”。

目标形态不是 workflow engine，而是：
- 一个轻量单 Agent
- 一个对用户友好的可见处理轨迹
- 一个更接近 Pi 的最小串行 loop

这更符合 Qiu 当前“极简 Agent 助手”的产品定位，也更有利于后续稳定演进。

---

## References
- [Armin Ronacher: Pi](https://lucumr.pocoo.org/2026/1/31/pi/)
- [`Qiu 极简 Agent 助手系统迭代规划_0310.md`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/docs/plans/Qiu%20极简%20Agent%20助手系统迭代规划_0310.md)
- [`Step5 Agent用户体验增强_0310.md`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/docs/plans/Step5%20Agent用户体验增强_0310.md)
- [`planner-executor.ts`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/lib/agent/planner-executor.ts)
- [`useChat.ts`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/hooks/useChat.ts)
- [`MessageList/index.tsx`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/components/chat/MessageList/index.tsx)
