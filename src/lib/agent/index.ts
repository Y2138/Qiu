import type { BaseLLMAdapter, LLMExchangeRecorder, LLMMessage } from '@/lib/llm/adapters/base';
import { AgentRuntime } from '@/lib/agent/planner-executor';
import { ToolRegistry } from '@/lib/agent/tools/registry';
import { getBuiltinTools } from '@/lib/agent/tools/builtins';
import { PromptPresetRegistry } from '@/lib/agent/presets/registry';
import { assembleSystemPrompt } from '@/lib/agent/prompt/assembler';
import { mcpGateway } from '@/lib/agent/mcp/gateway';
import type {
  AgentAttachmentContentResult,
  AgentAttachmentReference,
  AgentCheckpoint,
  AgentRunContext,
  AgentUserMemoryEntry,
} from '@/lib/agent/types';
import type { AgentBehaviorPreferences } from '@/types/settings';

export interface AgentRuntimeOptions {
  runId?: string;
  userId: string;
  sessionId?: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
  allowMcp?: boolean;
  promptPresetIds?: string[];
  maxSteps?: number;
  resumeFromCheckpointId?: string;
  memoryMode?: 'off' | 'session' | 'session+user';
  resumedCheckpoint?: AgentCheckpoint;
  userMemoryEntries?: AgentUserMemoryEntry[];
  behaviorPreferences?: AgentBehaviorPreferences;
  attachments?: AgentAttachmentReference[];
  readAttachment?: (attachmentId: string) => Promise<AgentAttachmentContentResult>;
  userSettings?: unknown;
  retryPolicy?: {
    toolMaxRetry?: number;
  };
  onEvent?: (event: import('@/lib/agent/types').AgentEvent) => void;
  exchangeRecorder?: LLMExchangeRecorder;
}

export async function runAgentRound(
  adapter: BaseLLMAdapter,
  messages: LLMMessage[],
  options: AgentRuntimeOptions,
) {
  const maxSteps = Math.min(Math.max(options.maxSteps ?? 4, 1), 8);
  const presetRegistry = new PromptPresetRegistry({ userSettings: options.userSettings });
  const selectedPromptPresets = presetRegistry.getMany(options.promptPresetIds);
  const resolvedMemoryMode = options.memoryMode ?? 'session';

  const systemPrompt = assembleSystemPrompt({
    maxSteps,
    promptPresets: selectedPromptPresets,
    preferences: options.behaviorPreferences,
    attachments: options.attachments,
  });
  const messagesWithSystem = prependSystemPrompt(messages, systemPrompt);

  const toolRegistry = new ToolRegistry({
    maxToolExecutionMs: 15_000,
  });

  for (const tool of getBuiltinTools()) {
    toolRegistry.register(tool);
  }

  if (options.allowMcp) {
    const mcpTools = await mcpGateway.getToolsFromEnv().catch(() => []);
    for (const tool of mcpTools) {
      toolRegistry.register(tool);
    }
  }

  const context: AgentRunContext = {
    runId: options.runId,
    userId: options.userId,
    sessionId: options.sessionId,
    model: options.model,
    startedAt: Date.now(),
    maxSteps,
    allowMcp: Boolean(options.allowMcp),
    resumeFromCheckpointId: options.resumeFromCheckpointId,
    memoryMode: resolvedMemoryMode,
    retryPolicy: {
      toolMaxRetry: Math.min(Math.max(options.retryPolicy?.toolMaxRetry ?? 1, 0), 3),
    },
    selectedPromptPresets,
    allMessages: messagesWithSystem,
    resumedCheckpoint: options.resumedCheckpoint,
    userMemoryEntries: options.userMemoryEntries,
    behaviorPreferences: options.behaviorPreferences,
    attachments: options.attachments,
    readAttachment: options.readAttachment,
  };

  const planner = new AgentRuntime(adapter, toolRegistry, {
    model: options.model,
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    onEvent: options.onEvent,
    exchangeRecorder: options.exchangeRecorder,
  });

  const result = await planner.run(messagesWithSystem, context);
  result.summary.availableTools = toolRegistry.getToolNames();
  result.summary.mcpDiagnostics = options.allowMcp
    ? {
        servers: mcpGateway.getDiagnostics(),
      }
    : undefined;
  return result;
}

function prependSystemPrompt(messages: LLMMessage[], systemPrompt: string): LLMMessage[] {
  const hasSystem = messages.some((message) => message.role === 'system');
  if (hasSystem) return messages;

  return [
    {
      role: 'system',
      content: systemPrompt,
    },
    ...messages,
  ];
}
