# QiuChat 技术解析：面向 Agent 开发者的架构与模式指南

> 本文面向有 TypeScript 基础和 LLM 调用经验的开发者，介绍 QiuChat 项目使用的 Agent 设计模式与架构思路。

## 1. 什么是 Agent？先聊聊基础

### 1.1 Agent vs 普通 LLM 调用

普通 LLM 调用：
```
User → LLM → Response
```

Agent：
```
User → LLM → Action → Observation → LLM → Action → ... → Final Response
```

**核心区别**：Agent 具有「行动能力」，能够通过调用工具与环境交互，形成**思考-行动-观察**的循环。

### 1.2 Agent 的核心要素

| 要素 | 描述 |
|------|------|
| **感知 (Perception)** | 理解用户输入、上下文、工具返回结果 |
| **规划 (Planning)** | 分解任务、决定下一步行动 |
| **行动 (Acting)** | 调用工具、执行操作 |
| **记忆 (Memory)** | 保存会话历史、跨会话知识 |

### 1.3 基础模型

```
┌─────────────────────────────────────────────┐
│                   Agent                     │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐   │
│  │Perceive │→ │  Plan   │→ │  Act    │   │
│  └─────────┘  └─────────┘  └─────────┘   │
│       ↑                        ↓           │
│       └────────────────────────┘           │
│              (Observation)                 │
└─────────────────────────────────────────────┘
```

---

## 2. 主流 Agent 设计模式

### 2.1 ReAct (Reasoning + Acting)

**核心思想**：LLM 在每次响应中同时输出「思考过程」和「行动指令」。

```
Thought: 我需要先了解天气...
Action: search_weather(location=北京)
Observation: 北京今天晴，25度
Thought: 天气不错，可以建议用户出门
Action: suggest_outdoor_activity
```

**特点**：
- 思考过程显式化，便于调试
- 行动和推理紧耦合
- 适合单步工具调用场景

### 2.2 Plan-Execute (规划与执行分离)

**核心思想**：将「规划」和「执行」解耦，由不同模块或不同阶段处理。

```
Planner: 分析任务 → 生成执行计划（多个步骤）
         ↓
Executor: 按顺序执行每个步骤 → 收集结果
         ↓
Planner: 汇总结果 → 返回最终响应
```

**特点**：
- 规划结果可审计、可修改
- 适合复杂多步骤任务
- 支持执行中途干预

### 2.3 模式对比

| 维度 | ReAct | Plan-Execute |
|------|-------|--------------|
| 响应速度 | 快 | 慢（需先规划） |
| 复杂任务 | 一般 | 强 |
| 可控性 | 一般 | 高 |
| 适用场景 | 简单问答、单一工具 | 复杂工作流、多步骤任务 |

---

## 3. QiuChat 架构概览

### 3.1 整体架构

```
┌──────────────────────────────────────────────────────────────────┐
│                         Frontend (Next.js)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │ ChatContainer│  │ MessageList  │  │ MessageInput │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
└────────────────────────────┬─────────────────────────────────────┘
                             │ HTTP / SSE
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                      Backend (API Routes)                          │
│  ┌──────────────────────────────────────────────────────────┐     │
│  │              /api/chat/completions                       │     │
│  │                   ↓                                       │     │
│  │  ┌─────────────────────────────────────────────────────┐│     │
│  │  │              Prompt Assembler                        ││     │
│  │  │  (分层系统提示 + 上下文管理 + Token 预算)            ││     │
│  │  └─────────────────────────────────────────────────────┘│     │
│  │                   ↓                                       │     │
│  │  ┌─────────────────────────────────────────────────────┐│     │
│  │  │            Agent Runtime (Planner-Executor)         ││     │
│  │  │  ┌─────────┐  ┌─────────┐  ┌─────────────────────┐ ││     │
│  │  │  │Planner │→ │Executor │→ │ Tool Registry (MCP) │ ││     │
│  │  │  └─────────┘  └─────────┘  └─────────────────────┘ ││     │
│  │  └─────────────────────────────────────────────────────┘│     │
│  └──────────────────────────────────────────────────────────┘     │
│                              ↓                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │
│  │  PostgreSQL  │  │    Redis     │  │   LLM APIs  │            │
│  │  (Prisma)   │  │  (Cache)     │  │(OpenAI/Anth)│            │
│  └──────────────┘  └──────────────┘  └──────────────┘            │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 核心组件职责

| 组件 | 职责 |
|------|------|
| `ChatContainer` | 聊天界面容器，管理消息列表和输入 |
| `Prompt Assembler` | 组装分层系统提示，管理 Token 预算 |
| `Agent Runtime` | 执行 Agent Loop，管理检查点 |
| `Tool Registry` | 注册和调用工具，包括 MCP 外部工具 |
| `LLM Adapters` | 适配不同 LLM 提供商（OpenAI、Anthropic） |

---

## 4. QiuChat Agent 运行时详解

### 4.1 核心流程

QiuChat 采用 **Plan-Execute 模式**，核心流程：

```
用户消息
    ↓
┌─────────────────────────────────────────────────────┐
│                 Agent Runtime                       │
│                                                      │
│  1. [Plan] Planner 分析任务，生成执行计划          │
│         ↓                                           │
│  2. [Execute] Executor 按计划执行每个步骤          │
│         ↓                                           │
│  3. [Observe] 收集工具返回结果                      │
│         ↓                                           │
│  4. [Decide] 判断：继续执行 / 完成任务             │
│         ↓                                           │
│  5. [Checkpoint] 保存执行状态（可选）              │
│         ↓                                           │
│  6. 循环直到完成                                    │
└─────────────────────────────────────────────────────┘
    ↓
流式响应 → 前端显示
```

### 4.2 Planner-Executor 实现

关键代码结构：

```typescript
// Agent Runtime 核心循环
class AgentRuntime {
  async runRound(context: AgentRunContext) {
    // 1. 构建上下文（消息 + 记忆 + 工具）
    const enrichedContext = await this.contextBuilder.build(context);

    // 2. 调用 LLM，获取响应
    const response = await this.llm.complete(enrichedContext.messages, {
      tools: this.toolRegistry.getToolDefinitions(),
    });

    // 3. 处理响应
    if (response.toolCalls) {
      // 3a. 执行工具调用
      const results = await this.executeTools(response.toolCalls);
      // 3b. 将结果注入上下文，触发下一轮
      return { continue: true, results };
    } else {
      // 3c. 无工具调用，任务完成
      return { continue: false, content: response.content };
    }
  }
}
```

### 4.3 检查点机制

```
┌─────────────┐    中断    ┌─────────────┐
│  执行中...  │ ────────→ │  检查点保存  │
│  Step 3/5   │           │  (状态快照)  │
└─────────────┘           └─────────────┘
                                   │
                                   │ 恢复
                                   ▼
                            ┌─────────────┐
                            │  从 Step 3  │
                            │   继续执行   │
                            └─────────────┘
```

**适用场景**：
- 长任务执行中用户关闭页面
- 需要人工审核的关键步骤
- API 调用超时重试

---

## 5. 关键设计决策

### 5.1 上下文管理策略

**问题**：LLM 有 Token 限制，不能无限输入历史。

**方案**：分层 Token 预算 + 动态压缩

```
┌────────────────────────────────────────────────┐
│              Token 预算分配                      │
├────────────────────────────────────────────────┤
│ System Prompt          │  ████████  (固定)     │
│ Memory Context         │  ████      (重要)     │
│ Recent Messages        │  █████████ (核心)     │
│ Attachment Summary     │  ██        (可变)      │
│ Tools Description      │  ████      (必需)     │
├────────────────────────────────────────────────┤
│ 预算超限 → 压缩早期消息 / 生成摘要              │
└────────────────────────────────────────────────┘
```

**关键设计**：
1. 客户端发送完整历史，服务端负责裁剪
2. 超出预算时优先保留最近消息
3. 长期记忆存储在数据库，需要时注入

### 5.2 工具系统设计

**架构**：

```
┌─────────────────────────────────────┐
│         Tool Registry               │
├─────────────┬───────────────────────┤
│ Built-in    │     MCP Tools        │
│ Tools       │     (外部协议)        │
├─────────────┼───────────────────────┤
│ file_read   │  → stdio/http        │
│ web_search  │  → MCP Gateway        │
│ code_exec   │  → 第三方服务        │
└─────────────┴───────────────────────┘
```

**统一接口**：

```typescript
interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: object; // JSON Schema
}

interface ToolResult {
  toolCallId: string;
  name: string;
  output: string;
  success: boolean;
}
```

### 5.3 MCP (Model Context Protocol) 集成

MCP 是一种标准协议，允许 Agent 连接外部数据源和工具：

- **stdio 传输**：本地进程通信
- **HTTP 传输**：远程服务调用

QiuChat 通过 `MCP Gateway` 统一管理外部工具接入。

---

## 6. 总结与启发

### 6.1 QiuChat 设计模式总结

| 模式 | 应用位置 |
|------|---------|
| Plan-Execute | Agent Runtime 核心循环 |
| ReAct | 单步工具调用响应处理 |
| Checkpoint | 长任务中断恢复 |
| Token Budget | 上下文管理 |

### 6.2 开发 Agent 应用的思考框架

1. **明确 Agent 边界**：Agent 能做什么、不能做什么？
2. **选择合适的模式**：
   - 简单任务 → ReAct
   - 复杂工作流 → Plan-Execute
3. **设计工具接口**：工具定义要清晰，错误处理要完善
4. **管理上下文**：Token 预算是硬限制，早做规划
5. **考虑恢复机制**：长任务需要检查点，优雅处理中断

### 6.3 进一步学习

- [LangChain Agent 文档](https://python.langchain.com/docs/concepts/agents)
- [Anthropic Tool Use 指南](https://docs.anthropic.com/claude/docs/tool-use)
- [MCP 协议规范](https://modelcontextprotocol.io)

---

*本文档由 Claude Code 协助编写，基于 QiuChat 项目源码分析。*
