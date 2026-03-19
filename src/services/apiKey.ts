import { get, post, patch, del } from './api'
import type {
  ApiKeyResponse,
  ApiKeyListResponse,
  CreateApiKeyRequest,
  UpdateApiKeyRequest,
  ApiKeyTestResponse,
  TestApiKeyRequest,
  AvailableModelsResponse,
} from '@/types/apiKey'

/**
 * API Key 服务
 * 提供 API Key 的 CRUD 操作和测试功能
 */
export const apiKeyService = {
  /**
   * 创建 API 配置
   */
  create: (data: CreateApiKeyRequest) =>
    post<ApiKeyResponse>('/api-keys', data),

  /**
   * 获取 API 配置列表
   */
  findAll: () =>
    get<ApiKeyListResponse>('/api-keys'),

  /**
   * 获取单个 API 配置
   */
  findOne: (id: string) =>
    get<ApiKeyResponse>(`/api-keys/${id}`),

  /**
   * 更新 API 配置
   */
  update: (id: string, data: UpdateApiKeyRequest) =>
    patch<ApiKeyResponse>(`/api-keys/${id}`, data),

  /**
   * 删除 API 配置
   */
  remove: (id: string) =>
    del<void>(`/api-keys/${id}`),

  /**
   * 测试 API Key 连接
   */
  test: (data: TestApiKeyRequest) =>
    post<ApiKeyTestResponse>('/api-keys/test', data),

  /**
   * 获取可用模型列表
   */
  getAvailableModels: () =>
    get<AvailableModelsResponse>('/chat/models'),
}
