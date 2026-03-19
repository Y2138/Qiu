import type { BaseLLMAdapter, LLMMessage, LLMResponse, LLMToolResult } from '@/lib/llm/adapters/base';
import { AgentCheckpointManager, InMemoryCheckpointStore } from '@/lib/agent/checkpoint-manager';
import { AgentContextManager } from '@/lib/agent/context-manager';
import { buildRunSummary } from '@/lib/agent/run-summary';
import type {
  AgentEvent,
  AgentExecutionResult,
  AgentObservation,
  AgentRunContext,
  AgentRunState,
  AgentToolRuntime,
  PlanStep,
} from '@/lib/agent/types';

interface AgentRuntimeOptions {
  model: string;
  apiKey: string;
  baseUrl?: string;
  onEvent?: (event: AgentEvent) => void;
  exchangeRecorder?: import('@/lib/llm/adapters/base').LLMExchangeRecorder;
}

export class AgentRuntime {
  private readonly contextManager = new AgentContextManager();

  private readonly checkpoints = new AgentCheckpointManager(new InMemoryCheckpointStore());

  constructor(
    private readonly adapter: BaseLLMAdapter,
    private readonly tools: AgentToolRuntime,
    private readonly options: AgentRuntimeOptions,
  ) {}

  async run(initialMessages: LLMMessage[], context: AgentRunContext): Promise<AgentExecutionResult> {
    const events: AgentEvent[] = [];
    const toolsUsed: Array<{
      name: string;
      success: boolean;
      source: 'builtin' | 'internal' | 'third-party' | 'mcp' | 'local';
      errorType?: 'validation' | 'timeout' | 'execution' | 'policy';
      latencyMs?: number;
    }> = [];
    const errors: string[] = [];
    const state = this.initializeState(initialMessages, context);
    const allowedToolSet = this.resolveAllowedToolSet();
    const toolFailureMode = this.resolveToolFailureMode();
    const toolDefinitions = this.tools.getToolDefinitions();

    this.pushEvent(events, {
      type: 'agent.status',
      payload: {
        runId: state.runId,
        state: context.resumedCheckpoint ? 'thinking' : 'started',
        label: context.resumedCheckpoint ? '已从 checkpoint 恢复，继续处理' : '开始处理你的请求',
        resumedFromCheckpointId: context.resumedCheckpoint?.checkpointId,
      },
    });

    let pendingToolResults: LLMToolResult[] = [];
    let finalResponse: LLMResponse | null = null;
    let hasFailure = false;
    let executedTurns = 0;

    for (let turnNumber = 1; turnNumber <= context.maxSteps; turnNumber += 1) {
      executedTurns = turnNumber;
      state.status = 'running';
      const step = this.createStep(state.steps.length + 1);
      state.steps.push(step);
      this.pushEvent(events, {
        type: 'agent.status',
        payload: {
          runId: state.runId,
          state: 'thinking',
          label: '正在分析任务并推进下一步',
        },
      });

      for (const event of this.contextManager.maintainState(state, context, toolDefinitions, 'pre_turn')) {
        this.pushEvent(events, event);
      }

      const turnContext = this.contextManager.prepareTurn(state, context, toolDefinitions);
      state.lastContextDiagnostics = turnContext.diagnostics;
      const submittedToolResults = pendingToolResults;
      const response = await this.adapter.completeWithTools(turnContext.messages, {
        model: this.options.model,
        apiKey: this.options.apiKey,
        baseUrl: this.options.baseUrl,
        tools: toolDefinitions,
        toolChoice: 'auto',
        toolResults: submittedToolResults,
      });
      pendingToolResults = [];

      if (response.content) {
        state.workingMessages.push({ role: 'assistant', content: response.content });
      }

      const calls = response.toolCalls ?? [];
      if (calls.length === 0) {
        step.title = 'Finalize response';
        step.status = 'completed';

        for (const event of this.contextManager.maintainState(state, context, toolDefinitions, 'post_response')) {
          this.pushEvent(events, event);
        }

        finalResponse = await this.streamFinalResponse(
          turnContext.messages,
          submittedToolResults,
          response,
          events,
        );
        this.options.exchangeRecorder?.captureLlmRequest({
          provider: this.adapter.apiType,
          baseUrl: this.options.baseUrl,
          model: this.options.model,
          messages: turnContext.messages,
          tools: toolDefinitions,
          toolChoice: 'auto',
          toolResults: undefined,
        } as unknown as import('@/lib/llm/adapters/base').LLMExchangeRequestPayload);
        this.options.exchangeRecorder?.captureLlmResponse({
          providerResponseId: finalResponse.id,
          content: finalResponse.content,
          finishReason: finalResponse.finishReason,
          usage: finalResponse.usage,
          toolCalls: finalResponse.toolCalls,
        });
        state.status = 'completed';
        state.stopReason = 'final';
        break;
      }

      step.title = `Execute ${calls.length} tool call(s)`;
      state.status = 'waiting_tool';
      this.pushEvent(events, {
        type: 'agent.status',
        payload: {
          runId: state.runId,
          state: 'tool_running',
          label: `正在调用 ${calls.length} 个工具`,
        },
      });

      let shouldStop = false;
      for (const call of calls) {
        this.pushEvent(events, {
          type: 'agent.tool',
          payload: {
            id: call.id,
            toolName: call.name,
            state: 'started',
          },
        });

        const toolResult = await this.tools.executeToolCall(call, context, allowedToolSet);
        toolsUsed.push({
          name: call.name,
          success: toolResult.success,
          source: toolResult.source,
          errorType: toolResult.errorType,
          latencyMs: toolResult.latencyMs,
        });

        const observation = this.createObservation(toolResult);
        state.observations.push(observation);
        pendingToolResults.push({
          toolCallId: toolResult.toolCallId,
          name: toolResult.name,
          output: toolResult.output,
        });

        for (const event of this.contextManager.maintainState(state, context, toolDefinitions, 'post_tool')) {
          this.pushEvent(events, event);
        }

        this.pushEvent(events, {
          type: 'agent.tool',
          payload: {
            id: toolResult.toolCallId,
            toolName: toolResult.name,
            state: toolResult.success ? 'success' : 'failed',
            summary: toolResult.success ? this.compactText(toolResult.output) : toolResult.errorType ?? 'execution',
            latencyMs: toolResult.latencyMs,
          },
        });

        if (!toolResult.success) {
          errors.push(toolResult.output);
          hasFailure = true;
          step.status = 'failed';
          step.detail = `Tool ${toolResult.name} failed`;

          if (toolFailureMode === 'stop') {
            state.status = 'paused';
            state.stopReason = 'tool_failure';
            const checkpointResult = this.checkpoints.createCheckpoint(state, 'tool_failure', executedTurns);
            state.currentCheckpoint = checkpointResult.checkpoint;
            for (const event of checkpointResult.events) {
              this.pushEvent(events, event);
            }
            this.pushEvent(events, {
              type: 'agent.status',
              payload: {
                runId: state.runId,
                state: 'paused',
                label: '处理已暂停，可继续',
              },
            });
            shouldStop = true;
            break;
          }
        }
      }

      if (shouldStop) {
        break;
      }

      if (step.status !== 'failed') {
        step.status = 'completed';
      }
    }

    if (!finalResponse) {
      const fallbackText = hasFailure
        ? 'Agent paused due to tool execution failure.'
        : 'Agent exceeded step limit before producing a final response.';
      finalResponse = {
        id: `fallback_${Date.now()}`,
        content: fallbackText,
        model: this.options.model,
      };
      errors.push(fallbackText);

      if (!state.currentCheckpoint) {
        state.status = hasFailure ? 'paused' : 'failed';
        state.stopReason = hasFailure ? 'tool_failure' : 'max_steps';
        const checkpointResult = this.checkpoints.createCheckpoint(state, state.stopReason, executedTurns);
        state.currentCheckpoint = checkpointResult.checkpoint;
        for (const event of checkpointResult.events) {
          this.pushEvent(events, event);
        }
      }

      this.pushEvent(events, {
        type: 'error',
        payload: {
          runId: state.runId,
          checkpointId: state.currentCheckpoint.checkpointId,
          message: fallbackText,
        },
      });

      this.pushEvent(events, {
        type: 'agent.status',
        payload: {
          runId: state.runId,
          state: state.status === 'paused' ? 'paused' : 'failed',
          label: state.status === 'paused' ? '处理已暂停，可继续' : '处理未顺利完成',
        },
      });
    } else {
      this.pushEvent(events, {
        type: 'agent.status',
        payload: {
          runId: state.runId,
          state: 'completed',
          label: '处理完成',
        },
      });
    }

    const summary = buildRunSummary({
      state,
      context,
      turnCount: executedTurns,
      toolsUsed,
      errors,
      latencyMs: Date.now() - context.startedAt,
      contextBudget: this.contextManager.resolveBudget(context, toolDefinitions),
    });

    this.pushEvent(events, {
      type: 'message.done',
      payload: {
        content: finalResponse.content ?? '',
        usage: finalResponse.usage,
        finishReason: finalResponse.finishReason,
      },
    });

    return {
      finalResponse,
      events,
      summary,
      checkpoint: state.currentCheckpoint,
      state,
    };
  }

  private initializeState(initialMessages: LLMMessage[], context: AgentRunContext): AgentRunState {
    const resumed = context.resumedCheckpoint;
    const goal = this.deriveGoal(resumed?.messages ?? initialMessages);
    return {
      runId: context.runId ?? resumed?.runId ?? `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      status: 'idle',
      goal: resumed?.goal ?? goal,
      steps: resumed?.steps.map((step) => ({ ...step })) ?? [],
      workingMessages: resumed?.messages ? [...resumed.messages] : [...initialMessages],
      observations: resumed?.observations.map((item) => ({ ...item })) ?? [],
      memorySummary: resumed?.memorySummary,
      currentCheckpoint: resumed,
      resumedFromCheckpointId: resumed?.checkpointId,
      stopReason: resumed?.stopReason,
    };
  }

  private createStep(order: number): PlanStep {
    return {
      id: `step_${order}`,
      order,
      title: order === 1 ? 'Analyze user intent' : 'Plan next action',
      status: 'running',
    };
  }

  private pushEvent(events: AgentEvent[], event: AgentEvent) {
    events.push(event);
    this.options.onEvent?.(event);
  }

  private async streamFinalResponse(
    messages: LLMMessage[],
    toolResults: LLMToolResult[],
    initialResponse: LLMResponse,
    events: AgentEvent[],
  ): Promise<LLMResponse> {
    let streamedContent = '';
    let usage = initialResponse.usage;
    let finishReason = initialResponse.finishReason;

    for await (const chunk of this.adapter.streamCompleteWithTools(messages, {
      model: this.options.model,
      apiKey: this.options.apiKey,
      baseUrl: this.options.baseUrl,
      toolResults,
      toolChoice: 'none',
      exchangeRecorder: this.options.exchangeRecorder,
    })) {
      if (chunk.content) {
        streamedContent += chunk.content;
        this.pushEvent(events, {
          type: 'message.delta',
          payload: { content: chunk.content },
        });
      }

      if (chunk.usage) {
        usage = {
          promptTokens: chunk.usage.promptTokens ?? usage?.promptTokens ?? 0,
          completionTokens: chunk.usage.completionTokens ?? usage?.completionTokens ?? 0,
          totalTokens: chunk.usage.totalTokens ?? usage?.totalTokens ?? 0,
        };
      }

      if (chunk.finishReason) {
        finishReason = chunk.finishReason;
      }
    }

    if (!streamedContent) {
      streamedContent = initialResponse.content ?? '';
    }

    return {
      ...initialResponse,
      content: streamedContent,
      usage,
      finishReason,
    };
  }

  private compactText(text: string) {
    return text.length > 120 ? `${text.slice(0, 120)}...` : text
  }

  private createObservation(toolResult: LLMToolResult & {
    success: boolean;
    errorType?: 'validation' | 'timeout' | 'execution' | 'policy';
    latencyMs?: number;
  }): AgentObservation {
    return {
      id: `obs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      toolName: toolResult.name,
      output: toolResult.output,
      success: toolResult.success,
      errorType: toolResult.errorType,
      latencyMs: toolResult.latencyMs,
      createdAt: Date.now(),
    };
  }

  private resolveAllowedToolSet(): Set<string> | undefined {
    return undefined;
  }

  private resolveToolFailureMode(): 'stop' | 'continue' {
    return 'stop';
  }

  private deriveGoal(messages: LLMMessage[]): string {
    const userMessage = [...messages].reverse().find((message) => message.role === 'user');
    return userMessage?.content.slice(0, 240) || 'Complete the current user request';
  }
}

export const PlannerExecutor = AgentRuntime;
