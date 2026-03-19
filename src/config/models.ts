import type { Model, ApiType } from '@/types/model'

export const DEFAULT_MODELS: Model[] = [
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    apiType: 'openai',
    description: 'OpenAI 最强大的多模态模型',
    maxTokens: 128000,
    supportsVision: true,
    supportsFunctionCalling: true,
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    apiType: 'openai',
    description: '快速且经济的 GPT-4 变体',
    maxTokens: 128000,
    supportsVision: true,
    supportsFunctionCalling: true,
  },
  {
    id: 'claude-3-5-sonnet-20241022',
    name: 'Claude 3.5 Sonnet',
    apiType: 'anthropic',
    description: 'Anthropic 最新一代智能模型',
    maxTokens: 200000,
    supportsVision: true,
    supportsFunctionCalling: true,
  },
  {
    id: 'claude-3-5-haiku-20241022',
    name: 'Claude 3.5 Haiku',
    apiType: 'anthropic',
    description: '快速响应的 Claude 模型',
    maxTokens: 200000,
    supportsVision: true,
    supportsFunctionCalling: true,
  },
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    apiType: 'openai',
    description: 'Google 快速多模态模型',
    maxTokens: 1000000,
    supportsVision: true,
    supportsFunctionCalling: true,
    isCustom: true,
  },
  {
    id: 'grok-2-1212',
    name: 'Grok 2',
    apiType: 'openai',
    description: 'xAI 智能对话模型',
    maxTokens: 131072,
    supportsVision: false,
    supportsFunctionCalling: true,
    isCustom: true,
  },
]

export const API_TYPES: { id: ApiType; name: string; icon?: string }[] = [
  { id: 'openai', name: 'OpenAI API', icon: 'openai' },
  { id: 'anthropic', name: 'Anthropic API', icon: 'anthropic' },
]

export function getModelsByApiType(apiType: ApiType): Model[] {
  return DEFAULT_MODELS.filter((m) => m.apiType === apiType)
}

export function getModelById(id: string): Model | undefined {
  return DEFAULT_MODELS.find((m) => m.id === id)
}
