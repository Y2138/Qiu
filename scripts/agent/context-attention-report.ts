import { AgentRuntime } from '@/lib/agent/planner-executor';
import { BaseLLMAdapter } from '@/lib/llm/adapters/base';
import type {
  LLMMessage,
  LLMRequestOptions,
  LLMResponse,
  LLMStreamChunk,
  LLMToolCall,
} from '@/lib/llm/adapters/base';
import type { AgentRunContext, AgentToolRuntime } from '@/lib/agent/types';

class FakeAdapter extends BaseLLMAdapter {
  readonly apiType = 'fake';

  async complete(messages: LLMMessage[], _options?: LLMRequestOptions): Promise<LLMResponse> {
    const hasToolResult = messages.some((message) => message.content.includes('tool_result_done:ok'));
    if (!hasToolResult) {
      return {
        id: 'r1',
        model: 'fake-model',
        content: '',
        toolCalls: [{ id: 'call_1', name: 'echo_text', arguments: '{"text":"x"}' }],
      };
    }

    return {
      id: 'r2',
      model: 'fake-model',
      content: 'final answer',
    };
  }

  async completeWithTools(messages: LLMMessage[], options?: LLMRequestOptions): Promise<LLMResponse> {
    const toolResults = options?.toolResults ?? [];
    const withResults = [
      ...messages,
      ...toolResults.map((result) => ({ role: 'user' as const, content: `tool_result_done:${result.output}` })),
    ];
    return this.complete(withResults, options);
  }

  async *streamComplete(_messages: LLMMessage[], _options?: LLMRequestOptions): AsyncGenerator<LLMStreamChunk> {
    yield { content: 'noop' };
  }

  async testApiKey(): Promise<boolean> {
    return true;
  }
}

class FakeToolRuntime implements AgentToolRuntime {
  getToolDefinitions() {
    return [{
      name: 'echo_text',
      description: 'echo',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'text to echo back to the runtime' },
        },
      },
    }];
  }

  getToolNames(): string[] {
    return ['echo_text'];
  }

  async executeToolCall(call: LLMToolCall) {
    return {
      toolCallId: call.id,
      name: call.name,
      output: 'ok',
      success: true,
      source: 'local' as const,
      latencyMs: 1,
    };
  }
}

function createContext(overrides: Partial<AgentRunContext> = {}): AgentRunContext {
  return {
    userId: 'u1',
    model: 'gpt-4o-mini',
    startedAt: Date.now(),
    maxSteps: 4,
    allowMcp: false,
    memoryMode: 'session',
    selectedPromptPresets: [],
    allMessages: [{ role: 'user', content: 'hi' }],
    retryPolicy: { toolMaxRetry: 1 },
    ...overrides,
  };
}

function estimateTextTokens(content: string): number {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return 1;
  }
  return Math.ceil(normalized.length / 4) + 6;
}

function estimateMessageTokens(message: LLMMessage): number {
  return estimateTextTokens(message.content) + 4;
}

function estimateMessagesTokens(messages: LLMMessage[]): number {
  return messages.reduce((sum, message) => sum + estimateMessageTokens(message), 0);
}

function buildLongConversationScenario(): LLMMessage[] {
  const messages: LLMMessage[] = [{ role: 'system', content: 'primary-system\nKeep the task focused and structured.' }];
  for (let index = 1; index <= 10; index += 1) {
    messages.push({
      role: 'user',
      content: `user-${index}: ${'请分析当前问题并记录关键上下文。'.repeat(22)}`,
    });
    messages.push({
      role: 'assistant',
      content: `assistant-${index}: ${'我会继续推进，并保留必要结论。'.repeat(20)}`,
    });
  }
  messages.push({
    role: 'user',
    content: `final-user-request: ${'请基于以上背景总结结论，并优先处理当前请求。'.repeat(26)}`,
  });
  return messages;
}

function buildAttachmentScenario(): LLMMessage[] {
  return [
    ...buildLongConversationScenario(),
    {
      role: 'system',
      content: `Attachment context layer:\n附件：report.txt\n类型：text/plain\n短摘要：${'长附件摘要内容。'.repeat(240)}\n关键片段：${'关键片段A | 关键片段B | 关键片段C'}`,
    },
  ];
}

async function runScenario(name: string, messages: LLMMessage[]) {
  const runtime = new AgentRuntime(new FakeAdapter(), new FakeToolRuntime(), {
    model: 'gpt-4o-mini',
    apiKey: 'x',
  });
  const result = await runtime.run(messages, createContext());
  const diagnostics = result.summary.contextDiagnostics;
  const budget = result.summary.contextBudget;

  if (!diagnostics || !budget) {
    throw new Error(`Scenario ${name} did not produce diagnostics.`);
  }

  const baselineTokens = estimateMessagesTokens(messages);
  const baselineMessageCount = messages.length;
  const optimizedTokens = diagnostics.estimatedInputTokens;
  const optimizedMessageCount = diagnostics.messageCount;

  return {
    name,
    baselineMessageCount,
    baselineTokens,
    optimizedMessageCount,
    optimizedTokens,
    reductionTokens: baselineTokens - optimizedTokens,
    reductionPercent: Number((((baselineTokens - optimizedTokens) / baselineTokens) * 100).toFixed(1)),
    summaryEnabled: diagnostics.memorySummaryEnabled,
    attachmentEnabled: diagnostics.attachmentSummaryEnabled,
    trimmed: diagnostics.trimmed,
    remainingBudget: diagnostics.budgets.remaining,
    availableTokens: diagnostics.estimatedAvailableTokens,
    reservedToolSchemaTokens: diagnostics.estimatedToolSchemaTokens,
  };
}

async function main() {
  const scenarios = await Promise.all([
    runScenario('Long session without attachment', buildLongConversationScenario()),
    runScenario('Long session with attachment summary layer', buildAttachmentScenario()),
  ]);

  const lines = [
    '# Context Attention Report',
    '',
    'Generated from the current Agent runtime using bounded context + token budget diagnostics.',
    '',
    ...scenarios.flatMap((scenario) => [
      `## ${scenario.name}`,
      '',
      `- Baseline full-history messages: ${scenario.baselineMessageCount}`,
      `- Optimized send-to-model messages: ${scenario.optimizedMessageCount}`,
      `- Baseline estimated tokens: ${scenario.baselineTokens}`,
      `- Optimized estimated tokens: ${scenario.optimizedTokens}`,
      `- Estimated token reduction: ${scenario.reductionTokens} (${scenario.reductionPercent}%)`,
      `- Memory summary enabled: ${scenario.summaryEnabled ? 'yes' : 'no'}`,
      `- Attachment summary enabled: ${scenario.attachmentEnabled ? 'yes' : 'no'}`,
      `- Context trimmed: ${scenario.trimmed ? 'yes' : 'no'}`,
      `- Remaining runtime budget: ${scenario.remainingBudget}`,
      `- Available input budget after reserves: ${scenario.availableTokens}`,
      `- Reserved tool schema tokens: ${scenario.reservedToolSchemaTokens}`,
      '',
    ]),
  ];

  process.stdout.write(lines.join('\n'));
}

void main();
