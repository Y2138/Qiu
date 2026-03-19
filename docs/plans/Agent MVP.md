## QiuChat Agent 平台 MVP 计划（Tool Call + Skills + MCP + 规划 + 系统提示词）

### Summary
- 基于现状（`/api/chat/completions` + 适配器 + SSE 文本流）做增量改造，不推翻当前架构。
- 首版按你确认的范围落地：`MVP`、`MCP 仅 stdio`。
- 目标是把“聊天补全”升级为“可规划执行的 Agent 回合”：模型可发起工具调用、执行技能、调用 MCP 工具、回写观察结果并产出最终答复。

### Implementation Changes
- Agent 核心层（新增 `src/lib/agent/*`）
  - 定义统一契约：`AgentTool`、`AgentSkill`、`PlanStep`、`AgentRunContext`、`AgentEvent`。
  - 实现 `PlannerExecutor`（单 Agent、串行步骤、有限循环）：`plan -> act(tool/skill/mcp) -> observe -> final`。
  - 增加安全护栏：最大步骤数、单工具超时、参数 schema 校验、工具 allowlist。
- LLM 适配器升级（保留现有注册机制）
  - 扩展适配器输入/输出协议，支持 tool definitions、tool call 结果回注、structured agent events。
  - OpenAI 适配器接入 function/tool calling；Anthropic 适配器接入 tool_use/tool_result。
  - 向后兼容：无工具场景仍走现有纯文本流。
- Skills 能力（MVP 版）
  - 技能定义为服务端注册单元（`id`、`intent`、`prompt片段`、`allowedTools`、`inputSchema`）。
  - 在每次运行前由技能组装系统提示词（base system prompt + skill prompt + 运行约束）。
  - 首批内置技能建议：`general-assistant`、`research-lite`、`code-helper-lite`（只做提示词和可用工具边界，不做多 Agent）。
- MCP（stdio）接入
  - 新增 MCP Client Manager：按 server 配置拉起/复用 stdio 进程，发现并注册 MCP tools 到 ToolRegistry。
  - MCP 工具统一映射到 `AgentTool` 接口，和本地工具走同一执行通道。
  - 首版只支持服务端静态配置与环境变量注入，不做用户侧可视化配置台。
- Chat API 与流式协议升级（重点改造 [`route.ts`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/src/app/api/chat/completions/route.ts)）
  - 请求体新增 `agent` 配置（是否启用 agent、选用 skill、是否允许 mcp）。
  - SSE 事件从“仅 content chunk”升级为事件流：`token`、`plan_step`、`tool_call`、`tool_result`、`final`、`error`。
  - 前端流解析与消息渲染支持事件类型；最小 UI：展示“规划步骤 + 工具执行状态 + 最终回答”。
- 数据与审计（最小持久化）
  - 复用 Message.metadata 持久化 agent run 摘要（steps、tools、errors、latency），避免首版引入复杂新表。
  - 仅在需要追踪失败重放时新增 `AgentRun`/`AgentStep` 表（作为可选增强，不阻塞 MVP）。

### Public Interfaces / Type Changes
- `ChatCompletionInput` 增加 `agent` 字段（如 `enabled`, `skillIds`, `allowMcp`, `maxSteps`）。
- `StreamChunk` 改为事件包结构（`type` + `payload`），并保留文本 token 的兼容路径。
- `BaseLLMAdapter` 扩展 tool-capable 方法签名（保留旧方法默认实现或兼容分支）。

### Test Plan
- 单元测试
  - PlannerExecutor：步骤上限、工具失败重试策略、终止条件。
  - ToolRegistry：参数校验、超时、allowlist 拒绝。
  - 适配器：OpenAI/Anthropic 的 tool call 解析与回注。
- 集成测试
  - `/api/chat/completions` 在 `agent.enabled=false/true` 两种模式都可工作。
  - 本地工具 + MCP 工具混合调用，事件顺序正确（plan/tool/result/final）。
  - 非法工具参数、工具超时、MCP 断连时返回可恢复错误并结束回合。
- 验收场景
  - 用户提问触发“先规划再执行工具再回答”。
  - 指定 skill 后系统提示词行为变化可观察（输出风格和工具选择受限）。
  - 前端可看到至少一条规划步骤和一次工具执行记录。

### Assumptions
- 首版不做多 Agent 协作、不做长期记忆、不做可视化工作流编辑器。
- MCP 仅 `stdio`，不覆盖 HTTP/SSE/WS。
- Skills 先做“服务端注册 + 提示词编排 + 工具权限边界”，不开放用户自定义上传。
- 保留现有模型 API Key 机制与 AdapterRegistry，不引入外部 Agent SDK。
