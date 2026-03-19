import { z } from 'zod';
import type {
  LLMMessage,
  LLMResponse,
  LLMToolCall,
  LLMToolDefinition,
  LLMToolResult,
} from '@/lib/llm/adapters/base';
import type { AgentBehaviorPreferences } from '@/types/settings';

export type AgentEventType =
  | 'agent.status'
  | 'agent.thinking'
  | 'agent.tool'
  | 'agent.checkpoint'
  | 'message.delta'
  | 'message.done'
  | 'error';

export type AgentToolErrorType =
  | 'validation'
  | 'timeout'
  | 'execution'
  | 'policy';

export interface AgentEvent {
  type: AgentEventType;
  payload: Record<string, unknown>;
}

export type AgentRunStatus =
  | 'idle'
  | 'running'
  | 'waiting_tool'
  | 'compacting'
  | 'completed'
  | 'failed'
  | 'paused';

export interface PlanStep {
  id: string;
  order: number;
  title: string;
  status: 'planned' | 'running' | 'completed' | 'failed';
  toolName?: string;
  detail?: string;
}

export interface AgentToolExecutionResult {
  success: boolean;
  output: string;
  errorType?: AgentToolErrorType;
  metadata?: Record<string, unknown>;
}

export type ToolSource = 'builtin' | 'internal' | 'third-party' | 'mcp' | 'local';
export type ToolRiskLevel = 'low' | 'medium' | 'high';
export type PresetRiskLevel = 'low' | 'medium' | 'high';

export interface ToolRuntimeDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodType<unknown>;
  rawInputSchema?: Record<string, unknown>;
  execute: (input: unknown, ctx: AgentRunContext) => Promise<AgentToolExecutionResult>;
  source: ToolSource;
  transport?: 'local' | 'stdio' | 'http' | 'sse' | 'ws';
  riskLevel?: ToolRiskLevel;
  enabled?: boolean;
}

export interface PromptPreset {
  id: string;
  name: string;
  description: string;
  riskLevel: PresetRiskLevel;
  source?: 'builtin' | 'local' | 'custom';
  intent: string;
  promptFragment: string;
}

export type AgentTool = ToolRuntimeDefinition;

export interface AgentObservation {
  id: string;
  toolName: string;
  output: string;
  success: boolean;
  errorType?: AgentToolErrorType;
  latencyMs?: number;
  createdAt: number;
}

export interface AgentMemorySummary {
  goal: string;
  currentTask: string;
  completedSteps: string[];
  pendingSteps: string[];
  keyObservations: string[];
  constraints: string[];
  decisions: string[];
  openQuestions: string[];
  updatedAt: number;
  compactedAt: number;
}

export interface AgentUserMemoryEntry {
  id: string;
  scope: 'user';
  kind: 'preference' | 'project_context';
  content: string;
  source: string;
  updatedAt: number;
}

export interface AgentAttachmentReference {
  id: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface AgentAttachmentContentResult {
  attachmentId: string;
  fileName: string;
  mimeType: string;
  size: number;
  content: string;
  cached: boolean;
}

export interface AgentCheckpoint {
  checkpointId: string;
  runId: string;
  createdAt: number;
  stepCount: number;
  status: AgentRunStatus;
  goal: string;
  messages: LLMMessage[];
  steps: PlanStep[];
  observations: AgentObservation[];
  memorySummary?: AgentMemorySummary;
  stopReason: string;
}

export interface AgentContextBudget {
  maxInputTokens: number;
  reservedOutputTokens: number;
  reservedToolSchemaTokens: number;
  systemBudget: number;
  memoryBudget: number;
  recentMessagesBudget: number;
  attachmentBudget: number;
}

export interface AgentContextDiagnostics {
  messageCount: number;
  estimatedInputTokens: number;
  estimatedAvailableTokens: number;
  estimatedToolSchemaTokens: number;
  memorySummaryEnabled: boolean;
  attachmentSummaryEnabled: boolean;
  trimmed: boolean;
  budgets: {
    system: number;
    memory: number;
    recentMessages: number;
    attachments: number;
    remaining: number;
  };
}

export interface AgentRunState {
  runId: string;
  status: AgentRunStatus;
  goal: string;
  steps: PlanStep[];
  workingMessages: LLMMessage[];
  observations: AgentObservation[];
  memorySummary?: AgentMemorySummary;
  lastContextDiagnostics?: AgentContextDiagnostics;
  currentCheckpoint?: AgentCheckpoint;
  resumedFromCheckpointId?: string;
  stopReason?: string;
}

export interface AgentRunContext {
  runId?: string;
  userId: string;
  sessionId?: string;
  model: string;
  startedAt: number;
  maxSteps: number;
  allowMcp: boolean;
  resumeFromCheckpointId?: string;
  memoryMode: 'off' | 'session' | 'session+user';
  retryPolicy: {
    toolMaxRetry: number;
  };
  selectedPromptPresets?: PromptPreset[];
  allMessages: LLMMessage[];
  resumedCheckpoint?: AgentCheckpoint;
  userMemoryEntries?: AgentUserMemoryEntry[];
  behaviorPreferences?: AgentBehaviorPreferences;
  attachments?: AgentAttachmentReference[];
  readAttachment?: (attachmentId: string) => Promise<AgentAttachmentContentResult>;
}

export interface AgentRunSummary {
  runId?: string;
  checkpointId?: string;
  resumedFromCheckpointId?: string;
  goal?: string;
  memorySummary?: AgentMemorySummary;
  userMemoryEntryCount?: number;
  promptPresetIds?: string[];
  memoryMode?: 'off' | 'session' | 'session+user';
  allowMcp?: boolean;
  maxSteps?: number;
  availableTools?: string[];
  tools: Array<{
    name: string;
    success: boolean;
    source: ToolSource;
    errorType?: AgentToolErrorType;
    latencyMs?: number;
  }>;
  status: 'completed' | 'failed' | 'paused';
  stepCount: number;
  errors: string[];
  latencyMs: number;
  contextBudget?: AgentContextBudget;
  contextDiagnostics?: AgentContextDiagnostics;
  mcpDiagnostics?: Record<string, unknown>;
}

export interface AgentExecutionResult {
  finalResponse: LLMResponse;
  events: AgentEvent[];
  summary: AgentRunSummary;
  checkpoint?: AgentCheckpoint;
  state: AgentRunState;
}

export interface AgentToolRuntime {
  getToolDefinitions: () => LLMToolDefinition[];
  getToolNames: () => string[];
  executeToolCall: (
    call: LLMToolCall,
    ctx: AgentRunContext,
    allowedTools?: Set<string>,
  ) => Promise<LLMToolResult & {
    success: boolean;
    source: ToolSource;
    errorType?: AgentToolErrorType;
    latencyMs?: number;
  }>;
}
