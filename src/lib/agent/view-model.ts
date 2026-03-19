import type { AgentCheckpointViewModel, AgentRunViewModel, Message } from '@/types/chat';
import {
  buildAgentRunViewModelFromMessage,
  getSessionAgentPreviewFromRuns,
} from '@/lib/agent/persistence';

export function buildAgentRunViewModel(message: Message): AgentRunViewModel | undefined {
  return buildAgentRunViewModelFromMessage(message);
}

export function getLatestAgentRun(messages: Message[]): AgentRunViewModel | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const run = buildAgentRunViewModel(messages[index]);
    if (run) return run;
  }
  return undefined;
}

export function getLatestRunnableCheckpoint(messages: Message[]): AgentCheckpointViewModel | undefined {
  const consumedCheckpointIds = getConsumedCheckpointIds(messages);
  const runs = messages
    .map((message) => buildAgentRunViewModel(message))
    .filter((run): run is AgentRunViewModel => Boolean(run));

  for (const run of runs.reverse()) {
    if (
      run.latestRunnableCheckpoint
      && !consumedCheckpointIds.has(run.latestRunnableCheckpoint.checkpointId)
    ) {
      return run.latestRunnableCheckpoint;
    }
  }

  return undefined;
}

export function getConsumedCheckpointIds(messages: Message[]): Set<string> {
  const consumedCheckpointIds = new Set<string>();
  const runs = messages
    .map((message) => buildAgentRunViewModel(message))
    .filter((run): run is AgentRunViewModel => Boolean(run));

  for (const run of runs) {
    if (run.resumedFromCheckpointId) {
      consumedCheckpointIds.add(run.resumedFromCheckpointId);
    }
  }

  return consumedCheckpointIds;
}

export function getSessionAgentPreview(messages: Message[]) {
  const runs = messages
    .map((message) => buildAgentRunViewModel(message))
    .filter((run): run is AgentRunViewModel => Boolean(run))
    .reverse();

  return getSessionAgentPreviewFromRuns(runs);
}
