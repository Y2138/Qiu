import type { ApiType } from './model'

export interface ApiKeyResponse {
  id: string
  userId: string
  name: string
  apiType: string
  baseUrl: string
  models: string[]
  isActive: boolean
  testResult?: string
  lastUsedAt?: string
  createdAt: string
  updatedAt: string
}

export interface ApiKeyListResponse {
  items: ApiKeyResponse[]
  total: number
}

export interface CreateApiKeyRequest {
  name: string
  apiType: ApiType
  baseUrl: string
  apiKey: string
  models: string[]
}

export interface UpdateApiKeyRequest {
  name?: string
  apiType?: ApiType
  baseUrl?: string
  apiKey?: string
  models?: string[]
  isActive?: boolean
}

export interface TestApiKeyRequest {
  apiKeyId?: string
  baseUrl?: string
  apiType?: ApiType
  apiKey?: string
}

export interface ApiKeyTestResponse {
  valid: boolean
  message?: string
  error?: string
}

export interface AvailableModelItem {
  apiKeyId: string
  providerName: string
  configName: string
  apiType: string
  model: string
}

export interface AvailableModelsResponse {
  items: AvailableModelItem[]
}
