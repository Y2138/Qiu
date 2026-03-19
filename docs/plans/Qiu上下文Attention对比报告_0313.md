# Qiu 上下文 Attention 对比报告_0313

本文档记录 [`Qiu 上下文 Attention 优化方案_0311`](./Qiu%E4%B8%8A%E4%B8%8B%E6%96%87Attention%E4%BC%98%E5%8C%96%E6%96%B9%E6%A1%88_0311.md) 在当前实现中的一组可复现对比结果，用于说明“全量历史”与“分层预算上下文”之间的差异。

## 说明

- 本报告基于当前 runtime 内部的近似 token 估算器与 `contextDiagnostics`
- 对比口径不是 provider 账单 token，而是运行时用于裁剪决策的统一估算口径
- 目标是说明上下文收敛效果，而不是替代线上真实计费统计

复现命令：

```bash
node --require ./scripts/test/register-ts.cjs ./scripts/agent/context-attention-report.ts
```

## 场景一：长会话，无附件

- 基线口径：请求入口保留完整历史消息
- 优化口径：当前 runtime 使用 system / memory / recent messages 分层预算

结果：

- Full-history message count: `22`
- Optimized message count: `10`
- Full-history estimated tokens: `2072`
- Optimized estimated tokens: `1001`
- Estimated reduction: `1071` tokens，约 `51.7%`
- Memory summary: `enabled`
- Attachment summary: `disabled`

结论：

- 在没有附件的长会话里，当前 runtime 已能把送模消息数压到原来的约一半
- token 估算占用下降超过 50%，说明最近窗口 + rolling summary 已经开始承担主上下文角色
- 最新用户请求仍保留在最近窗口中，任务焦点不再依赖整段历史重放

## 场景二：长会话，带附件摘要层

- 基线口径：完整历史 + 附件摘要层一起参与估算
- 优化口径：当前 runtime 使用 system / memory / recent messages / attachments 独立预算

结果：

- Full-history message count: `23`
- Optimized message count: `11`
- Full-history estimated tokens: `2584`
- Optimized estimated tokens: `1513`
- Estimated reduction: `1071` tokens，约 `41.4%`
- Memory summary: `enabled`
- Attachment summary: `enabled`

结论：

- 引入附件摘要层后，运行时仍然能把整体上下文压到明显低于全量历史的水平
- 附件继续存在于独立 layer 中，而不是重新膨胀 user 正文
- 长附件场景下，优化收益略低于纯会话场景，但仍保留了稳定的 attention 收敛效果

## 综合判断

当前版本已经具备以下可量化收益：

- 长会话场景下，送模消息条数从 `22` 降到 `10`
- 长会话场景下，估算 token 占用下降约 `51.7%`
- 带附件场景下，估算 token 占用下降约 `41.4%`
- memory summary 与 attachment summary 都能在 diagnostics 中直接观测到是否启用

仍然需要继续补的部分：

- 真实用户路径的人工回归
- 不同 provider / model 下的真实计费 token 对比
- 更大附件、更长工具链路下的收益采样
