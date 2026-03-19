# PRD-06 Qiu 能力架构重定义：Prompt Preset / Workflow Template / Tools / MCP_0311

## 文档目标
定义 Qiu 下一阶段的系统能力模型，明确产品层与运行时层如何拆分，并给出统一命名与边界，作为后续研发、信息架构调整和接口重构的依据。

本次重定义的目标不是继续扩充概念，而是减少概念重叠：
- 将现有 `skill` 收缩为 `Prompt Preset` 和 `Workflow Template`
- 将所有有执行能力的能力统一为 `Tools`
- 保留 `MCP` 作为独立概念，但在运行时仅作为 `Tools` 的外部来源
- 统一大模型侧输入，最终只向模型暴露 `prompt context + tools`

## 背景判断
当前 Qiu 已具备以下能力基础：
- 运行时已支持 Agent loop、tool registry、memory、checkpoint、SSE 事件流
- 前端和设置页已存在 `skills / MCP / built-in tools` 相关概念
- MCP 已有 `stdio` 子集实现，并可将远程能力投影为工具

但当前能力层存在三个问题：
- `skill` 既承担提示词、流程、工具边界，又承担“扩展能力”概念，语义过载
- `builtin tools`、`MCP tools`、`skill toolPolicy` 三套机制叠加，用户和研发都难以理解
- MCP 与 tools 关系未被讲清，产品层和运行时层的概念混在一起

## 产品结论
### 结论 1：Qiu 不再以 `skill` 作为统一扩展概念
`skill` 将退出产品主概念，分别沉淀为：
- `Prompt Preset`
- `Workflow Template`

### 结论 2：所有有执行能力的能力统一为 `Tools`
无论来源是内置能力、内部服务能力还是 MCP Server，最终都统一注册为 `Tools`，由模型通过 tool calling 方式使用。

### 结论 3：MCP 独立概念保留
MCP 不并入普通 `tools` 命名，而保留为独立的接入层概念，用于：
- 管理 Server 连接与诊断
- 配置 transport 与认证
- 将 Server 暴露的 MCP tools 注入统一 Tool Registry

### 结论 4：模型最终只消费两类输入
- `Prompt Context`
- `Tools`

## 目标能力模型
### 1. Prompt Preset
Prompt Preset 用于定义角色、语气、领域偏好、输出风格等“提示词能力”。

它的特点是：
- 不直接执行
- 不绑定固定流程
- 不依赖外部文件
- 可多选叠加

典型例子：
- Research Analyst
- Product Copilot
- Writing Assistant
- Concise Reviewer

Prompt Preset 负责回答的问题是：
- “你是谁”
- “你应该怎么说”
- “你优先关注什么”

### 2. Workflow Template
Workflow Template 用于定义一套相对稳定的任务推进流程。

它的特点是：
- 以任务为中心
- 定义阶段和步骤，而不是定义人格
- 可以推荐工具，但不拥有执行权
- 一次会话通常只选择一个主模板

典型例子：
- Web Research
- PRD Draft
- Competitive Analysis
- Document QA
- Meeting Summary

Workflow Template 负责回答的问题是：
- “这个任务应如何推进”
- “建议按什么顺序执行”
- “最后应该输出什么结构”

### 3. Tools
Tools 是系统唯一的执行能力抽象。

它的特点是：
- 有明确输入输出
- 有调用权限边界
- 能被日志、观测、重试、超时、计费、审计统一处理

Tools 的来源包括：
- Built-in Tools
- Internal API Tools
- Third-party Tools
- MCP Tools

典型例子：
- `web.search`
- `web.fetch`
- `files.parse`
- `memory.read`
- `memory.write`
- `kb.search`
- `mcp.figma.get_file`

### 4. MCP
MCP 保留为独立概念，但其职责收敛为“外部工具接入层”。

MCP 的职责：
- 配置和管理 MCP Server
- 支持多 transport 接入
- 完成 initialize、tools/list、tools/call
- 记录连接状态和诊断信息
- 将 MCP tool 转换为统一 ToolDefinition

MCP 不再承担：
- 技能体系
- prompt 体系
- workflow 体系
- 直接面向普通用户的主能力入口

## 运行时分层
### 产品层
- Prompt Presets
- Workflow Templates
- Tools
- MCP Servers

### 运行时层
- Prompt Assembler
- Workflow Runtime Policy
- Tool Registry
- MCP Gateway
- Agent Orchestrator

### 模型层
- system prompt
- messages
- tool definitions

## 核心运行链路
### 1. 用户选择能力
在一次会话中，用户或系统默认配置会提供：
- 一个或多个 Prompt Presets
- 一个 Workflow Template
- 一组可用 Tools
- 若干启用的 MCP Servers

### 2. Prompt Assembler 组装提示词上下文
Prompt Assembler 将以下内容合并为 system prompt：
- Base Agent Prompt
- Prompt Preset fragments
- Workflow Template fragment
- User Preferences
- Tool Use Policy
- Output Constraints

### 3. Tool Registry 统一注册工具
Tool Registry 接收所有工具来源：
- Built-in Tools
- Internal API Tools
- Third-party Tools
- MCP Gateway 导出的 MCP Tools

最终统一形成模型可消费的 tool definitions。

### 4. MCP Gateway 接入外部能力
MCP Gateway 连接 MCP Servers，并只读取和暴露 `tools` 能力：
- initialize
- tools/list
- tools/call

### 5. Agent Orchestrator 调度模型
模型实际收到的输入只有：
- system prompt
- messages
- tools

模型通过 tool calling 发起能力调用，运行时再进行路由执行。

## MCP 接入范围
### 本期必须支持
- `stdio`
- `http`

### 可保留后续扩展
- `sse`
- `ws`

### 本期明确边界
只支持 MCP 的 `tools` 子集，不要求覆盖：
- resources
- prompts
- sampling
- roots

## 统一命名建议
### 产品面向用户
- Prompt Presets：提示预设
- Workflow Templates：工作流模板
- Tools：工具
- MCP Servers：MCP 连接

### 研发与运行时
- PromptPreset
- WorkflowTemplate
- ToolDefinition
- MCPServerConfig
- MCPTransportClient

## 数据模型建议
### PromptPreset
```ts
type PromptPreset = {
  id: string
  name: string
  description: string
  category: 'role' | 'style' | 'domain'
  promptFragment: string
  recommendedToolIds?: string[]
  enabledByDefault?: boolean
  version: string
}
```

### WorkflowTemplate
```ts
type WorkflowTemplate = {
  id: string
  name: string
  description: string
  promptFragment: string
  phases: Array<{
    id: string
    name: string
    instruction: string
    recommendedToolIds?: string[]
  }>
  outputSchema?: {
    format: 'markdown' | 'json' | 'table'
    schema?: Record<string, unknown>
  }
  recommendedPresetIds?: string[]
  recommendedToolIds?: string[]
  version: string
}
```

### ToolDefinition
```ts
type ToolDefinition = {
  id: string
  name: string
  description: string
  source: 'builtin' | 'mcp' | 'internal-api' | 'third-party'
  transport?: 'local' | 'stdio' | 'http' | 'sse' | 'ws'
  inputSchema: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  enabled: boolean
  riskLevel: 'low' | 'medium' | 'high'
}
```

### MCPServerConfig
```ts
type MCPServerConfig = {
  id: string
  name: string
  transport: 'stdio' | 'http' | 'sse' | 'ws'
  endpoint?: string
  command?: string
  args?: string[]
  headers?: Record<string, string>
  env?: Record<string, string>
  enabled: boolean
  timeoutMs?: number
  authMode?: 'none' | 'bearer' | 'header'
}
```

## 用户价值
该重构完成后，Qiu 的产品表达会更清晰：
- 普通用户理解“预设、模板、工具”即可，不需要理解 `skill policy`
- 进阶用户仍可理解和配置 MCP 接入
- 研发侧拥有统一的工具注册和调用模型
- 模型侧只有单一工具面，不再区分内置/MCP/技能工具

## 非目标
本次能力架构重定义不包含：
- 本地 IDE 工作台式 skill runtime
- 社区 skill 包完整兼容
- MCP 全协议能力覆盖
- 多 Agent 编排平台

## 验收标准
- 研发文档和代码命名中不再把 `skill` 作为统一扩展概念
- 产品层可以独立展示 Prompt Presets、Workflow Templates、Tools、MCP Servers
- MCP tool 能以统一 ToolDefinition 注册进入 Tool Registry
- Agent Orchestrator 最终只向模型注入 `prompt context + tools`
- 新架构可以支撑后续从 `stdio` 扩展到 `http` MCP transport

## 结论
Qiu 的能力架构应从“skill 驱动的混合模型”切换到“Prompt Preset / Workflow Template / Tools / MCP”四层清晰分工的模型。

在该模型下：
- Prompt Preset 决定表达与角色
- Workflow Template 决定流程与输出结构
- Tools 决定真实执行能力
- MCP 决定外部能力如何接入并投影为 Tools

这是更适合 Web Agent 产品的长期能力架构。
