import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getCurrentUserServer } from '@/lib/server-auth';
import { decrypt } from '@/lib/encryption';
import registry from '@/lib/llm/registry';
import { readAttachmentContent, resolveChatAttachments } from '@/lib/attachments/service';
import { chatCompletionSchema } from '@/lib/validations';
import { unauthorizedResponse, errorResponse, validationErrorResponse } from '@/lib/api';
import { runAgentRound } from '@/lib/agent';
import { createChatLogRepository, createLlmExchangeLogSession } from '@/lib/chat-logs';
import type { ChatLogRepository, LlmExchangeLogSession } from '@/lib/chat-logs';
import {
  createAgentRunRecord,
  finalizeAgentRunRecord,
  getUserAgentMemoryEntries,
  loadCheckpointForResume,
  mergeAndPersistUserMemoryEntries,
  toAgentPersistenceError,
} from '@/lib/agent/persistence';
import { updateAssistantPartsFromStreamEvent } from '@/lib/agent/message-parts';
import type { AgentCheckpoint, AgentEvent, AgentRunSummary } from '@/lib/agent/types';
import { getAgentPersistenceErrorMessage, isAgentPersistenceTableMissingError } from '@/lib/agent/persistence-errors';
import type { AssistantMessagePart, StreamChunk } from '@/types/chat';
import { mergeUserSettings, toAgentBehaviorPreferences } from '@/types/settings';

interface ApiKeySelection {
  id: string;
  apiType: string;
  baseUrl: string;
  encryptedKey: string;
}

interface ChatAttachmentInput {
  id: string;
  name?: string;
  mimeType?: string;
  size?: number;
  extractedContent?: string;
}

interface ChatCompletionsDeps {
  prisma: typeof prisma;
  getCurrentUserServer: typeof getCurrentUserServer;
  rateLimit: (identifier: string, route: string) => Promise<{ success: boolean }>;
  decrypt: typeof decrypt;
  registry: typeof registry;
  runAgentRound: typeof runAgentRound;
  chatLogRepository: ChatLogRepository;
  createRequestId: () => string;
}

const defaultDeps: ChatCompletionsDeps = {
  prisma,
  getCurrentUserServer,
  rateLimit: async (identifier: string, route: string) => {
    const { rateLimit } = await import('@/lib/rate-limit');
    return await rateLimit(identifier, route);
  },
  decrypt,
  registry,
  runAgentRound,
  chatLogRepository: createChatLogRepository(prisma as never),
  createRequestId: () => `req_${crypto.randomUUID()}`,
};

export function createChatCompletionsHandler(overrides: Partial<ChatCompletionsDeps> = {}) {
  const deps: ChatCompletionsDeps = {
    ...defaultDeps,
    ...overrides,
  };
  deps.chatLogRepository = overrides.chatLogRepository ?? createChatLogRepository(deps.prisma as never);

  return async function POST(request: NextRequest) {
    let exchangeLog: LlmExchangeLogSession | undefined;

    try {
      const user = await deps.getCurrentUserServer();
      if (!user) {
        return unauthorizedResponse('未登录');
      }

      const rateLimitResult = await deps.rateLimit(user.id, '/api/chat/completions');
      if (!rateLimitResult.success) {
        return errorResponse('请求过于频繁，请稍后再试', 429);
      }

      const body = await request.json();
      const result = chatCompletionSchema.safeParse(body);

      if (!result.success) {
        return validationErrorResponse(result.error);
      }

      const { sessionId, messages, model, stream, apiKeyId, agent, requestMode } = result.data;
      if (result.data.attachments.length && !agent?.enabled) {
        return errorResponse('附件读取仅支持 Agent 模式', 400);
      }
      if (result.data.attachments.length && !sessionId) {
        return errorResponse('附件需要绑定当前会话后再发送', 400);
      }

      let attachments: Array<{ id: string; name: string; mimeType: string; size: number }> = [];
      try {
        attachments = sessionId
          ? await resolveChatAttachments({
              prisma: deps.prisma,
              userId: user.id,
              sessionId,
              requestedAttachments: result.data.attachments,
            })
          : [];
      } catch (error) {
        return errorResponse((error as Error).message || '附件解析失败', 400);
      }
      const originalMessages = messages.map((message) => ({
        role: message.role as 'user' | 'assistant' | 'system',
        content: message.content,
      }));
      const apiKeyRecord = await resolveApiKey(deps.prisma, user.id, apiKeyId);
      if (!apiKeyRecord) {
        return errorResponse('请先配置 API Key', 400);
      }

      const apiKey = deps.decrypt(apiKeyRecord.encryptedKey);
      const adapter = deps.registry.getAdapter(apiKeyRecord.apiType);
      if (!adapter) {
        const message = `不支持的 API 类型: ${apiKeyRecord.apiType}`;
        return errorResponse(message, 400);
      }

      const llmMessages = originalMessages;
      const userProfile = agent?.enabled
        ? await deps.prisma.user.findUnique({
            where: { id: user.id },
            select: { settings: true },
          })
        : null;
      const mergedUserSettings = mergeUserSettings(userProfile?.settings);
      const behaviorPreferences = toAgentBehaviorPreferences(mergedUserSettings);
      const resumeContext = agent?.enabled && agent.resumeFromCheckpointId && sessionId
        ? await loadCheckpointForResume(deps.prisma, sessionId, agent.resumeFromCheckpointId)
        : undefined;
      if (resumeContext?.error) {
        return errorResponse(resumeContext.error, 409);
      }
      const resolvedAgentConfig = {
        promptPresetIds:
          agent?.promptPresetIds
          ?? resumeContext?.inheritedConfig?.promptPresetIds
          ?? mergedUserSettings.enabledPromptPresetIds,
        memoryMode: agent?.memoryMode ?? resumeContext?.inheritedConfig?.memoryMode ?? 'session',
        allowMcp: agent?.allowMcp ?? resumeContext?.inheritedConfig?.allowMcp ?? mergedUserSettings.allowMcp ?? false,
        maxSteps: agent?.maxSteps ?? resumeContext?.inheritedConfig?.maxSteps ?? 4,
      } as const;
      const userMemoryEntries = agent?.enabled && resolvedAgentConfig.memoryMode === 'session+user'
        ? await getUserAgentMemoryEntries(deps.prisma, user.id)
        : [];
      const runId = agent?.enabled ? createAgentRunId() : undefined;
      exchangeLog = createLlmExchangeLogSession(deps.chatLogRepository, {
        requestId: deps.createRequestId(),
        userId: user.id,
        sessionId,
        apiKeyId: apiKeyRecord.id,
        model,
        stream,
        requestMode,
      });
      const logDraft = exchangeLog;

      if (stream) {
        let partialAssistantContent = '';
        let partialUsage: { promptTokens?: number; completionTokens?: number; totalTokens?: number } | undefined;
        let partialFinishReason: string | undefined;
        let streamEventCount = 0;
        let messageDeltaCount = 0;

        const response = new Response(
          createSseStream({
            run: async (emit) => {
              if (agent?.enabled) {
                let streamedAgentEventCount = 0;
                let streamedDoneEvent: AgentEvent | undefined;
                let streamedMessageDeltaCount = 0;

                if (sessionId && runId) {
                  await createAgentRunRecord(deps.prisma, {
                    runId,
                    sessionId,
                    userId: user.id,
                    goal: llmMessages.at(-1)?.content,
                    status: 'running',
                    promptPresetIds: [...resolvedAgentConfig.promptPresetIds],
                    memoryMode: resolvedAgentConfig.memoryMode,
                    allowMcp: resolvedAgentConfig.allowMcp,
                    maxSteps: resolvedAgentConfig.maxSteps,
                    resumedFromCheckpointId: agent.resumeFromCheckpointId,
                  });
                }

                const agentResult = await deps.runAgentRound(adapter, llmMessages, {
                  runId,
                  userId: user.id,
                  sessionId,
                  model,
                  apiKey,
                  baseUrl: apiKeyRecord.baseUrl,
                  allowMcp: resolvedAgentConfig.allowMcp,
                  promptPresetIds: resolvedAgentConfig.promptPresetIds,
                  maxSteps: resolvedAgentConfig.maxSteps,
                  resumeFromCheckpointId: agent.resumeFromCheckpointId,
                  memoryMode: resolvedAgentConfig.memoryMode,
                  resumedCheckpoint: resumeContext?.checkpoint,
                  userMemoryEntries,
                  behaviorPreferences,
                  attachments,
                  exchangeRecorder: logDraft.exchangeRecorder,
                  readAttachment: async (attachmentId: string) => {
                    if (!sessionId) {
                      throw new Error('附件需要绑定当前会话后再读取');
                    }

                    return readAttachmentContent({
                      prisma: deps.prisma,
                      userId: user.id,
                      sessionId,
                      attachmentId,
                    });
                  },
                  userSettings: mergedUserSettings,
                  retryPolicy: agent.retryPolicy,
                  onEvent: (event) => {
                    if (event.type === 'message.done') {
                      streamedDoneEvent = event;
                      return;
                    }
                    if (event.type === 'message.delta') {
                      streamedMessageDeltaCount += 1;
                      messageDeltaCount += 1;
                      partialAssistantContent += String(event.payload?.content ?? '');
                    }
                    streamedAgentEventCount += 1;
                    streamEventCount += 1;
                    emit(event);
                  },
                });
                partialAssistantContent = agentResult.finalResponse.content ?? partialAssistantContent;
                partialUsage = agentResult.finalResponse.usage;
                partialFinishReason = agentResult.finalResponse.finishReason;

                if (streamedAgentEventCount === 0) {
                  for (const event of agentResult.events) {
                    if (event.type === 'message.done') {
                      continue;
                    }
                    streamEventCount += 1;
                    emit(event);
                  }
                }

                if (streamedMessageDeltaCount === 0 && agentResult.finalResponse.content) {
                  for (const chunk of chunkText(agentResult.finalResponse.content)) {
                    messageDeltaCount += 1;
                    streamEventCount += 1;
                    partialAssistantContent += chunk;
                    emit({
                      type: 'message.delta',
                      payload: { content: chunk },
                    });
                  }
                }

                emit(
                  streamedDoneEvent
                  ?? {
                    type: 'message.done',
                    payload: {
                      content: agentResult.finalResponse.content,
                      usage: agentResult.finalResponse.usage,
                      finishReason: agentResult.finalResponse.finishReason,
                    },
                  },
                );

                const assistantParts = buildAssistantPartsFromEvents(agentResult.events, agentResult.finalResponse.content ?? '');

                if (sessionId && agentResult.finalResponse.content) {
                  await saveMessages(
                    deps.prisma,
                    sessionId,
                    messages,
                    agentResult.finalResponse.content,
                    model,
                    agentResult.finalResponse.usage,
                    agentResult.summary,
                    agentResult.checkpoint,
                    assistantParts,
                    attachments,
                    requestMode,
                  );
                  await finalizeAgentRunRecord(deps.prisma, {
                    runId: agentResult.summary.runId || runId!,
                    sessionId,
                    userId: user.id,
                    goal: agentResult.summary.goal,
                    status: agentResult.summary.status,
                    promptPresetIds: [...resolvedAgentConfig.promptPresetIds],
                    memoryMode: resolvedAgentConfig.memoryMode,
                    allowMcp: resolvedAgentConfig.allowMcp,
                    maxSteps: resolvedAgentConfig.maxSteps,
                    resumedFromCheckpointId: agent.resumeFromCheckpointId,
                    stopReason: agentResult.checkpoint?.stopReason,
                    checkpoint: agentResult.checkpoint,
                    summary: agentResult.summary,
                  });
                }

                if (resolvedAgentConfig.memoryMode === 'session+user') {
                  await mergeAndPersistUserMemoryEntries(deps.prisma, user.id, llmMessages);
                }

                await deps.prisma.apiKey.update({
                  where: { id: apiKeyRecord.id },
                  data: { lastUsedAt: new Date() },
                });

              } else {
                const generator = adapter.streamComplete(llmMessages, {
                  model,
                  apiKey,
                  baseUrl: apiKeyRecord.baseUrl,
                  exchangeRecorder: logDraft.exchangeRecorder,
                });

                for await (const chunk of generator) {
                  if (chunk.content) {
                    partialAssistantContent += chunk.content;
                    messageDeltaCount += 1;
                    streamEventCount += 1;
                    emit({
                      type: 'message.delta',
                      payload: {
                        content: chunk.content,
                      },
                    });
                  }
                  if (chunk.usage) {
                    partialUsage = {
                      promptTokens: chunk.usage.promptTokens,
                      completionTokens: chunk.usage.completionTokens,
                      totalTokens: chunk.usage.totalTokens,
                    };
                  }
                  if (chunk.finishReason) {
                    partialFinishReason = chunk.finishReason;
                  }
                }

                emit({
                  type: 'message.done',
                  payload: {
                    content: partialAssistantContent,
                    usage: partialUsage,
                    finishReason: partialFinishReason,
                  },
                });

                if (sessionId && partialAssistantContent) {
                  await saveMessages(
                    deps.prisma,
                    sessionId,
                    messages,
                    partialAssistantContent,
                    model,
                    partialUsage,
                    undefined,
                    undefined,
                    undefined,
                    attachments,
                    requestMode,
                  );
                }

                await deps.prisma.apiKey.update({
                  where: { id: apiKeyRecord.id },
                  data: { lastUsedAt: new Date() },
                });

              }
            },
            onError: async () => {},
          }),
          {
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
              'x-request-id': logDraft.requestId,
            },
          },
        );
        return logDraft.withRequestId(response);
      }

      if (agent?.enabled) {
        if (sessionId && runId) {
          await createAgentRunRecord(deps.prisma, {
            runId,
            sessionId,
            userId: user.id,
            goal: llmMessages.at(-1)?.content,
            status: 'running',
            promptPresetIds: [...resolvedAgentConfig.promptPresetIds],
            memoryMode: resolvedAgentConfig.memoryMode,
            allowMcp: resolvedAgentConfig.allowMcp,
            maxSteps: resolvedAgentConfig.maxSteps,
            resumedFromCheckpointId: agent.resumeFromCheckpointId,
          });
        }

        const agentResult = await deps.runAgentRound(adapter, llmMessages, {
          runId,
          userId: user.id,
          sessionId,
          model,
          apiKey,
          baseUrl: apiKeyRecord.baseUrl,
          allowMcp: resolvedAgentConfig.allowMcp,
          promptPresetIds: resolvedAgentConfig.promptPresetIds,
          maxSteps: resolvedAgentConfig.maxSteps,
          resumeFromCheckpointId: agent.resumeFromCheckpointId,
          memoryMode: resolvedAgentConfig.memoryMode,
          resumedCheckpoint: resumeContext?.checkpoint,
          userMemoryEntries,
          behaviorPreferences,
          attachments,
          exchangeRecorder: logDraft.exchangeRecorder,
          readAttachment: async (attachmentId: string) => {
            if (!sessionId) {
              throw new Error('附件需要绑定当前会话后再读取');
            }

            return readAttachmentContent({
              prisma: deps.prisma,
              userId: user.id,
              sessionId,
              attachmentId,
            });
          },
          userSettings: mergedUserSettings,
          retryPolicy: agent.retryPolicy,
        });
        const assistantParts = buildAssistantPartsFromEvents(agentResult.events, agentResult.finalResponse.content ?? '');

        if (sessionId && agentResult.finalResponse.content) {
          await saveMessages(
            deps.prisma,
            sessionId,
            messages,
            agentResult.finalResponse.content,
            model,
            agentResult.finalResponse.usage,
            agentResult.summary,
            agentResult.checkpoint,
            assistantParts,
            attachments,
            requestMode,
          );
          await finalizeAgentRunRecord(deps.prisma, {
            runId: agentResult.summary.runId || runId!,
            sessionId,
            userId: user.id,
            goal: agentResult.summary.goal,
            status: agentResult.summary.status,
            promptPresetIds: [...resolvedAgentConfig.promptPresetIds],
            memoryMode: resolvedAgentConfig.memoryMode,
            allowMcp: resolvedAgentConfig.allowMcp,
            maxSteps: resolvedAgentConfig.maxSteps,
            resumedFromCheckpointId: agent.resumeFromCheckpointId,
            stopReason: agentResult.checkpoint?.stopReason,
            checkpoint: agentResult.checkpoint,
            summary: agentResult.summary,
          });
        }

        if (resolvedAgentConfig.memoryMode === 'session+user') {
          await mergeAndPersistUserMemoryEntries(deps.prisma, user.id, llmMessages);
        }

        await deps.prisma.apiKey.update({
          where: { id: apiKeyRecord.id },
          data: { lastUsedAt: new Date() },
        });

        return logDraft.withRequestId(Response.json({
          success: true,
          message: 'Success',
          data: {
            ...agentResult.finalResponse,
            events: agentResult.events,
            runId: agentResult.summary.runId || runId,
            checkpointId: agentResult.checkpoint?.checkpointId ?? agentResult.summary.checkpointId,
          },
        }));
      }

      const response = await adapter.complete(llmMessages, {
        model,
        apiKey,
        baseUrl: apiKeyRecord.baseUrl,
        exchangeRecorder: logDraft.exchangeRecorder,
      });

      if (sessionId && response.content) {
        await saveMessages(
          deps.prisma,
          sessionId,
          messages,
          response.content,
          model,
          response.usage,
          undefined,
          undefined,
          undefined,
          attachments,
          requestMode,
        );
      }

      await deps.prisma.apiKey.update({
        where: { id: apiKeyRecord.id },
        data: { lastUsedAt: new Date() },
      });

      return logDraft.withRequestId(Response.json({
        success: true,
        message: 'Success',
        data: response,
      }));
    } catch (error) {
      const persistenceError = toAgentPersistenceError(error);
      if (!exchangeLog) {
        if (persistenceError) {
          return errorResponse(persistenceError.message, 503);
        }
        return errorResponse('聊天请求失败', 500);
      }
      if (persistenceError) {
        return exchangeLog.withRequestId(errorResponse(persistenceError.message, 503));
      }
      return exchangeLog.withRequestId(errorResponse('聊天请求失败', 500));
    }
  };
}

export const POST = createChatCompletionsHandler();

function createSseStream({
  run,
  onError,
}: {
  run: (emit: (event: StreamChunk) => void) => Promise<void>;
  onError?: (error: unknown) => Promise<void> | void;
}): ReadableStream {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const emit = (event: StreamChunk) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        await run(emit);
      } catch (error) {
        await onError?.(error);
        const message = isAgentPersistenceTableMissingError(error)
          ? getAgentPersistenceErrorMessage('Agent 功能')
          : (error as Error).message || 'Unknown stream error';
        emit({
          type: 'error',
          payload: {
            message,
          },
        });
      } finally {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }
    },
  });
}

async function resolveApiKey(prismaClient: typeof prisma, userId: string, apiKeyId?: string): Promise<ApiKeySelection | null> {
  if (apiKeyId) {
    const selected = await prismaClient.apiKey.findFirst({
      where: {
        id: apiKeyId,
        userId,
        isActive: true,
      },
      select: {
        id: true,
        apiType: true,
        baseUrl: true,
        encryptedKey: true,
      },
    });

    if (selected) return selected;
  }

  const fallback = await prismaClient.apiKey.findFirst({
    where: { userId, isActive: true },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      apiType: true,
      baseUrl: true,
      encryptedKey: true,
    },
  });

  return fallback;
}

function chunkText(text: string): string[] {
  const chunks: string[] = [];
  const size = 48;

  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }

  return chunks;
}

function buildAssistantPartsFromEvents(events: AgentEvent[], assistantContent: string): AssistantMessagePart[] {
  const parts = events.reduce(
    (current, event) => updateAssistantPartsFromStreamEvent(current, event),
    [] as AssistantMessagePart[],
  );

  const hasFinalPart = parts.some((part) => part.kind === 'final_content');
  if (!hasFinalPart && assistantContent) {
    return [
      ...parts,
      {
        kind: 'final_content',
        text: assistantContent,
      },
    ];
  }

  return parts;
}

async function saveMessages(
  prismaClient: typeof prisma,
  sessionId: string,
  userMessages: Array<{ role: string; content: string }>,
  assistantContent: string,
  model: string,
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number },
  agentSummary?: AgentRunSummary,
  checkpoint?: AgentCheckpoint,
  assistantParts?: AssistantMessagePart[],
  attachments?: ChatAttachmentInput[],
  requestMode: 'default' | 'regenerate' = 'default',
) {
  try {
    const assistantAgentMetadata = agentSummary
      ? {
        runId: agentSummary.runId ?? checkpoint?.runId ?? `run_${Date.now()}`,
        status: agentSummary.status,
        parts: assistantParts ?? [],
        checkpoint: checkpoint
          ? {
            checkpointId: checkpoint.checkpointId,
            resumable: checkpoint.status === 'paused' || checkpoint.status === 'failed',
            label: '继续处理',
          }
          : undefined,
        resumedFromCheckpointId: agentSummary.resumedFromCheckpointId,
        summary: agentSummary,
      }
      : undefined;

    const lastUserMessage = [...userMessages].reverse().find((m) => m.role === 'user');
    if (lastUserMessage && requestMode !== 'regenerate') {
      await prismaClient.message.create({
        data: {
          sessionId,
          role: 'user',
          content: lastUserMessage.content,
          metadata: {
            attachments: attachments?.map((attachment) => ({
              id: attachment.id,
              name: attachment.name,
              mimeType: attachment.mimeType,
              size: attachment.size,
            })) ?? [],
          } as unknown as Prisma.InputJsonValue,
        },
      });
    }

    await prismaClient.message.create({
      data: {
        sessionId,
        role: 'assistant',
        content: assistantContent,
        model,
        tokens: usage?.totalTokens,
        metadata: (agentSummary
          ? {
              agent: assistantAgentMetadata,
            }
          : undefined) as unknown as Prisma.InputJsonValue,
      },
    });

    await prismaClient.session.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() },
    });
    return true;
  } catch (error) {
    return false;
  }
}

function createAgentRunId() {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
