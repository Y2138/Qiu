import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import type { LLMMessage } from '@/lib/llm/adapters/base';
import {
  AGENT_PERSISTENCE_SETUP_MESSAGE,
  isAgentPersistenceTableMissingError,
} from '@/lib/agent/persistence-errors';
import {
  deriveUserMemoryEntries,
  mergeUserMemoryEntries,
  readUserMemoryEntries,
  writeUserMemoryEntries,
} from '@/lib/agent/memory-store';
import { getAgentCheckpointMeta } from '@/lib/agent/message-parts';
import type {
  AgentCheckpoint,
  AgentMemorySummary,
  AgentRunStatus,
  AgentRunSummary,
  AgentUserMemoryEntry,
} from '@/lib/agent/types';
import type {
  AgentCheckpointViewModel,
  AgentRunResolvedConfig,
  AgentRunViewModel,
  Message,
} from '@/types/chat';

type PrismaLike = PrismaClient | {
  agentRun: {
    create: (...args: unknown[]) => Promise<unknown>
    update: (...args: unknown[]) => Promise<unknown>
    findMany: (...args: unknown[]) => Promise<unknown[]>
    findFirst: (...args: unknown[]) => Promise<unknown>
    findUnique: (...args: unknown[]) => Promise<unknown>
  }
  agentCheckpoint: {
    create: (...args: unknown[]) => Promise<unknown>
    findMany: (...args: unknown[]) => Promise<unknown[]>
    findUnique: (...args: unknown[]) => Promise<unknown>
  }
  agentMemoryEntry: {
    findMany: (...args: unknown[]) => Promise<unknown[]>
    createMany: (...args: unknown[]) => Promise<unknown>
    deleteMany: (...args: unknown[]) => Promise<unknown>
  }
  message: {
    findMany: (...args: unknown[]) => Promise<unknown[]>
  }
  user: {
    findUnique: (...args: unknown[]) => Promise<unknown>
    update: (...args: unknown[]) => Promise<unknown>
  }
}

type PersistedRecord = Record<string, unknown>;

type PersistedRunRecord = {
  id: string
  sessionId?: string
  userId?: string
  status: string
  goal?: string | null
  latestCheckpointId?: string | null
  resumedFromCheckpointId?: string | null
  stopReason?: string | null
  promptPresetIds: string[]
  memoryMode: string
  allowMcp: boolean
  maxSteps: number
  metadata?: PersistedRecord | null
  updatedAt: Date
};

type PersistedCheckpointRecord = {
  id: string
  runId: string
  status: string
  stopReason: string
  goal?: string | null
  stepCount?: number | null
  messagesSnapshot?: unknown
  memorySummary?: unknown
  observations?: unknown
  metadata?: PersistedRecord | null
  createdAt: Date
  updatedAt?: Date
  run?: PersistedRunRecord
};

type PersistedMemoryEntryRecord = {
  id: string
  kind: 'preference' | 'project_context'
  content: string
  source: string
  updatedAt: Date
};

interface PersistRunInput {
  runId: string
  sessionId: string
  userId: string
  goal?: string
  status: string
  memoryMode: AgentRunResolvedConfig['memoryMode']
  allowMcp: boolean
  maxSteps: number
  promptPresetIds: string[]
  resumedFromCheckpointId?: string
}

export async function createAgentRunRecord(prismaClient: PrismaLike, input: PersistRunInput) {
  try {
    await prismaClient.agentRun.create({
      data: {
        id: input.runId,
        sessionId: input.sessionId,
        userId: input.userId,
        goal: input.goal,
        status: input.status,
        memoryMode: input.memoryMode,
        allowMcp: input.allowMcp,
        maxSteps: input.maxSteps,
        promptPresetIds: input.promptPresetIds,
        resumedFromCheckpointId: input.resumedFromCheckpointId,
      },
    });
  } catch (error) {
    if (isAgentPersistenceTableMissingError(error)) {
      console.warn('跳过 AgentRun 持久化，原因: Agent 持久化表缺失。');
      return;
    }
    throw error;
  }
}

export async function finalizeAgentRunRecord(
  prismaClient: PrismaLike,
  input: PersistRunInput & {
    stopReason?: string
    checkpoint?: AgentCheckpoint
    summary?: AgentRunSummary
  },
) {
  try {
    if (input.checkpoint) {
      await prismaClient.agentCheckpoint.create({
        data: serializeCheckpoint(input.checkpoint, input),
      });
    }

    await prismaClient.agentRun.update({
      where: { id: input.runId },
      data: {
        goal: input.summary?.goal ?? input.goal,
        status: normalizePersistedRunStatus(input.summary?.status ?? input.status),
        stopReason: input.checkpoint?.stopReason ?? input.stopReason,
        latestCheckpointId: input.checkpoint?.checkpointId,
        metadata: {
          summary: input.summary,
        } as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    if (isAgentPersistenceTableMissingError(error)) {
      console.warn('跳过 Agent 运行结果持久化，原因: Agent 持久化表缺失。');
      return;
    }
    throw error;
  }
}

export async function loadCheckpointForResume(
  prismaClient: PrismaLike,
  sessionId: string,
  checkpointId: string,
): Promise<{
  checkpoint?: AgentCheckpoint
  inheritedConfig?: AgentRunResolvedConfig
  error?: string
}> {
  const persisted = await prismaClient.agentCheckpoint.findUnique({
    where: { id: checkpointId },
    include: {
      run: true,
    },
  }).catch((error) => {
    if (isAgentPersistenceTableMissingError(error)) {
      return undefined;
    }
    throw error;
  }) as PersistedCheckpointRecord | undefined;

  if (!persisted) {
    return { error: '未找到对应的 checkpoint，可能已失效。请新开一轮任务。' };
  }

  if (persisted.run?.sessionId !== sessionId) {
    return { error: 'checkpoint 不属于当前会话，无法恢复。请新开一轮任务。' };
  }

  const parsed = parsePersistedCheckpoint(persisted);
  if (!parsed) {
    return { error: 'checkpoint 内容损坏，无法恢复。请新开一轮任务。' };
  }

  return {
    checkpoint: parsed,
    inheritedConfig: persisted.run ? extractRunConfig(persisted.run) : undefined,
  };
}

export async function getUserAgentMemoryEntries(
  prismaClient: PrismaLike,
  userId: string,
): Promise<AgentUserMemoryEntry[]> {
  const persisted = await prismaClient.agentMemoryEntry.findMany({
    where: {
      userId,
      scope: 'user',
    },
    orderBy: {
      updatedAt: 'desc',
    },
  }).catch((error) => {
    if (isAgentPersistenceTableMissingError(error)) {
      return [];
    }
    throw error;
  });

  if (persisted.length > 0) {
    return (persisted as PersistedMemoryEntryRecord[]).map(mapMemoryEntryRecord);
  }

  const user = await prismaClient.user.findUnique({
    where: { id: userId },
    select: { settings: true },
  });

  return readUserMemoryEntries((user as { settings?: unknown } | null | undefined)?.settings);
}

export async function replaceUserAgentMemoryEntries(
  prismaClient: PrismaLike,
  userId: string,
  entries: AgentUserMemoryEntry[],
) {
  await prismaClient.agentMemoryEntry.deleteMany({
    where: {
      userId,
      scope: 'user',
    },
  }).catch((error) => {
    if (isAgentPersistenceTableMissingError(error)) {
      return undefined;
    }
    throw error;
  });

  if (entries.length > 0) {
    await prismaClient.agentMemoryEntry.createMany({
      data: entries.map((entry) => ({
        id: entry.id,
        userId,
        sessionId: null,
        scope: 'user',
        kind: entry.kind,
        content: entry.content,
        source: entry.source,
        updatedAt: new Date(entry.updatedAt),
      })),
    }).catch((error) => {
      if (isAgentPersistenceTableMissingError(error)) {
        return undefined;
      }
      throw error;
    });
  }

  const user = await prismaClient.user.findUnique({
    where: { id: userId },
    select: { settings: true },
  });

  await prismaClient.user.update({
    where: { id: userId },
    data: {
      settings: writeUserMemoryEntries((user as { settings?: unknown } | null | undefined)?.settings, entries) as Prisma.InputJsonValue,
    },
  });
}

export async function mergeAndPersistUserMemoryEntries(
  prismaClient: PrismaLike,
  userId: string,
  messages: LLMMessage[],
) {
  const nextEntries = deriveUserMemoryEntries(messages);
  if (nextEntries.length === 0) return;

  const currentEntries = await getUserAgentMemoryEntries(prismaClient, userId);
  const merged = mergeUserMemoryEntries(currentEntries, nextEntries);
  await replaceUserAgentMemoryEntries(prismaClient, userId, merged);
}

export function toAgentPersistenceError(error: unknown): Error | undefined {
  if (!isAgentPersistenceTableMissingError(error)) {
    return undefined;
  }

  return new Error(AGENT_PERSISTENCE_SETUP_MESSAGE);
}

export function buildAgentRunViewModelFromMessage(message: Message): AgentRunViewModel | undefined {
  if (!isRecord(message.metadata) || !isRecord(message.metadata.agent)) {
    return undefined;
  }

  const agent = message.metadata.agent as PersistedRecord;
  const summary = isRecord(agent.summary) ? agent.summary : undefined;
  const checkpointMeta = getAgentCheckpointMeta(message.metadata);
  const checkpoints = checkpointMeta
    ? [{
        checkpointId: checkpointMeta.checkpointId,
        status: readString(agent.status) ?? 'paused',
        goal: readString(summary?.goal),
        resumable: checkpointMeta.resumable,
      } satisfies AgentCheckpointViewModel]
    : [];

  return {
    runId: readString(agent.runId) ?? `msg_${message.id}`,
    messageId: message.id,
    status: readString(agent.status) ?? 'unknown',
    goal: readString(summary?.goal),
    checkpointId: checkpointMeta?.checkpointId,
    resumedFromCheckpointId: readString(agent.resumedFromCheckpointId),
    latestRunnableCheckpoint: checkpoints.find((item) => item.resumable),
    checkpoints,
    recentEvents: [],
    memory: {
      session: isRecord(summary?.memorySummary)
        ? summary.memorySummary as unknown as AgentMemorySummary
        : undefined,
      userCount: readNumber(summary?.userMemoryEntryCount) ?? 0,
    },
    config: deriveConfigFromSummary(summary),
    source: 'metadata',
    latestCheckpointCreatedAt: undefined,
    updatedAt: message.createdAt ? new Date(message.createdAt).getTime() : undefined,
    stopReason: readString(summary?.stopReason),
    summary,
  };
}

export function getSessionAgentPreviewFromRuns(runs: AgentRunViewModel[]) {
  const latestRun = runs[0];
  const status = normalizeSessionStatus(latestRun?.status);
  return {
    status,
    hasRunnableCheckpoint: Boolean(latestRun?.latestRunnableCheckpoint),
    statusText: status
      ? status === 'paused' && latestRun?.latestRunnableCheckpoint
        ? '已暂停，可继续'
        : status === 'failed' && latestRun?.latestRunnableCheckpoint
          ? '执行失败，可恢复'
          : status === 'completed'
            ? '已完成'
            : '执行中'
      : undefined,
    latestAgentRunAt: latestRun?.updatedAt,
  };
}

function serializeCheckpoint(
  checkpoint: AgentCheckpoint,
  input: PersistRunInput,
) {
  return {
    id: checkpoint.checkpointId,
    runId: input.runId,
    status: checkpoint.status,
    stopReason: checkpoint.stopReason,
    goal: checkpoint.goal,
    stepCount: checkpoint.stepCount,
    messagesSnapshot: checkpoint.messages as unknown as Prisma.InputJsonValue,
    memorySummary: checkpoint.memorySummary as unknown as Prisma.InputJsonValue,
    observations: checkpoint.observations as unknown as Prisma.InputJsonValue,
    metadata: {
      runConfig: {
        promptPresetIds: input.promptPresetIds,
        memoryMode: input.memoryMode,
        allowMcp: input.allowMcp,
        maxSteps: input.maxSteps,
      },
    } satisfies Prisma.JsonObject,
  };
}

function parsePersistedCheckpoint(record: PersistedCheckpointRecord): AgentCheckpoint | undefined {
  const messages = Array.isArray(record.messagesSnapshot)
    ? record.messagesSnapshot as LLMMessage[]
    : undefined;
  const observations = Array.isArray(record.observations)
    ? record.observations
    : undefined;

  if (!messages || !observations) return undefined;

  return {
    checkpointId: record.id,
    runId: record.runId,
    createdAt: new Date(record.createdAt).getTime(),
    stepCount: typeof record.stepCount === 'number' ? record.stepCount : 0,
    status: normalizeCheckpointStatus(record.status),
    goal: typeof record.goal === 'string' ? record.goal : '',
    messages,
    steps: [],
    observations,
    memorySummary: isRecord(record.memorySummary) ? record.memorySummary as unknown as AgentMemorySummary : undefined,
    stopReason: record.stopReason,
  };
}

function mapMemoryEntryRecord(record: PersistedMemoryEntryRecord): AgentUserMemoryEntry {
  return {
    id: record.id,
    scope: 'user',
    kind: record.kind,
    content: record.content,
    source: record.source,
    updatedAt: new Date(record.updatedAt).getTime(),
  };
}

function extractRunConfig(run: PersistedRunRecord): AgentRunResolvedConfig {
  const metadata = isRecord(run.metadata) ? run.metadata : undefined;
  const summary = isRecord(metadata?.summary) ? metadata.summary : undefined;

  return normalizeRunConfig({
    promptPresetIds: Array.isArray(summary?.promptPresetIds)
      ? summary.promptPresetIds
      : Array.isArray(run.promptPresetIds)
        ? run.promptPresetIds
        : [],
    memoryMode: run.memoryMode === 'off' || run.memoryMode === 'session' || run.memoryMode === 'session+user'
      ? run.memoryMode
      : undefined,
    allowMcp: run.allowMcp,
    maxSteps: run.maxSteps,
  });
}

function deriveConfigFromSummary(summary?: PersistedRecord): AgentRunResolvedConfig {
  return normalizeRunConfig({
    promptPresetIds: Array.isArray(summary?.promptPresetIds) ? summary.promptPresetIds : [],
    memoryMode: summary?.memoryMode === 'off' || summary?.memoryMode === 'session' || summary?.memoryMode === 'session+user'
      ? summary.memoryMode
      : undefined,
    allowMcp: typeof summary?.allowMcp === 'boolean' ? summary.allowMcp : true,
    maxSteps: readNumber(summary?.maxSteps),
  });
}

function normalizeRunConfig(config: Partial<AgentRunResolvedConfig>): AgentRunResolvedConfig {
  const promptPresetIds = Array.isArray(config.promptPresetIds)
    ? config.promptPresetIds.filter((item): item is string => typeof item === 'string')
    : [];

  return {
    promptPresetIds,
    memoryMode: config.memoryMode === 'off' || config.memoryMode === 'session+user' ? config.memoryMode : 'session',
    allowMcp: typeof config.allowMcp === 'boolean' ? config.allowMcp : true,
    maxSteps: typeof config.maxSteps === 'number' ? config.maxSteps : 4,
  };
}

function normalizePersistedRunStatus(status: string) {
  return status === 'completed' || status === 'paused' || status === 'failed' || status === 'running'
    ? status
    : 'failed';
}

function normalizeCheckpointStatus(status: string): AgentRunStatus {
  return status === 'idle'
    || status === 'running'
    || status === 'waiting_tool'
    || status === 'compacting'
    || status === 'completed'
    || status === 'failed'
    || status === 'paused'
    ? status
    : 'failed';
}

function normalizeSessionStatus(value?: string): 'running' | 'paused' | 'failed' | 'completed' | undefined {
  return value === 'running' || value === 'paused' || value === 'failed' || value === 'completed'
    ? value
    : undefined;
}

function isRecord(value: unknown): value is PersistedRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}
