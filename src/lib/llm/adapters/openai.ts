import OpenAI from 'openai';
import {
  BaseLLMAdapter,
  LLMMessage,
  LLMRequestOptions,
  LLMResponse,
  LLMStreamChunk,
  LLMToolDefinition,
} from './base';

export class OpenAIAdapter extends BaseLLMAdapter {
  readonly apiType = 'openai';

  private getClient(apiKey: string, baseUrl?: string): OpenAI {
    return new OpenAI({
      apiKey,
      dangerouslyAllowBrowser: false,
      baseURL: baseUrl,
    });
  }

  private mapTools(tools?: LLMToolDefinition[]): OpenAI.Chat.ChatCompletionTool[] | undefined {
    if (!tools || tools.length === 0) return undefined;
    return tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema as Record<string, unknown>,
      },
    }));
  }

  private buildChatMessages(
    messages: LLMMessage[],
    toolResults?: LLMRequestOptions['toolResults'],
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    const chatMessages: OpenAI.Chat.ChatCompletionMessageParam[] = messages.map(
      (message) => ({
        role: message.role,
        content: message.content,
      }),
    );

    if (toolResults) {
      for (const toolResult of toolResults) {
        chatMessages.push({
          role: 'user',
          content: `[TOOL_RESULT name=${toolResult.name} id=${toolResult.toolCallId}] ${toolResult.output}`,
        });
      }
    }

    return chatMessages;
  }

  async complete(
    messages: LLMMessage[],
    options?: LLMRequestOptions,
  ): Promise<LLMResponse> {
    const client = this.getClient(options?.apiKey || '', options?.baseUrl);
    const model = options?.model || 'gpt-4o';
    const recorder = options?.exchangeRecorder;
    const startTime = Date.now();
    const chatMessages = this.buildChatMessages(messages, options?.toolResults);

    const requestParams = {
      model,
      messages: chatMessages,
      temperature: options?.temperature,
      max_tokens: options?.maxTokens,
      top_p: options?.topP,
      stream: false,
      stop: options?.stop,
      tools: this.mapTools(options?.tools),
      tool_choice: options?.toolChoice,
    };

    if (recorder) {
      recorder.captureLlmRequest({
        provider: this.apiType,
        baseUrl: options?.baseUrl,
        model,
        messages: chatMessages,
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
        topP: options?.topP,
        stop: options?.stop,
        tools: options?.tools,
        toolChoice: options?.toolChoice,
      });
    }

    try {
      const response = await client.chat.completions.create(requestParams) as OpenAI.Chat.ChatCompletion;

      if (recorder) {
        const toolCalls = response.choices[0].message.tool_calls
          ?.filter((call: OpenAI.Chat.ChatCompletionMessageToolCall): call is OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall => {
            return call.type === 'function';
          })
          .map((call: OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall) => ({
            id: call.id,
            name: call.function.name,
            arguments: call.function.arguments,
          }));

        recorder.captureLlmResponse({
          providerResponseId: response.id,
          content: response.choices[0].message?.content || '',
          finishReason: response.choices[0].finish_reason || undefined,
          usage: response.usage
            ? {
                promptTokens: response.usage.prompt_tokens,
                completionTokens: response.usage.completion_tokens,
                totalTokens: response.usage.total_tokens,
              }
            : undefined,
          toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
        });
      }

      const toolCalls = response.choices[0].message.tool_calls
        ?.filter((call: OpenAI.Chat.ChatCompletionMessageToolCall): call is OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall => {
          return call.type === 'function';
        })
        .map((call: OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall) => ({
          id: call.id,
          name: call.function.name,
          arguments: call.function.arguments,
        }));

      return {
        id: response.id,
        content: response.choices[0].message?.content || '',
        model: response.model,
        toolCalls,
        usage: response.usage
          ? {
              promptTokens: response.usage.prompt_tokens,
              completionTokens: response.usage.completion_tokens,
              totalTokens: response.usage.total_tokens,
            }
          : undefined,
        finishReason: response.choices[0].finish_reason || undefined,
      };
    } catch (error) {
      recorder?.captureLlmError({
        stage: 'complete',
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  override async *streamCompleteWithTools(
    messages: LLMMessage[],
    options?: LLMRequestOptions,
  ): AsyncGenerator<LLMStreamChunk> {
    const client = this.getClient(options?.apiKey || '', options?.baseUrl);
    const model = options?.model || 'gpt-4o';
    const recorder = options?.exchangeRecorder;
    const chatMessages = this.buildChatMessages(messages, options?.toolResults);

    if (recorder) {
      recorder.captureLlmRequest({
        provider: this.apiType,
        baseUrl: options?.baseUrl,
        model,
        messages: chatMessages,
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
        topP: options?.topP,
        stop: options?.stop,
        tools: options?.tools,
        toolChoice: options?.toolChoice,
      });
    }

    let fullContent = '';
    let finishReason: string | undefined;
    let usage: { promptTokens?: number; completionTokens?: number; totalTokens?: number } | undefined;

    try {
      const stream = await client.chat.completions.create({
        model,
        messages: chatMessages,
        temperature: options?.temperature,
        max_tokens: options?.maxTokens,
        top_p: options?.topP,
        stream: true,
        stop: options?.stop,
        tool_choice: 'none',
      });

      for await (const chunk of stream) {
        if (chunk.choices[0]?.delta?.content) {
          fullContent += chunk.choices[0].delta.content;
        }
        if (chunk.choices[0]?.finish_reason) {
          finishReason = chunk.choices[0].finish_reason;
        }
        if (chunk.usage) {
          usage = {
            promptTokens: chunk.usage.prompt_tokens,
            completionTokens: chunk.usage.completion_tokens,
            totalTokens: chunk.usage.total_tokens,
          };
        }
        yield {
          id: chunk.id,
          content: chunk.choices[0]?.delta?.content ?? undefined,
          finishReason: chunk.choices[0]?.finish_reason || undefined,
          usage: chunk.usage
            ? {
                promptTokens: chunk.usage.prompt_tokens,
                completionTokens: chunk.usage.completion_tokens,
                totalTokens: chunk.usage.total_tokens,
              }
            : undefined,
        };
      }

      if (recorder) {
        recorder.captureLlmResponse({
          providerResponseId: `stream_${Date.now()}`,
          content: fullContent,
          finishReason,
          usage,
        });
      }
    } catch (error) {
      recorder?.captureLlmError({
        stage: 'streamCompleteWithTools',
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async *streamComplete(
    messages: LLMMessage[],
    options?: LLMRequestOptions,
  ): AsyncGenerator<LLMStreamChunk> {
    const client = this.getClient(options?.apiKey || '', options?.baseUrl);
    const model = options?.model || 'gpt-4o';
    const recorder = options?.exchangeRecorder;

    if (recorder) {
      recorder.captureLlmRequest({
        provider: this.apiType,
        baseUrl: options?.baseUrl,
        model,
        messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
        topP: options?.topP,
        stop: options?.stop,
      });
    }

    let fullContent = '';
    let finishReason: string | undefined;
    let usage: { promptTokens?: number; completionTokens?: number; totalTokens?: number } | undefined;

    try {
      const stream = await client.chat.completions.create({
        model,
        messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
        temperature: options?.temperature,
        max_tokens: options?.maxTokens,
        top_p: options?.topP,
        stream: true,
        stop: options?.stop,
      });

      for await (const chunk of stream) {
        if (chunk.choices[0]?.delta?.content) {
          fullContent += chunk.choices[0].delta.content;
        }
        if (chunk.choices[0]?.finish_reason) {
          finishReason = chunk.choices[0].finish_reason;
        }
        if (chunk.usage) {
          usage = {
            promptTokens: chunk.usage.prompt_tokens,
            completionTokens: chunk.usage.completion_tokens,
            totalTokens: chunk.usage.total_tokens,
          };
        }
        yield {
          id: chunk.id,
          content: chunk.choices[0]?.delta?.content ?? undefined,
          finishReason: chunk.choices[0]?.finish_reason || undefined,
          usage: chunk.usage
            ? {
                promptTokens: chunk.usage.prompt_tokens,
                completionTokens: chunk.usage.completion_tokens,
                totalTokens: chunk.usage.total_tokens,
              }
            : undefined,
        };
      }

      if (recorder) {
        recorder.captureLlmResponse({
          providerResponseId: `stream_${Date.now()}`,
          content: fullContent,
          finishReason,
          usage,
        });
      }
    } catch (error) {
      recorder?.captureLlmError({
        stage: 'streamComplete',
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async testApiKey(apiKey: string, baseUrl?: string): Promise<boolean> {
    try {
      const client = this.getClient(apiKey, baseUrl);
      await client.models.list();
      return true;
    } catch {
      return false;
    }
  }
}
