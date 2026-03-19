export type ApiType = 'openai' | 'anthropic'

export interface Model {
  id: string
  name: string
  apiType: ApiType
  description?: string
  maxTokens: number
  supportsVision?: boolean
  supportsFunctionCalling?: boolean
  isCustom?: boolean
  providerName?: string
  configName?: string
}

export interface ApiKeyConfig {
  id: string
  userId: string
  name: string
  apiType: ApiType
  baseUrl: string
  models: string[]
  isActive: boolean
  testResult?: string
  lastUsedAt?: Date
  createdAt: Date
  updatedAt: Date
}

export interface AvailableModel {
  apiKeyId: string
  providerName: string
  configName: string
  apiType: ApiType
  model: string
  name?: string
}
