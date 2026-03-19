# 单 Agent 对话流重构完成总结_0317

本文档总结 `refactor-single-agent-conversation-loop` 这一轮重构已经完成的工作、当前代码落点、验证结果，以及对产品链路带来的直接变化。

## 结论

本轮单 Agent 对话流重构已经完成主路径与 runtime 内核收尾，当前系统已经从“旁路 Agent 面板 + 厚 runtime orchestrator”切换到“消息内嵌过程展示 + 最小串行 loop”。

当前落地结果可以概括为 4 点：

- assistant 消息已经支持 `parts` 结构，可同时承载 `Agent Trace` 与最终回答
- SSE 已同时输出产品导向事件和旧协议兼容事件，前后端都能稳定消费
- runtime 已拆成更清晰的边界，`planner-executor` 不再同时承担 context、checkpoint、summary 全部职责
- checkpoint、持久化、恢复派生和历史兼容链路已经重新验证通过

## 本次完成的核心改动

### 1. assistant 消息升级为结构化过程消息

本轮把 assistant 消息从“正文 + metadata.agentEvents”提升为“过程部件 + 最终正文”的一等模型。

当前落地点包括：

- [`chat.ts`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/types/chat.ts)
- [`message-parts.ts`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/lib/agent/message-parts.ts)
- [`useChat.ts`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/hooks/useChat.ts)
- [`MessageList/index.tsx`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/components/chat/MessageList/index.tsx)
- [`AgentTrace`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/components/chat/AgentTrace/index.tsx)

结果是：

- 用户在一条 assistant 消息内就能看到“过程展示 + 最终回答”
- 前端不再依赖把一串底层事件二次归纳成状态卡片
- 历史消息仍可通过旧 `agentEvents` 回退逻辑正常显示

### 2. SSE 协议收敛为产品层事件

聊天流式接口现在会输出更适合产品直接消费的事件：

- `agent.status`
- `agent.thinking`
- `agent.tool`
- `agent.checkpoint`
- `message.delta`
- `message.done`
- `error`

相关核心代码：

- [`route.ts`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/app/api/chat/completions/route.ts)
- [`stream.ts`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/services/stream.ts)
- [`trace-mapper.ts`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/lib/agent/trace-mapper.ts)

同时保留了旧 `token/final` 输出，因此迁移期不会打断旧消费路径。

### 3. runtime 内核收敛为最小单 Agent loop

这是这轮收尾里最关键的部分。

之前的 [`planner-executor.ts`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/lib/agent/planner-executor.ts) 同时承担：

- loop 驱动
- context budget
- rolling summary
- compaction
- checkpoint 创建
- run summary 组装

现在已经拆分为更清晰的结构：

- [`planner-executor.ts`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/lib/agent/planner-executor.ts)
  - 只保留最小串行 loop：准备一轮、请求模型、执行工具、结束判断
- [`context-manager.ts`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/lib/agent/context-manager.ts)
  - 负责 context budget、bounded window、rolling summary、compaction
- [`checkpoint-manager.ts`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/lib/agent/checkpoint-manager.ts)
  - 负责 resumable checkpoint 创建
- [`run-summary.ts`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/lib/agent/run-summary.ts)
  - 负责最终 summary 组装

这一层的直接收益是：

- core loop 职责明显变窄
- context / summary / checkpoint 逻辑从 loop 中剥离
- 恢复运行不再被历史 `checkpoint.steps` 错误吞掉新的 loop 配额
- `PlanStep[]` 保留兼容字段，但不再驱动核心运行配额

### 4. checkpoint 与恢复链路重新收口

当前 checkpoint 策略已经符合设计目标：

- `completed` 默认不会再落完整 resumable checkpoint
- `paused / failed / interrupted` 场景会生成 resumable checkpoint
- 顶部“继续处理”入口和消息内恢复按钮都从新 metadata 稳定派生
- 历史 completed checkpoint、历史 summary、历史 run 记录保持兼容读取

相关代码包括：

- [`persistence.ts`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/lib/agent/persistence.ts)
- [`view-model.ts`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/lib/agent/view-model.ts)

## 用户可见变化

从用户视角，这轮重构后的体验变化主要是：

### 1. 过程展示回到消息内部

现在默认是在 assistant 消息正文前展示过程轨迹，而不是让用户先去理解单独的 `Agent Run Panel`。

### 2. 过程与最终回答可以同时存在

流式生成过程中，用户可以同时看到：

- 系统正在做什么
- 工具执行到了哪一步
- 最终回答已经生成了哪些内容

### 3. 恢复动作更像用户语义

暂停或失败后，界面显示的是“继续处理”，而不是把 checkpoint、run 这些底层概念暴露给普通用户。

## 验证结果

本轮完成后重新执行了 runtime 与聊天链路相关验证：

```bash
pnpm --dir /Users/staff/Documents/agent-workspace/fullstack/next/QiuChat run test:agent
pnpm --dir /Users/staff/Documents/agent-workspace/fullstack/next/QiuChat run type-check
```

结果：

- `test:agent` 通过
- `type-check` 通过

本轮还新增或补强了以下测试关注点：

- [`context-manager.test.ts`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/lib/agent/__tests__/context-manager.test.ts)
  - 验证 context manager 独立承担 bounded context、summary refresh、compaction
- [`planner-executor.test.ts`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/lib/agent/__tests__/planner-executor.test.ts)
  - 新增恢复运行不受 legacy checkpoint `steps` 影响的回归测试

## 当前代码落点

如果后续继续沿这条链路演进，最值得关注的文件是：

- [`planner-executor.ts`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/lib/agent/planner-executor.ts)
- [`context-manager.ts`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/lib/agent/context-manager.ts)
- [`checkpoint-manager.ts`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/lib/agent/checkpoint-manager.ts)
- [`run-summary.ts`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/lib/agent/run-summary.ts)
- [`route.ts`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/app/api/chat/completions/route.ts)
- [`useChat.ts`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/hooks/useChat.ts)
- [`MessageList/index.tsx`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/components/chat/MessageList/index.tsx)

## 对当前阶段的判断

这轮重构完成后，`Qiu` 的单 Agent 聊天主链路已经基本达到设计稿里希望的状态：

- 对用户来说，过程展示是第一等体验
- 对前端来说，消息模型与 SSE 协议已经收敛
- 对 runtime 来说，core loop 已经变得更轻

后续如果继续演进，更自然的方向会是：

- 继续弱化旧兼容事件和旧 metadata 读写
- 进一步减少 `PlanStep[]` 在兼容层中的存在感
- 让 debug-only 视图与主产品视图彻底解耦
