# Qiu 能力架构迁移设计：Prompt Preset / Workflow Template / Tools / MCP_0311

## Summary
基于 [`PRD-06_Qiu能力架构重定义_PromptPreset_WorkflowTemplate_Tools_MCP_0311.md`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/docs/prd/PRD-06_Qiu能力架构重定义_PromptPreset_WorkflowTemplate_Tools_MCP_0311.md)，本方案定义从现有 `skill + 内置 tool + MCP` 架构迁移到新能力架构的实施路径。

目标不是一次性推翻现有运行时，而是在保持 Agent 主链路稳定的前提下，逐步完成概念解耦、接口重命名和运行时收敛。

## 当前架构现状
### 已有能力
- `SkillRegistry` 负责加载 builtin/local/custom skills
- `composeSystemPrompt` 将 skill prompt fragments 拼入 system prompt
- `ToolRegistry` 负责注册和执行内置工具
- `MCPClientManager` 已支持 `stdio` 子集，并将 MCP tools 投影为 `AgentTool`
- `AgentRuntime` 以统一 tool calling 模式调度工具

### 当前问题
- `skill` 同时承担角色预设、流程模板、工具策略、memory/failure policy 等职责
- `builtin tools` 和 `MCP tools` 在实现上接近，但在产品和配置层是两套概念
- MCP 目前只有 `stdio` transport，且 manager 直接向 Agent 暴露工具，缺少独立 gateway 层
- 设置页、运行时、类型层使用了大量 `skill` 命名，后续重构成本会继续上升

## 迁移原则
### 原则 1：先改概念，再改运行时
先完成命名和数据模型重构，再逐步下沉到执行层，避免一次性改动过大。

### 原则 2：模型注入面保持稳定
无论内部如何迁移，模型最终仍保持：
- 一份 system prompt
- 一组 tool definitions

### 原则 3：MCP 保持独立，但工具面统一
MCP 是独立的连接与治理概念；MCP 导出的能力必须统一注入 Tool Registry。

### 原则 4：旧 skill 先兼容，后下线
迁移过程中保留旧 skill 字段和旧加载逻辑，提供兼容层，避免已有用户配置立即失效。

## 目标模块拆分
### PromptPresetRegistry
职责：
- 管理 builtin/local/custom prompt presets
- 提供按 ID 选择和枚举能力

### WorkflowTemplateRegistry
职责：
- 管理内置 workflow templates
- 输出模板级 prompt fragment、阶段定义和推荐工具

### PromptAssembler
职责：
- 合并 base prompt、prompt presets、workflow template、用户偏好、输出约束

### ToolRegistry
职责：
- 统一注册 builtin、internal、third-party、mcp tools
- 提供统一 tool definitions
- 统一执行、超时、重试、审计入口

### MCPGateway
职责：
- 管理 MCP server 配置、连接和诊断
- 根据 transport 选择具体 client
- 读取 tools/list
- 路由 tools/call

## 分阶段迁移方案
### Phase 1：概念重命名与兼容层
目标：
- 对外产品概念切换到 Prompt Presets / Workflow Templates / Tools / MCP
- 内部保留旧 skill 兼容层，不立即删除旧代码

实施项：
- 新增 `PromptPreset` 类型和 `WorkflowTemplate` 类型
- 将现有 builtin skills 先映射为 Prompt Presets
- 将流程导向型 skill 先映射为 Workflow Templates
- 在设置页展示层改名：
  - `skills` -> `Prompt Presets`
  - 新增 `Workflow Templates`
- 保留旧字段 `enabledSkillIds`，但新增兼容映射逻辑

产出：
- 类型兼容层
- 新的设置页文案
- 旧数据可继续运行

### Phase 2：Prompt 体系解耦
目标：
- 将 skill prompt 与 workflow prompt 拆开
- 不再由 `SkillRegistry` 直接主导完整 system prompt 组装

实施项：
- 新增 `PromptAssembler`
- 将 `composeSystemPrompt` 重构为：
  - `composeBasePrompt`
  - `composePresetPromptFragments`
  - `composeWorkflowPrompt`
  - `composePreferencePrompt`
- 将旧 `skill.promptFragment` 迁移到：
  - Prompt Preset 的 `promptFragment`
  - Workflow Template 的 `promptFragment`

产出：
- Prompt Assembler 模块
- 更清晰的 prompt 注入链路

### Phase 3：Tool 统一注册
目标：
- 统一工具抽象
- 内置工具和 MCP 工具都经由同一个 Tool Registry 注册

实施项：
- 将 `AgentTool` 重命名或别名为 `ToolRuntimeDefinition`
- 明确 ToolDefinition 与 ToolExecutor 的边界
- 将 MCP manager 直接生成工具的逻辑迁移到 `MCPGateway -> Tool Registry`
- 补齐 tool 元数据：
  - `source`
  - `transport`
  - `riskLevel`
  - `enabled`

产出：
- 统一 Tool Registry
- 工具元数据模型

### Phase 4：MCP Gateway 化
目标：
- 保留 MCP 独立概念
- 支持多 transport
- 只接 MCP tools 子集

实施项：
- 抽象 `MCPTransportClient` 接口
- 保留 `MCPStdioClient`
- 新增 `MCPHttpClient`
- 预留 `MCPSseClient` / `MCPWsClient`
- 将 `MCPClientManager` 重构为：
  - `MCPGateway`
  - `MCPServerRegistry`
  - `MCPDiagnosticsStore`

HTTP 最小接入范围：
- initialize
- tools/list
- tools/call

产出：
- transport 抽象
- HTTP MCP 接入
- MCP 诊断能力升级

### Phase 5：旧 skill policy 下线
目标：
- 移除 `skill` 作为统一能力模型
- 将策略字段迁移到 workflow 和 runtime policy

实施项：
- 下线 `toolPolicy`
- 下线 `memoryPolicy`
- 下线 `failurePolicy`
- 将其迁移到：
  - Workflow runtime policy
  - Agent default policy
  - Tool permission policy

产出：
- 旧 skill 模型收缩完成
- 运行时职责更清晰

## 数据迁移设计
### 现有字段映射
#### skill -> PromptPreset
- `id` -> `id`
- `displayName` -> `name`
- `description` -> `description`
- `promptFragment` -> `promptFragment`
- `defaultAllowedTools` -> `recommendedToolIds`

#### skill -> WorkflowTemplate
仅对流程导向型 skill 做迁移：
- `id` -> `id`
- `displayName` -> `name`
- `description` -> `description`
- `promptFragment` -> `promptFragment`
- `defaultAllowedTools` -> `recommendedToolIds`

#### customSkills
当前用户自定义 `SKILL.md` 文本：
- 短期兼容为 `PromptPreset`
- 不自动推断为 Workflow Template
- 后续可允许用户手动切换类型

### 设置项迁移
现有：
- `enabledSkillIds`
- `customSkills`

目标：
- `enabledPromptPresetIds`
- `selectedWorkflowTemplateId`
- `customPromptPresets`

兼容策略：
- 读取时优先新字段
- 若新字段不存在，则回退旧字段映射
- 保存时可灰度双写，待稳定后停写旧字段

## 代码重构建议
### 建议新增目录
```txt
src/lib/agent/presets/
src/lib/agent/workflows/
src/lib/agent/tools/
src/lib/agent/mcp/
src/lib/agent/prompt/
```

### 建议模块
```txt
src/lib/agent/presets/registry.ts
src/lib/agent/workflows/registry.ts
src/lib/agent/prompt/assembler.ts
src/lib/agent/tools/registry.ts
src/lib/agent/mcp/gateway.ts
src/lib/agent/mcp/transports/stdio.ts
src/lib/agent/mcp/transports/http.ts
```

## 接口调整建议
### Chat 请求
现有 `agent.skillIds` 应迁移为：
```ts
agent: {
  promptPresetIds?: string[]
  workflowTemplateId?: string
  allowedToolIds?: string[]
  allowMcp?: boolean
}
```

### 设置接口
现有用户设置应新增：
```ts
enabledPromptPresetIds: string[]
selectedWorkflowTemplateId?: string
customPromptPresets: UserDefinedPromptPreset[]
mcpServers: MCPServerConfig[]
```

## 风险与应对
### 风险 1：旧用户 skill 配置失效
应对：
- 提供兼容层
- 旧数据双读双写一段时间
- 在设置页显示迁移提示

### 风险 2：MCP HTTP 接入复杂度高于预期
应对：
- 第一版只支持最小工具子集
- 不强求兼容 resources/prompts
- 先面向少量已知 Server 验证

### 风险 3：Prompt Preset 与 Workflow Template 边界模糊
应对：
- UI 中明确两类能力定义
- 对内限制：Preset 可多选，Workflow 单次主选一个

### 风险 4：运行时重构影响现有 Agent 稳定性
应对：
- 保持模型注入面不变
- 逐模块替换
- 每个阶段都补充回归测试

## 验收标准
### Phase 1 完成标准
- 设置页可展示 Prompt Presets / Workflow Templates / Tools / MCP
- 旧 skill 配置继续可用

### Phase 2 完成标准
- Prompt Assembler 独立存在
- system prompt 组装不再依赖旧 `composeSystemPrompt` 单点逻辑

### Phase 3 完成标准
- Built-in 与 MCP tools 统一注册为 ToolDefinition
- Agent Runtime 只依赖统一 Tool Registry

### Phase 4 完成标准
- MCP 支持 `stdio` 与 `http`
- MCP 只暴露 tools 子集
- MCP 状态与诊断可独立展示

### Phase 5 完成标准
- `skill` 不再是主能力概念
- 旧 `toolPolicy / memoryPolicy / failurePolicy` 已迁移或下线

## 推荐研发顺序
1. Phase 1：概念重命名与兼容层
2. Phase 2：Prompt 体系解耦
3. Phase 3：Tool 统一注册
4. Phase 4：MCP Gateway 化与 HTTP 接入
5. Phase 5：旧 skill policy 下线

## 结论
本次迁移不应被理解为“重写 Agent 系统”，而应被理解为：
- 对产品概念做减法
- 对运行时分层做收敛
- 对 MCP 做独立治理
- 对模型侧输入做统一

迁移完成后，Qiu 的能力体系将更适合长期演进：
- Prompt Presets 负责表达
- Workflow Templates 负责流程
- Tools 负责执行
- MCP 负责外部工具接入
