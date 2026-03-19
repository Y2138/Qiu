import type { Prisma, PrismaClient } from '@prisma/client';
import type {
  LLMExchangeErrorPayload,
  LLMExchangeRecorder,
  LLMExchangeRequestPayload,
  LLMExchangeResponsePayload,
} from '@/lib/llm/adapters/base';

export type ChatLogStatus = 'success' | 'failed';

export interface ChatLogRecord {
  requestId: string;
  userId?: string;
  sessionId?: string;
  apiKeyId?: string;
  provider?: string;
  model?: string;
  stream?: boolean;
  requestMode?: string;
  status: ChatLogStatus;
  durationMs?: number;
  startedAt: Date;
  completedAt?: Date;
  createdAt?: Date;
  llmRequest: LLMExchangeRequestPayload | null;
  llmResponse: LLMExchangeResponsePayload | null;
  error: { stage: string; message: string; type?: string } | null;
}

export interface ChatLogListResult {
  items: ChatLogRecord[];
  nextCursor: string | null;
}

export interface ChatLogRepository {
  save(entry: ChatLogRecord): Promise<ChatLogRecord>;
  list(params?: {
    cursor?: string;
    take?: number;
    userId?: string;
    sessionId?: string;
    provider?: string;
    model?: string;
    status?: ChatLogStatus;
  }): Promise<ChatLogListResult>;
  deleteOlderThan(before: Date): Promise<number>;
}

export interface LlmExchangeLogContext {
  requestId: string;
  userId?: string;
  sessionId?: string;
  apiKeyId?: string;
  model?: string;
  stream?: boolean;
  requestMode?: string;
}

export interface LlmExchangeLogSession {
  requestId: string;
  exchangeRecorder: LLMExchangeRecorder;
  withRequestId: (response: Response) => Response;
}

interface RecorderState {
  context: LlmExchangeLogContext;
  startedAt: Date;
  llmRequest: LLMExchangeRequestPayload | null;
  llmResponse: LLMExchangeResponsePayload | null;
  error: { stage: string; message: string; type?: string } | null;
  persisted: boolean;
}

class RepositoryBackedLlmExchangeRecorder implements LLMExchangeRecorder {
  private readonly state: RecorderState;

  constructor(
    private readonly repository: ChatLogRepository,
    context: LlmExchangeLogContext,
  ) {
    this.state = {
      context,
      startedAt: new Date(),
      llmRequest: null,
      llmResponse: null,
      error: null,
      persisted: false,
    };
  }

  captureLlmRequest(payload: LLMExchangeRequestPayload): void {
    this.state.llmRequest = sanitizeRequest(payload);
    this.state.context.model = payload.model;
  }

  captureLlmResponse(payload: LLMExchangeResponsePayload): void {
    this.state.llmResponse = {
      providerResponseId: payload.providerResponseId,
      content: payload.content,
      finishReason: payload.finishReason,
      usage: payload.usage,
      toolCalls: payload.toolCalls,
    };
    void this.persist('success');
  }

  captureLlmError(payload: LLMExchangeErrorPayload): void {
    this.state.error = {
      stage: payload.stage,
      message: payload.message,
    };
    void this.persist('failed');
  }

  withRequestId(response: Response) {
    response.headers.set('x-request-id', this.state.context.requestId);
    return response;
  }

  private async persist(status: ChatLogStatus) {
    if (this.state.persisted) return;
    this.state.persisted = true;

    const completedAt = new Date();
    await this.repository.save({
      requestId: this.state.context.requestId,
      userId: this.state.context.userId,
      sessionId: this.state.context.sessionId,
      apiKeyId: this.state.context.apiKeyId,
      provider: this.state.llmRequest?.provider,
      model: this.state.context.model,
      stream: this.state.context.stream,
      requestMode: this.state.context.requestMode,
      status,
      durationMs: completedAt.getTime() - this.state.startedAt.getTime(),
      startedAt: this.state.startedAt,
      completedAt,
      createdAt: completedAt,
      llmRequest: this.state.llmRequest,
      llmResponse: this.state.llmResponse,
      error: this.state.error,
    });
  }
}

export class PrismaChatLogRepository implements ChatLogRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(entry: ChatLogRecord): Promise<ChatLogRecord> {
    await this.prisma.chatRequestLog.create({
      data: {
        requestId: entry.requestId,
        userId: entry.userId,
        sessionId: entry.sessionId,
        apiKeyId: entry.apiKeyId,
        provider: entry.provider,
        model: entry.model,
        stream: entry.stream,
        requestMode: entry.requestMode,
        status: entry.status,
        durationMs: entry.durationMs,
        startedAt: entry.startedAt,
        completedAt: entry.completedAt,
        createdAt: entry.createdAt,
        llmRequest: entry.llmRequest as unknown as Prisma.InputJsonValue,
        llmResponse: entry.llmResponse as unknown as Prisma.InputJsonValue,
        error: entry.error as unknown as Prisma.InputJsonValue,
      },
    });
    return entry;
  }

  async list(): Promise<ChatLogListResult> {
    return {
      items: [],
      nextCursor: null,
    };
  }

  async deleteOlderThan(before: Date): Promise<number> {
    const result = await this.prisma.chatRequestLog.deleteMany({
      where: {
        createdAt: {
          lt: before,
        },
      },
    });
    return result.count;
  }
}

export function createChatLogRepository(prisma: PrismaClient): ChatLogRepository {
  if (!('chatRequestLog' in prisma)) {
    return {
      async save(entry) {
        return entry;
      },
      async list() {
        return { items: [], nextCursor: null };
      },
      async deleteOlderThan() {
        return 0;
      },
    };
  }

  return new PrismaChatLogRepository(prisma);
}

export function createLlmExchangeLogSession(
  repository: ChatLogRepository,
  context: LlmExchangeLogContext,
): LlmExchangeLogSession {
  const recorder = new RepositoryBackedLlmExchangeRecorder(repository, context);

  return {
    requestId: context.requestId,
    exchangeRecorder: recorder,
    withRequestId(response) {
      return recorder.withRequestId(response);
    },
  };
}

export async function cleanupChatLogs({
  repository,
  retentionDays = 7,
  now = new Date(),
}: {
  repository: ChatLogRepository;
  retentionDays?: number;
  now?: Date;
}) {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  const deletedCount = await repository.deleteOlderThan(cutoff);
  return {
    deletedCount,
    cutoff,
  };
}

function sanitizeRequest(payload: LLMExchangeRequestPayload): LLMExchangeRequestPayload {
  return {
    provider: payload.provider,
    baseUrl: payload.baseUrl,
    model: payload.model,
    messages: Array.isArray(payload.messages) ? payload.messages : [],
    system: payload.system,
    temperature: payload.temperature,
    maxTokens: payload.maxTokens,
    topP: payload.topP,
    stop: payload.stop,
    tools: payload.tools,
    toolChoice: payload.toolChoice,
  };
}
