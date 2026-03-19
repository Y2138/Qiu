# Qiu

Qiu 是一个基于 Next.js App Router 的全栈 AI Agent 助手项目。当前实现已经完成能力架构主链路迁移，产品与运行时以 `Prompt Presets / Workflow Templates / Tools / MCP` 为核心模型。

当前版本的重点不只是“能跑 Agent”，而是把模型上下文构建正式升级成了一层可设计、可观测、可验证的运行时架构：prompt 分层、bounded message window、rolling summary、attachment summary layer、token budget、context diagnostics 都已经进入主链路。

在此基础上，单 Agent 对话流也已经完成一轮产品化重构：assistant 消息现在支持结构化 `parts`，消息内会直接展示 `Agent Trace + Final Answer`，SSE 协议已收敛为产品导向事件，runtime 也已经拆成更接近 Pi 风格的最小串行 loop。

## 当前能力

### 核心体验
- 极简聊天页，首页进入 `/chat`
- 流式 AI 对话
- 会话创建、切换、删除
- 模型切换与多 Provider API Key 管理

### Agent 能力架构
- `Prompt Presets`：定义角色、语气、领域偏好和输出风格
- `Workflow Templates`：定义任务推进方式、阶段提示和推荐工具
- `Tools`：统一封装本地工具与 MCP 工具
- `MCP`：独立的服务接入与诊断层，当前支持 `stdio` 与 `http`
- `Prompt Assembler`：统一组装 base prompt、preset、workflow 与用户偏好
- 单 Agent runtime，使用最小串行 loop 驱动 `request model -> execute tools -> continue/stop`
- Agent Run / Checkpoint / Memory 独立数据模型
- 中断后从 checkpoint 继续执行
- 会话记忆与用户长期记忆
- assistant 消息内嵌 `Agent Trace`，可同时显示过程展示与最终回答
- SSE 输出 `agent.status / agent.thinking / agent.tool / agent.checkpoint / message.delta / message.done`

### 上下文组织（Attention 优化）
- system prompt 按 `Core Invariants / Task Policy / Memory Context / Preference Layer / Preset Hints` 分层
- Agent runtime 默认使用有限窗口，不再在无 summary 时退回全量历史
- session summary 以 rolling 模式维护，并随 checkpoint 一起保存/恢复
- 附件以独立 `Attachment context layer` 摘要注入，而不是默认并入 user 正文
- runtime 采用近似 token budget，对 system、memory、recent messages、attachments、tool schema 分层预算
- context budget、summary、compaction 已从 core loop 中拆出独立 manager
- Agent 详情面板可查看内部 `contextDiagnostics`，用于排查本轮上下文为何这样构建

### 入口一致性
- 普通发送、继续处理、重新生成都通过同一套消息历史构建规则进入后端
- 前端继续发送完整会话，后端统一负责 bounded context 裁剪
- regenerate 会显式带上 `requestMode`，避免重复保存 user message
- 顶部“继续处理”和消息内恢复按钮都从最新 assistant metadata 派生

### 设置页能力
- Agent 偏好：
  - 语气
  - 回复密度
  - 工作方式（先规划 / 直接执行）
  - 自动记忆开关
  - 自定义角色提示词 markdown
- Prompt Presets 选择
- Workflow Template 选择
- 自定义 Prompt Preset 草稿
- 外观、API Keys、安全设置

### 文件能力
- 聊天输入区支持上传文件
- 当前支持：
  - `txt`
  - `md`
  - `pdf`
- 上传后可提取文本并注入对话上下文

## 实现状态

已完成：
- `PromptPresetRegistry`
- `WorkflowTemplateRegistry`
- `assembleSystemPrompt`
- `ToolRegistry`
- `MCPGateway`
- MCP `stdio` / `http` transport
- `/api/chat/agent-config` 返回 presets / workflows / tools
- 会话与 checkpoint 持久化保存 `promptPresetIds`
- 分层 prompt + bounded context 主链路
- rolling summary / attachment summary / context diagnostics
- regenerate 入口与消息落库去重
- 单 Agent 对话流内嵌过程展示
- 单一产品 SSE 事件协议（`agent.* / message.delta / message.done`）
- runtime 最小 loop + `context-manager / checkpoint-manager / run-summary` 边界拆分
- 恢复运行不再受 legacy checkpoint `steps` 配额影响

已移除的废弃入口：
- `SkillRegistry`
- `composeSystemPrompt` 旧入口
- `MCPClientManager` 旧别名入口

## 技术栈

- 前端：Next.js 16、React 19、TypeScript
- 后端：Next.js Route Handlers
- 数据库：PostgreSQL + Prisma
- 缓存 / 限流：Redis + ioredis
- 样式：Tailwind CSS 4
- 状态管理：Zustand
- Markdown：react-markdown + remark-gfm

## 快速开始

### 前置要求

- Node.js 20+
- pnpm
- PostgreSQL 14+
- Redis 7+

### 安装依赖

```bash
pnpm install
```

### 初始化数据库

```bash
pnpm prisma generate
pnpm prisma db push
```

### 配置环境变量

复制 `.env.example` 到 `.env.local`，至少配置以下变量：

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000/api
DATABASE_URL=postgresql://user:password@localhost:5432/qiuchat?schema=public
REDIS_URL=redis://:redis123@localhost:6379
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d
ENCRYPTION_KEY=replace-with-64-char-hex-key
MCP_SERVERS_JSON=
AGENT_DIAGNOSTICS_TOKEN=
```

说明：
- `ENCRYPTION_KEY` 用于加密用户保存的 API Key
- `MCP_SERVERS_JSON` 用于配置 MCP Servers
- `AGENT_DIAGNOSTICS_TOKEN` 用于 MCP 诊断接口

### 启动开发环境

```bash
pnpm dev
```

默认访问 [http://localhost:3000](http://localhost:3000)，应用会重定向到 `/chat`。

### 最小上线说明

当前版本建议直接按“已有账号可登录、关闭公开注册”的方式上线：

- 登录页已不再显示注册入口
- `/register` 会重定向回 `/login`
- `POST /api/auth/register` 会直接返回 `403`

如果你要最小可用上线，只需要确认已经在数据库里存在可登录的账号。

### 最小部署步骤

1. 准备 PostgreSQL 和 Redis，并填写好生产环境变量。
2. 在项目目录安装依赖：`pnpm install`
3. 执行 Prisma 迁移：`pnpm prisma migrate deploy`
4. 构建项目：`pnpm build`
5. 启动服务：`pnpm start`

### 生产环境变量

最小可用部署至少需要这些变量：

```env
NEXT_PUBLIC_API_BASE_URL=https://your-domain.com/api
DATABASE_URL=postgresql://user:password@host:5432/qiuchat?schema=public
REDIS_URL=redis://:password@host:6379
JWT_SECRET=replace-with-a-long-random-secret
JWT_EXPIRES_IN=7d
ENCRYPTION_KEY=replace-with-64-char-hex-key
MCP_SERVERS_JSON=
AGENT_DIAGNOSTICS_TOKEN=
```

说明：
- `NEXT_PUBLIC_API_BASE_URL` 改成你的正式域名
- `JWT_SECRET` 需要替换成随机长字符串
- `ENCRYPTION_KEY` 需要替换成 64 位十六进制字符串
- 首次上线前请先手动准备开发者账号，线上不再开放注册

## 常用脚本

```bash
pnpm dev
pnpm build
pnpm start
pnpm lint
pnpm type-check
pnpm test:agent
pnpm check:agent
pnpm mcp:observability-check
```

## 项目结构

```text
QiuChat/
├── prisma/
│   └── schema.prisma
├── src/
│   ├── app/
│   │   ├── api/                  # Route Handlers
│   │   ├── chat/                 # 聊天页
│   │   ├── login/
│   │   ├── register/
│   │   └── settings/             # 设置页：偏好 / 预设 / 工作流 / MCP
│   ├── components/
│   │   └── chat/
│   ├── hooks/
│   ├── lib/
│   │   ├── agent/
│   │   │   ├── presets/          # Prompt Preset registry
│   │   │   ├── workflows/        # Workflow Template registry
│   │   │   ├── prompt/           # Prompt assembler
│   │   │   ├── tools/            # Unified tool runtime
│   │   │   ├── mcp/              # MCP gateway and transports
│   │   │   └── persistence.ts
│   │   └── llm/
│   ├── services/
│   ├── stores/
│   ├── types/
│   └── utils/
├── docs/
│   ├── plans/
│   ├── prd/
│   └── project/
└── scripts/
```

## 运行时架构

```mermaid
flowchart TD
    A["User Request / Continue / Regenerate"] --> B["Frontend useChat"]
    B --> C["POST /api/chat/completions"]
    C --> D["Prompt Assembler"]
    C --> E["Attachment Summary Builder"]
    C --> F["runAgentRound"]

    D --> D1["Core Invariants"]
    D --> D2["Task Policy"]
    D --> D3["Preference Layer"]
    D --> D4["Preset Hints"]

    F --> G["AgentRuntime Minimal Loop"]
    G --> G1["Context Manager"]
    G --> G2["Checkpoint Manager"]
    G --> G3["Run Summary"]
    G --> G4["Serial Tool Execution"]

    D1 --> H["Bounded Turn Context"]
    D2 --> H
    D3 --> H
    D4 --> H
    E --> H
    G1 --> H

    H --> I["LLM + Tools"]
    I --> J["Product SSE Events + Message Parts"]
    J --> K["Persistence + Chat UI"]
```

## 当前收益

基于 [`Qiu上下文Attention对比报告_0313.md`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/docs/plans/Qiu上下文Attention对比报告_0313.md) 中的复现结果：

- 长会话场景下，送模消息数从 `22` 降到 `10`
- 长会话场景下，估算 token 从 `2072` 降到 `1001`，约下降 `51.7%`
- 带附件摘要层场景下，估算 token 从 `2584` 降到 `1513`，约下降 `41.4%`

这些数字说明当前系统已经能把“任务状态保留”从整段历史重放，转移到 summary、最近窗口和独立上下文层来承担。

## 主要页面

- `/chat`
  - 主聊天界面
  - 欢迎引导、消息流、文件上传、继续处理入口
- `/settings`
  - Agent 偏好
  - Prompt Presets / Workflow Templates
  - 自动记忆管理
  - 外观、API Keys、安全设置
- `/login`
- `/register`

## 主要 API

### 认证
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

### 用户与设置
- `GET /api/users/me`
- `PATCH /api/users/me`
- `DELETE /api/users/me`
- `PATCH /api/users/me/password`
- `GET /api/users/me/agent-memory`
- `PATCH /api/users/me/agent-memory`

### 会话与消息
- `GET /api/sessions`
- `POST /api/sessions`
- `PATCH /api/sessions/[id]`
- `DELETE /api/sessions/[id]`
- `GET /api/messages?sessionId=...`
- `POST /api/messages`
- `DELETE /api/messages/[id]`

### 聊天与 Agent
- `GET /api/chat/providers`
- `GET /api/chat/models`
- `GET /api/chat/agent-config`
- `POST /api/chat/completions`

### 文件
- `GET /api/files`
- `POST /api/files/upload`
- `GET /api/files/[id]`
- `DELETE /api/files/[id]`

### API Keys
- `GET /api/api-keys`
- `POST /api/api-keys`
- `PATCH /api/api-keys`
- `DELETE /api/api-keys`

### 诊断
- `GET /api/chat/mcp/diagnostics`

## 相关文档

- 架构核对与当前状态：
  [Qiu能力架构总览_0311.md](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/docs/project/Qiu能力架构总览_0311.md)
- 单 Agent 对话流重构完成总结：
  [单Agent对话流重构完成总结_0317.md](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/docs/project/单Agent对话流重构完成总结_0317.md)
- 实现时序图：
  [项目架构时序图.md](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/docs/project/项目架构时序图.md)
- 迁移设计：
  [Qiu能力架构迁移设计_PromptPreset_WorkflowTemplate_Tools_MCP_0311.md](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/docs/plans/Qiu能力架构迁移设计_PromptPreset_WorkflowTemplate_Tools_MCP_0311.md)
- PRD：
  [PRD-06_Qiu能力架构重定义_PromptPreset_WorkflowTemplate_Tools_MCP_0311.md](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/docs/prd/PRD-06_Qiu能力架构重定义_PromptPreset_WorkflowTemplate_Tools_MCP_0311.md)

## 测试说明

当前 Agent 相关测试主要覆盖：
- prompt assembler
- planner executor
- memory store
- tool registry
- MCP gateway
- view model
- chat completions route
