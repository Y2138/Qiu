# PRD 总览：Qiu 极简 Agent 助手_0310

## 文档目标
基于 [`Qiu 极简 Agent 助手系统迭代规划_0310.md`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/docs/plans/Qiu%20极简%20Agent%20助手系统迭代规划_0310.md)，将整体方案拆分为可独立评审、设计、研发和验收的多份 PRD。

本次拆分遵循两个原则：
- 按产品能力域拆分，而不是按技术模块拆分
- 每份 PRD 都能独立回答“解决什么问题、给谁用、用户看到什么、如何验收”

## PRD 列表
### PRD-01. 品牌重定位与极简信息架构
- 文件：[`PRD-01_Qiu品牌重定位与极简信息架构_0310.md`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/docs/prd/PRD-01_Qiu品牌重定位与极简信息架构_0310.md)
- 关注点：
  - `QiuChat -> Qiu`
  - 聊天页、会话列表、设置页三层信息架构
  - 主界面去 Agent 面板化

### PRD-02. Chat 对话流与 Agent 状态内嵌
- 文件：[`PRD-02_Chat对话流与Agent状态内嵌_0310.md`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/docs/prd/PRD-02_Chat对话流与Agent状态内嵌_0310.md)
- 关注点：
  - Agent 状态如何在消息流中表达
  - 暂停、继续、步骤、工具调用如何被用户理解
  - 移除 `Agent Run Panel`

### PRD-03. Agent 偏好设置与自动化记忆
- 文件：[`PRD-03_Agent偏好设置与自动化记忆_0310.md`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/docs/prd/PRD-03_Agent偏好设置与自动化记忆_0310.md)
- 关注点：
  - 语气、回复密度、工作方式等偏好
  - 自动化长期记忆的写入边界和管理方式
  - 设置页中的偏好与记忆管理

### PRD-04. 文件上传与 Agent 文件理解
- 文件：[`PRD-04_文件上传与Agent文件理解_0310.md`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/docs/prd/PRD-04_文件上传与Agent文件理解_0310.md)
- 关注点：
  - 文件上传入口
  - Agent 读取文件后的状态反馈
  - 文件类型、失败场景、体验闭环

### PRD-05. 基础扩展能力与 Markdown 渲染体验
- 文件：[`PRD-05_基础扩展能力与Markdown渲染体验_0310.md`](/Users/staff/Documents/agent-workspace/fullstack/next/QiuChat/docs/prd/PRD-05_基础扩展能力与Markdown渲染体验_0310.md)
- 关注点：
  - `skill` 作为基础扩展机制的产品边界
  - `MCP` 暂缓策略
  - markdown 表格异常修复及消息渲染基础体验

## 依赖关系
### 第一优先级
- PRD-01 品牌重定位与极简信息架构
- PRD-02 Chat 对话流与 Agent 状态内嵌

这两份决定产品是否真正从“Chat 工具”切换为“Agent 助手”。

### 第二优先级
- PRD-03 Agent 偏好设置与自动化记忆
- PRD-04 文件上传与 Agent 文件理解

这两份决定产品是否有“个人助手感”和基础任务处理能力。

### 第三优先级
- PRD-05 基础扩展能力与 Markdown 渲染体验

这份负责补齐进阶扩展边界和关键基础体验问题。

## 推荐研发顺序
1. PRD-01
2. PRD-02
3. PRD-03
4. PRD-04
5. PRD-05

## 建议评审角色
- 产品：确认定位、用户路径、默认行为是否足够克制
- 设计：确认主界面是否真正极简，状态表达是否自然
- 前端：确认聊天流、设置页、文件上传和 markdown 渲染的交互成本
- 后端：确认偏好、记忆、文件读取、skill 管理接口边界

## 结论
通过多 PRD 拆分，Qiu 的下一阶段可以被拆成 5 个相对独立但相互衔接的产品能力包，避免继续以“技术能力合集”的方式推进。
