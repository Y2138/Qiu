import type {
  AgentCheckpoint,
  AgentEvent,
  AgentRunState,
} from '@/lib/agent/types';

interface CheckpointStore {
  create: (state: AgentRunState, reason: string, turnCount: number) => AgentCheckpoint;
}

export class InMemoryCheckpointStore implements CheckpointStore {
  create(state: AgentRunState, reason: string, turnCount: number): AgentCheckpoint {
    return {
      checkpointId: `cp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      runId: state.runId,
      createdAt: Date.now(),
      stepCount: turnCount,
      status: state.status,
      goal: state.goal,
      messages: [...state.workingMessages],
      steps: state.steps.map((step) => ({ ...step })),
      observations: state.observations.map((item) => ({ ...item })),
      memorySummary: state.memorySummary,
      stopReason: reason,
    };
  }
}

export class AgentCheckpointManager {
  constructor(private readonly store: CheckpointStore = new InMemoryCheckpointStore()) {}

  createCheckpoint(
    state: AgentRunState,
    reason: string,
    turnCount: number,
  ): { checkpoint: AgentCheckpoint; events: AgentEvent[] } {
    const checkpoint = this.store.create(state, reason, turnCount);
    return {
      checkpoint,
      events: [{
        type: 'agent.checkpoint',
        payload: {
          checkpointId: checkpoint.checkpointId,
          status: checkpoint.status,
          resumable: checkpoint.status === 'paused' || checkpoint.status === 'failed',
          label: '继续处理',
        },
      }],
    };
  }
}
