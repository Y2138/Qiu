import type { LLMMessage, LLMToolDefinition } from '@/lib/llm/adapters/base';
import type {
  AgentContextBudget,
  AgentContextDiagnostics,
  AgentEvent,
  AgentRunContext,
  AgentRunState,
} from '@/lib/agent/types';

const RECENT_MESSAGE_WINDOW = 8;
const RECENT_OBSERVATION_WINDOW = 3;
const SUMMARY_LIST_LIMIT = 6;
const ATTACHMENT_CONTEXT_PREFIX = 'Attachment context layer:';

export interface TurnContextAssembly {
  messages: LLMMessage[];
  budget: AgentContextBudget;
  diagnostics: AgentContextDiagnostics;
}

type ContextMaintenanceTrigger = 'pre_turn' | 'post_tool' | 'post_response';

export class AgentContextManager {
  prepareTurn(
    state: AgentRunState,
    context: AgentRunContext,
    toolDefinitions: LLMToolDefinition[],
  ): TurnContextAssembly {
    const primarySystemMessage = this.getPrimarySystemMessage(state.workingMessages);
    const attachmentMessages = this.getAttachmentMessages(state.workingMessages);
    const latestUserMessage = [...state.workingMessages].reverse().find((message) => message.role === 'user');
    const conversationMessages = this.getConversationMessages(state.workingMessages);
    const memoryMessage = this.buildMemoryMessage(state, context);
    const budget = this.resolveContextBudget(context, toolDefinitions);
    const systemLayer = primarySystemMessage
      ? this.fitMessageToBudget(primarySystemMessage, budget.systemBudget)
      : undefined;
    const memoryLayer = memoryMessage
      ? this.fitMessageToBudget(memoryMessage, budget.memoryBudget)
      : undefined;
    const attachmentLayer = this.fitMessagesToBudget(attachmentMessages, budget.attachmentBudget, false);
    const recentWindow = this.buildRecentWindow(
      conversationMessages,
      latestUserMessage,
      budget.recentMessagesBudget,
    );
    const messages = [
      ...(systemLayer ? [systemLayer.message] : []),
      ...(memoryLayer ? [memoryLayer.message] : []),
      ...attachmentLayer.messages,
      ...recentWindow.messages,
    ];
    const estimatedInputTokens = this.estimateMessagesTokens(messages);
    const estimatedAvailableTokens = Math.max(
      budget.maxInputTokens - budget.reservedOutputTokens - budget.reservedToolSchemaTokens,
      0,
    );

    return {
      messages,
      budget,
      diagnostics: {
        messageCount: messages.length,
        estimatedInputTokens,
        estimatedAvailableTokens,
        estimatedToolSchemaTokens: budget.reservedToolSchemaTokens,
        memorySummaryEnabled: Boolean(state.memorySummary),
        attachmentSummaryEnabled: attachmentMessages.length > 0,
        trimmed:
          Boolean(systemLayer?.trimmed)
          || Boolean(memoryLayer?.trimmed)
          || attachmentLayer.trimmed
          || recentWindow.trimmed
          || estimatedInputTokens >= estimatedAvailableTokens,
        budgets: {
          system: budget.systemBudget,
          memory: budget.memoryBudget,
          recentMessages: budget.recentMessagesBudget,
          attachments: budget.attachmentBudget,
          remaining: Math.max(estimatedAvailableTokens - estimatedInputTokens, 0),
        },
      },
    };
  }

  maintainState(
    state: AgentRunState,
    context: AgentRunContext,
    toolDefinitions: LLMToolDefinition[],
    trigger: ContextMaintenanceTrigger,
  ): AgentEvent[] {
    const events: AgentEvent[] = [];

    if (this.shouldRefreshRollingSummary(state, context, toolDefinitions, trigger)) {
      state.memorySummary = this.buildRollingSummary(state);
      events.push({
        type: 'agent.thinking',
        payload: {
          id: `thinking_summary_${Date.now()}`,
          text: trigger === 'pre_turn' ? '正在整理上下文记忆' : '已更新记忆摘要',
        },
      });
    }

    if (trigger !== 'pre_turn' && this.shouldCompactTurnContext(state, context, toolDefinitions)) {
      state.status = 'compacting';
      state.workingMessages = this.buildCompactedWorkingMessages(state);
      events.push({
        type: 'agent.thinking',
        payload: {
          id: `thinking_compact_${Date.now()}`,
          text: '已压缩历史上下文，继续执行',
        },
      });
    }

    return events;
  }

  resolveBudget(context: AgentRunContext, toolDefinitions: LLMToolDefinition[]): AgentContextBudget {
    return this.resolveContextBudget(context, toolDefinitions);
  }

  private shouldTriggerRollingSummary(
    state: AgentRunState,
    context: AgentRunContext,
    toolDefinitions: LLMToolDefinition[],
  ): boolean {
    if (context.memoryMode === 'off') return false;
    const threshold = this.resolveSummaryTriggerThreshold();
    const totalChars = state.workingMessages.reduce((sum, message) => sum + message.content.length, 0);
    if (totalChars >= threshold) {
      return true;
    }

    const budget = this.resolveContextBudget(context, toolDefinitions);
    const estimatedTokens = this.estimateMessagesTokens(state.workingMessages);
    const availableTokens = Math.max(
      budget.maxInputTokens - budget.reservedOutputTokens - budget.reservedToolSchemaTokens,
      0,
    );
    return estimatedTokens >= Math.max(Math.floor(availableTokens * 0.7), budget.recentMessagesBudget + budget.systemBudget);
  }

  private buildMemoryMessage(state: AgentRunState, context: AgentRunContext): LLMMessage | undefined {
    if (context.memoryMode === 'off') {
      return undefined;
    }

    const memorySections: string[] = [];
    if (state.memorySummary) {
      memorySections.push([
        'Session memory summary:',
        `Goal: ${state.memorySummary.goal}`,
        `Current task: ${state.memorySummary.currentTask || 'none'}`,
        `Completed steps: ${state.memorySummary.completedSteps.join(' | ') || 'none'}`,
        `Pending steps: ${state.memorySummary.pendingSteps.join(' | ') || 'none'}`,
        `Key observations: ${state.memorySummary.keyObservations.join(' | ') || 'none'}`,
        `Constraints: ${state.memorySummary.constraints.join(' | ') || 'none'}`,
        `Decisions: ${state.memorySummary.decisions.join(' | ') || 'none'}`,
        `Open questions: ${state.memorySummary.openQuestions.join(' | ') || 'none'}`,
      ].join('\n'));
    }

    const recentObservations = state.observations.slice(-RECENT_OBSERVATION_WINDOW);
    if (recentObservations.length > 0) {
      memorySections.push([
        'Recent tool observations:',
        ...recentObservations.map((item) => `- ${item.toolName}: ${this.compactText(item.output)}`),
      ].join('\n'));
    }

    if (context.memoryMode === 'session+user' && context.userMemoryEntries?.length) {
      memorySections.push([
        'User memory:',
        ...context.userMemoryEntries.map((entry) => `- [${entry.kind}] ${entry.content}`),
      ].join('\n'));
    }

    if (memorySections.length === 0) {
      return undefined;
    }

    return {
      role: 'system',
      content: memorySections.join('\n\n'),
    };
  }

  private buildRecentWindow(
    messages: LLMMessage[],
    latestUserMessage: LLMMessage | undefined,
    budget: number,
  ): { messages: LLMMessage[]; trimmed: boolean } {
    if (messages.length === 0 || budget <= 0) {
      return { messages: [], trimmed: messages.length > 0 };
    }

    const selected: LLMMessage[] = [];
    let remaining = budget;
    let trimmed = false;

    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (selected.length >= RECENT_MESSAGE_WINDOW) {
        trimmed = true;
        break;
      }

      const message = messages[index];
      const isLatestUser = latestUserMessage ? message === latestUserMessage : false;
      const fitted = this.fitMessageToBudget(message, remaining);
      if (!fitted) {
        if (isLatestUser && selected.length === 0) {
          const fallback = this.fitMessageToBudget(message, Math.max(Math.min(budget, 256), 64));
          if (fallback) {
            selected.unshift(fallback.message);
            trimmed = true;
          }
        } else {
          trimmed = true;
        }
        continue;
      }

      selected.unshift(fitted.message);
      remaining = Math.max(remaining - this.estimateMessageTokens(fitted.message), 0);
      trimmed = trimmed || fitted.trimmed;

      if (remaining <= 0) {
        trimmed = index > 0;
        break;
      }
    }

    if (latestUserMessage && !selected.some((message) => message.content === latestUserMessage.content && message.role === latestUserMessage.role)) {
      const fallback = this.fitMessageToBudget(latestUserMessage, Math.max(Math.min(budget, 256), 64));
      if (fallback) {
        if (selected.length >= RECENT_MESSAGE_WINDOW) {
          selected.shift();
        }
        selected.push(fallback.message);
        trimmed = true;
      }
    }

    return { messages: selected, trimmed };
  }

  private shouldCompactTurnContext(
    state: AgentRunState,
    context: AgentRunContext,
    toolDefinitions: LLMToolDefinition[],
  ): boolean {
    if (context.memoryMode === 'off' || !state.memorySummary) {
      return false;
    }

    const conversationMessages = this.getConversationMessages(state.workingMessages);
    const attachmentMessages = this.getAttachmentMessages(state.workingMessages);
    const budget = this.resolveContextBudget(context, toolDefinitions);
    return conversationMessages.length >= RECENT_MESSAGE_WINDOW + 2
      || this.estimateMessagesTokens(conversationMessages) > budget.recentMessagesBudget
      || this.estimateMessagesTokens(attachmentMessages) > budget.attachmentBudget;
  }

  private buildCompactedWorkingMessages(state: AgentRunState): LLMMessage[] {
    const primarySystemMessage = this.getPrimarySystemMessage(state.workingMessages);
    const attachmentMessages = this.getAttachmentMessages(state.workingMessages);
    const conversationMessages = this.getConversationMessages(state.workingMessages);
    const latestUserMessage = [...conversationMessages]
      .reverse()
      .find((message) => message.role === 'user');
    const recentWindow = this.buildRecentWindow(conversationMessages, latestUserMessage, Number.MAX_SAFE_INTEGER);

    return [
      ...(primarySystemMessage ? [primarySystemMessage] : []),
      ...attachmentMessages,
      ...recentWindow.messages,
    ];
  }

  private shouldRefreshRollingSummary(
    state: AgentRunState,
    context: AgentRunContext,
    toolDefinitions: LLMToolDefinition[],
    trigger: ContextMaintenanceTrigger,
  ): boolean {
    if (context.memoryMode === 'off') {
      return false;
    }

    if (state.memorySummary) {
      return trigger !== 'pre_turn' || this.shouldTriggerRollingSummary(state, context, toolDefinitions);
    }

    return this.shouldTriggerRollingSummary(state, context, toolDefinitions);
  }

  private buildRollingSummary(state: AgentRunState) {
    const completedSteps = this.limitSummaryItems(
      state.steps
        .filter((step) => step.status === 'completed')
        .map((step) => step.title),
    );
    const pendingSteps = this.limitSummaryItems(
      state.steps
        .filter((step) => step.status === 'planned' || step.status === 'running')
        .map((step) => step.title),
    );
    const keyObservations = this.limitSummaryItems(
      state.observations
        .slice(-SUMMARY_LIST_LIMIT)
        .map((item) => `${item.toolName}: ${this.compactText(item.output)}`),
    );
    const decisions = this.limitSummaryItems([
      ...(state.memorySummary?.decisions ?? []),
      ...completedSteps.map((title) => `Completed step: ${title}`),
      ...state.observations
        .slice(-SUMMARY_LIST_LIMIT)
        .filter((item) => item.success)
        .map((item) => `Used ${item.toolName}`),
    ]);
    const openQuestions = this.limitSummaryItems([
      ...(state.memorySummary?.openQuestions ?? []),
      ...state.observations
        .slice(-SUMMARY_LIST_LIMIT)
        .filter((item) => !item.success)
        .map((item) => `${item.toolName}: ${this.compactText(item.output)}`),
    ]);
    const currentTask = pendingSteps[0] ?? completedSteps.at(-1) ?? state.goal;

    return {
      goal: state.goal,
      currentTask,
      completedSteps,
      pendingSteps,
      keyObservations,
      constraints: this.limitSummaryItems([
        ...(state.memorySummary?.constraints ?? []),
        'Use available tools responsibly',
        'Stop on unsupported recovery actions',
      ]),
      decisions,
      openQuestions,
      updatedAt: Date.now(),
      compactedAt: state.memorySummary?.compactedAt ?? Date.now(),
    };
  }

  private limitSummaryItems(values: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const value of values) {
      const normalized = value.trim();
      if (!normalized || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      result.push(normalized);
    }

    return result.slice(-SUMMARY_LIST_LIMIT);
  }

  private resolveContextBudget(
    context: AgentRunContext,
    toolDefinitions: LLMToolDefinition[],
  ): AgentContextBudget {
    const maxInputTokens = this.resolveModelInputCapacity(context.model);
    const reservedToolSchemaTokens = Math.max(this.estimateToolDefinitionsTokens(toolDefinitions), 600);
    const reservedOutputTokens = Math.min(Math.max(Math.floor(maxInputTokens * 0.18), 800), 4000);
    const availableTokens = Math.max(maxInputTokens - reservedOutputTokens - reservedToolSchemaTokens, 2400);
    const systemBudget = this.clamp(Math.floor(availableTokens * 0.18), 900, 2400);
    const memoryBudget = context.memoryMode === 'off'
      ? 0
      : this.clamp(Math.floor(availableTokens * 0.2), 700, 2200);
    const attachmentBudget = this.clamp(Math.floor(availableTokens * 0.16), 500, 1800);
    const recentMessagesBudget = Math.max(
      availableTokens - systemBudget - memoryBudget - attachmentBudget,
      1200,
    );

    return {
      maxInputTokens,
      reservedOutputTokens,
      reservedToolSchemaTokens,
      systemBudget,
      memoryBudget,
      recentMessagesBudget,
      attachmentBudget,
    };
  }

  private resolveModelInputCapacity(model: string): number {
    const normalized = model.toLowerCase();
    if (/(gpt-5|gpt-4\.1|opus|o1)/.test(normalized)) {
      return 96_000;
    }
    if (/(gpt-4o|sonnet|o3|deepseek|glm-4)/.test(normalized)) {
      return 48_000;
    }
    if (/(mini|haiku|flash|small)/.test(normalized)) {
      return 24_000;
    }
    return 32_000;
  }

  private estimateToolDefinitionsTokens(toolDefinitions: LLMToolDefinition[]): number {
    return toolDefinitions.reduce((total, definition) => {
      const schema = JSON.stringify(definition.inputSchema ?? {});
      return total + this.estimateTextTokens(`${definition.name}\n${definition.description}\n${schema}`);
    }, 0);
  }

  private estimateMessagesTokens(messages: LLMMessage[]): number {
    return messages.reduce((sum, message) => sum + this.estimateMessageTokens(message), 0);
  }

  private estimateMessageTokens(message: LLMMessage): number {
    return this.estimateTextTokens(message.content) + 4;
  }

  private estimateTextTokens(content: string): number {
    const normalized = content.replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return 1;
    }
    return Math.ceil(normalized.length / 4) + 6;
  }

  private fitMessagesToBudget(
    messages: LLMMessage[],
    budget: number,
    preserveAll: boolean,
  ): { messages: LLMMessage[]; trimmed: boolean } {
    if (messages.length === 0 || budget <= 0) {
      return { messages: [], trimmed: messages.length > 0 };
    }

    const selected: LLMMessage[] = [];
    let remaining = budget;
    let trimmed = false;

    for (const message of messages) {
      const fitted = this.fitMessageToBudget(message, remaining);
      if (!fitted) {
        trimmed = true;
        if (!preserveAll) {
          break;
        }
        continue;
      }
      selected.push(fitted.message);
      remaining = Math.max(remaining - this.estimateMessageTokens(fitted.message), 0);
      trimmed = trimmed || fitted.trimmed;
      if (remaining <= 0 && !preserveAll) {
        break;
      }
    }

    return { messages: selected, trimmed };
  }

  private fitMessageToBudget(
    message: LLMMessage,
    budget: number,
  ): { message: LLMMessage; trimmed: boolean } | undefined {
    if (budget <= 0) {
      return undefined;
    }

    const estimatedTokens = this.estimateMessageTokens(message);
    if (estimatedTokens <= budget) {
      return { message: { ...message }, trimmed: false };
    }

    const charBudget = Math.max((budget - 8) * 4, 48);
    const trimmedContent = this.trimTextToCharBudget(message.content, charBudget);
    if (!trimmedContent) {
      return undefined;
    }

    return {
      message: {
        ...message,
        content: trimmedContent,
      },
      trimmed: true,
    };
  }

  private trimTextToCharBudget(content: string, charBudget: number): string {
    const normalized = content.replace(/\s+/g, ' ').trim();
    if (normalized.length <= charBudget) {
      return normalized;
    }
    const clipped = normalized.slice(0, Math.max(charBudget - 24, 24)).trimEnd();
    return `${clipped}\n...[truncated for context budget]`;
  }

  private getPrimarySystemMessage(messages: LLMMessage[]): LLMMessage | undefined {
    return messages.find((message) => message.role === 'system' && !this.isAttachmentContextMessage(message));
  }

  private getAttachmentMessages(messages: LLMMessage[]): LLMMessage[] {
    return messages.filter((message) => this.isAttachmentContextMessage(message));
  }

  private getConversationMessages(messages: LLMMessage[]): LLMMessage[] {
    return messages.filter((message) => message.role !== 'system');
  }

  private isAttachmentContextMessage(message: LLMMessage): boolean {
    return message.role === 'system' && message.content.startsWith(ATTACHMENT_CONTEXT_PREFIX);
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  private resolveSummaryTriggerThreshold(): number {
    return 6000;
  }

  private compactText(value: string): string {
    const normalized = value.replace(/\s+/g, ' ').trim();
    return normalized.length <= 120 ? normalized : `${normalized.slice(0, 117)}...`;
  }
}
