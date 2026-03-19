import {
  BaseLLMAdapter,
  LLMMessage,
  LLMRequestOptions,
  LLMResponse,
  LLMStreamChunk,
  LLMToolDefinition,
} from './base';

export class AnthropicAdapter extends BaseLLMAdapter {
  readonly apiType = 'anthropic';

  private mapTools(tools?: LLMToolDefinition[]): Array<Record<string, unknown>> | undefined {
    if (!tools || tools.length === 0) return undefined;
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema,
    }));
  }

  private buildAnthropicMessages(
    messages: LLMMessage[],
    toolResults?: LLMRequestOptions['toolResults'],
  ): {
    systemPrompt?: string;
    anthropicMessages: Array<Record<string, unknown>>;
  } {
    const systemPrompt = messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content.trim())
      .filter((content) => content.length > 0)
      .join('\n\n');
    const nonSystemMessages = messages.filter((m) => m.role !== 'system');

    const anthropicMessages: Array<Record<string, unknown>> = nonSystemMessages.map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    }));

    if (toolResults && toolResults.length > 0) {
      anthropicMessages.push({
        role: 'user',
        content: toolResults.map((result) => ({
          type: 'tool_result',
          tool_use_id: result.toolCallId,
          content: result.output,
        })),
      });
    }

    return {
      systemPrompt: systemPrompt || undefined,
      anthropicMessages,
    };
  }

  async complete(
    messages: LLMMessage[],
    options?: LLMRequestOptions,
  ): Promise<LLMResponse> {
    const model = options?.model || 'claude-3-5-sonnet-20241022';
    const baseUrl = options?.baseUrl || 'https://api.anthropic.com';
    const { systemPrompt, anthropicMessages } = this.buildAnthropicMessages(messages, options?.toolResults);
    const recorder = options?.exchangeRecorder;

    const requestBody = {
      model,
      messages: anthropicMessages,
      system: systemPrompt,
      max_tokens: options?.maxTokens || 4096,
      temperature: options?.temperature,
      top_p: options?.topP,
      stop_sequences: options?.stop,
      tools: this.mapTools(options?.tools),
      stream: false,
    };

    if (recorder) {
      recorder.captureLlmRequest({
        provider: this.apiType,
        baseUrl,
        model,
        messages: anthropicMessages,
        system: systemPrompt,
        temperature: options?.temperature,
        maxTokens: options?.maxTokens || 4096,
        topP: options?.topP,
        stop: options?.stop,
        tools: options?.tools,
        toolChoice: options?.toolChoice,
      });
    }

    const url = baseUrl.endsWith('/') ? `${baseUrl}v1/messages` : `${baseUrl}/v1/messages`;

    let responseData: Record<string, unknown>;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'x-api-key': options?.apiKey || '',
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      responseData = await response.json();

      if (!response.ok) {
        throw new Error(`Anthropic API error: ${response.status} - ${JSON.stringify(responseData)}`);
      }

      if (recorder) {
        const contentBlocks = Array.isArray(responseData.content)
          ? responseData.content as Array<Record<string, unknown>>
          : [];
        const usageData = (responseData.usage ?? undefined) as
          | { input_tokens?: number; output_tokens?: number }
          | undefined;
        const textContent = contentBlocks
          .filter((block) => block.type === 'text')
          .map((block) => String(block.text ?? ''))
          .join('');
        const toolCalls = contentBlocks
          .filter((block) => block.type === 'tool_use')
          .map((block) => ({
            id: String(block.id ?? ''),
            name: String(block.name ?? ''),
            arguments: JSON.stringify(block.input ?? {}),
          }))
          .filter((call) => call.id && call.name);

        recorder.captureLlmResponse({
          providerResponseId: responseData.id as string,
          content: textContent,
          finishReason: (responseData.stop_reason as string) || undefined,
          usage: usageData
            ? {
                promptTokens: usageData.input_tokens,
                completionTokens: usageData.output_tokens,
                totalTokens: (usageData.input_tokens ?? 0) + (usageData.output_tokens ?? 0),
              }
            : undefined,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        });
      }

      const contentBlocks = Array.isArray(responseData.content)
        ? responseData.content as Array<Record<string, unknown>>
        : [];
      const usageData = (responseData.usage ?? undefined) as
        | { input_tokens?: number; output_tokens?: number }
        | undefined;
      const textContent = contentBlocks
        .filter((block) => block.type === 'text')
        .map((block) => String(block.text ?? ''))
        .join('');
      const toolCalls = contentBlocks
        .filter((block) => block.type === 'tool_use')
        .map((block) => ({
          id: String(block.id ?? ''),
          name: String(block.name ?? ''),
          arguments: JSON.stringify(block.input ?? {}),
        }))
        .filter((call) => call.id && call.name);

      return {
        id: responseData.id as string,
        content: textContent,
        model: responseData.model as string,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        usage: usageData
          ? {
              promptTokens: usageData.input_tokens ?? 0,
              completionTokens: usageData.output_tokens ?? 0,
              totalTokens: (usageData.input_tokens ?? 0) + (usageData.output_tokens ?? 0),
            }
          : undefined,
        finishReason: responseData.stop_reason as string || undefined,
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
    const model = options?.model || 'claude-3-5-sonnet-20241022';
    const baseUrl = options?.baseUrl || 'https://api.anthropic.com';
    const { systemPrompt, anthropicMessages } = this.buildAnthropicMessages(messages, options?.toolResults);
    const recorder = options?.exchangeRecorder;

    const requestBody = {
      model,
      messages: anthropicMessages,
      system: systemPrompt,
      max_tokens: options?.maxTokens || 4096,
      temperature: options?.temperature,
      top_p: options?.topP,
      stop_sequences: options?.stop,
      stream: true,
    };

    if (recorder) {
      recorder.captureLlmRequest({
        provider: this.apiType,
        baseUrl,
        model,
        messages: anthropicMessages,
        system: systemPrompt,
        temperature: options?.temperature,
        maxTokens: options?.maxTokens || 4096,
        topP: options?.topP,
        stop: options?.stop,
        tools: options?.tools,
        toolChoice: options?.toolChoice,
      });
    }

    const url = baseUrl.endsWith('/') ? `${baseUrl}v1/messages` : `${baseUrl}/v1/messages`;

    let fullContent = '';
    let finishReason: string | undefined;
    let usage: { promptTokens?: number; completionTokens?: number; totalTokens?: number } | undefined;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'x-api-key': options?.apiKey || '',
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Anthropic API error: ${response.status} - ${error}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            if (dataStr === '[DONE]') break;

            try {
              const data = JSON.parse(dataStr);

              if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') {
                fullContent += data.delta.text;
                yield {
                  content: data.delta.text,
                };
              } else if (data.type === 'message_delta') {
                finishReason = data.delta?.stop_reason;
                usage = data.usage
                  ? {
                      promptTokens: data.usage.input_tokens,
                      completionTokens: data.usage.output_tokens,
                      totalTokens: data.usage.input_tokens + data.usage.output_tokens,
                    }
                  : undefined;
                yield {
                  finishReason: data.delta?.stop_reason,
                  usage: data.usage
                    ? {
                        promptTokens: data.usage.input_tokens,
                        completionTokens: data.usage.output_tokens,
                        totalTokens: data.usage.input_tokens + data.usage.output_tokens,
                      }
                    : undefined,
                };
              }
            } catch {
              // 忽略解析错误
            }
          }
        }
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
    const model = options?.model || 'claude-3-5-sonnet-20241022';
    const baseUrl = options?.baseUrl || 'https://api.anthropic.com';
    const recorder = options?.exchangeRecorder;

    const systemPrompt = messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content.trim())
      .filter((content) => content.length > 0)
      .join('\n\n');
    const nonSystemMessages = messages.filter((m) => m.role !== 'system');

    const requestBody = {
      model,
      messages: nonSystemMessages.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
      system: systemPrompt || undefined,
      max_tokens: options?.maxTokens || 4096,
      temperature: options?.temperature,
      top_p: options?.topP,
      stop_sequences: options?.stop,
      stream: true,
    };

    if (recorder) {
      recorder.captureLlmRequest({
        provider: this.apiType,
        baseUrl,
        model,
        messages: nonSystemMessages.map((m) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
        })),
        system: systemPrompt || undefined,
        temperature: options?.temperature,
        maxTokens: options?.maxTokens || 4096,
        topP: options?.topP,
        stop: options?.stop,
      });
    }

    const url = baseUrl.endsWith('/') ? `${baseUrl}v1/messages` : `${baseUrl}/v1/messages`;

    let fullContent = '';
    let finishReason: string | undefined;
    let usage: { promptTokens?: number; completionTokens?: number; totalTokens?: number } | undefined;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'x-api-key': options?.apiKey || '',
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Anthropic API error: ${response.status} - ${error}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            if (dataStr === '[DONE]') break;

            try {
              const data = JSON.parse(dataStr);

              if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') {
                fullContent += data.delta.text;
                yield {
                  content: data.delta.text,
                };
              } else if (data.type === 'message_delta') {
                finishReason = data.delta?.stop_reason;
                usage = data.usage
                  ? {
                      promptTokens: data.usage.input_tokens,
                      completionTokens: data.usage.output_tokens,
                      totalTokens: data.usage.input_tokens + data.usage.output_tokens,
                    }
                  : undefined;
                yield {
                  finishReason: data.delta?.stop_reason,
                  usage: data.usage
                    ? {
                        promptTokens: data.usage.input_tokens,
                        completionTokens: data.usage.output_tokens,
                        totalTokens: data.usage.input_tokens + data.usage.output_tokens,
                      }
                    : undefined,
                };
              }
            } catch {
              // 忽略解析错误
            }
          }
        }
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
      const url = (baseUrl || 'https://api.anthropic.com').endsWith('/')
        ? `${baseUrl || 'https://api.anthropic.com'}v1/messages`
        : `${baseUrl || 'https://api.anthropic.com'}/v1/messages`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'test' }],
        }),
      });

      return response.ok || response.status === 400;
    } catch {
      return false;
    }
  }
}
