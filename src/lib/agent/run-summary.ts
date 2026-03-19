import type {
  AgentContextBudget,
  AgentRunContext,
  AgentRunState,
  AgentRunSummary,
  AgentToolErrorType,
  ToolSource,
} from '@/lib/agent/types';

interface BuildRunSummaryOptions {
  state: AgentRunState;
  context: AgentRunContext;
  turnCount: number;
  toolsUsed: Array<{
    name: string;
    success: boolean;
    source: ToolSource;
    errorType?: AgentToolErrorType;
    latencyMs?: number;
  }>;
  errors: string[];
  latencyMs: number;
  contextBudget?: AgentContextBudget;
}

export function buildRunSummary({
  state,
  context,
  turnCount,
  toolsUsed,
  errors,
  latencyMs,
  contextBudget,
}: BuildRunSummaryOptions): AgentRunSummary {
  const status: 'completed' | 'failed' | 'paused' = state.status === 'completed'
    ? 'completed'
    : state.status === 'paused'
      ? 'paused'
      : 'failed';

  return {
    runId: state.runId,
    checkpointId: state.currentCheckpoint?.checkpointId,
    resumedFromCheckpointId: state.resumedFromCheckpointId,
    goal: state.goal,
    memorySummary: state.memorySummary,
    userMemoryEntryCount: context.userMemoryEntries?.length ?? 0,
    promptPresetIds: (context.selectedPromptPresets ?? []).map((preset) => preset.id),
    memoryMode: context.memoryMode,
    allowMcp: context.allowMcp,
    maxSteps: context.maxSteps,
    tools: toolsUsed,
    status,
    stepCount: turnCount,
    errors,
    latencyMs,
    contextBudget: state.lastContextDiagnostics ? contextBudget : undefined,
    contextDiagnostics: state.lastContextDiagnostics,
  };
}
