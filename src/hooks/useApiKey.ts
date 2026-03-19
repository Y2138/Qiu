'use client'

import { useCallback, useEffect, useState, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useModelStore } from '@/stores/modelStore'
import { apiKeyService } from '@/services/apiKey'
import type { ApiKeyConfig, ApiType, AvailableModel } from '@/types/model'
import type {
  ApiKeyResponse,
  CreateApiKeyRequest,
  UpdateApiKeyRequest,
  TestApiKeyRequest,
  AvailableModelItem,
} from '@/types/apiKey'

// 模块级标记，避免多实例 useApiKey 时重复请求 API Key 列表
let apiKeyListInitialized = false

/**
 * 将后端响应转换为前端 ApiKeyConfig 格式
 */
function transformApiKeyResponse(response: ApiKeyResponse): ApiKeyConfig {
  return {
    id: response.id,
    userId: response.userId,
    name: response.name,
    apiType: response.apiType as ApiType,
    baseUrl: response.baseUrl,
    models: response.models,
    isActive: response.isActive,
    testResult: response.testResult ?? undefined,
    lastUsedAt: response.lastUsedAt ? new Date(response.lastUsedAt) : undefined,
    createdAt: new Date(response.createdAt),
    updatedAt: new Date(response.updatedAt),
  }
}

interface UseApiKeyReturn {
  apiKeyConfigs: ApiKeyConfig[]
  availableModelsFromConfigs: AvailableModelItem[]
  loading: boolean
  error: string | null
  addApiKeyConfig: (data: CreateApiKeyRequest) => Promise<boolean>
  removeApiKeyConfig: (id: string) => Promise<boolean>
  updateApiKeyConfig: (id: string, data: UpdateApiKeyRequest) => Promise<boolean>
  validateApiKeyConfig: (data: TestApiKeyRequest) => Promise<{ valid: boolean; message?: string | undefined; error?: string | undefined }>
  getApiKeyConfigById: (id: string) => ApiKeyConfig | undefined
  getApiKeyConfigsByApiType: (apiType: ApiType) => ApiKeyConfig[]
  refreshApiKeyConfigs: () => Promise<void>
  refreshAvailableModels: () => Promise<void>
}

export function useApiKey(): UseApiKeyReturn {
  const {
    apiKeyConfigs,
    availableModelsFromConfigs,
    setApiKeyConfigs,
    setAvailableModelsFromConfigs,
    getApiKeyConfigById,
    getApiKeyConfigsByApiType,
  } = useModelStore(
    useShallow((s) => ({
      apiKeyConfigs: s.apiKeyConfigs,
      availableModelsFromConfigs: s.availableModelsFromConfigs,
      setApiKeyConfigs: s.setApiKeyConfigs,
      setAvailableModelsFromConfigs: s.setAvailableModelsFromConfigs,
      getApiKeyConfigById: s.getApiKeyConfigById,
      getApiKeyConfigsByApiType: s.getApiKeyConfigsByApiType,
    }))
  )

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isRefreshingRef = useRef(false)

  /**
   * 刷新 API Key 配置列表
   */
  const refreshApiKeyConfigs = useCallback(async () => {
    if (isRefreshingRef.current) return

    isRefreshingRef.current = true
    try {
      setLoading(true)
      setError(null)
      const response = await apiKeyService.findAll()
      const configs = response.items.map(transformApiKeyResponse)
      setApiKeyConfigs(configs)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '加载 API Key 配置失败'
      setError(errorMessage)
      console.error('Failed to load API key configs:', err)
    } finally {
      setLoading(false)
      isRefreshingRef.current = false
    }
  }, [setApiKeyConfigs])

  /**
   * 刷新可用模型列表
   */
  const refreshAvailableModels = useCallback(async () => {
    try {
      const response = await apiKeyService.getAvailableModels()
      const models = response.items ?? []
      setAvailableModelsFromConfigs(models)
    } catch (err) {
      console.error('Failed to load available models:', err)
    }
  }, [setAvailableModelsFromConfigs])

  /**
   * 初始化加载 API Key 列表和可用模型（全局只执行一次，避免多组件挂载重复请求）
   */
  useEffect(() => {
    if (apiKeyListInitialized) return
    apiKeyListInitialized = true
    refreshApiKeyConfigs()
    refreshAvailableModels()
  }, [refreshApiKeyConfigs, refreshAvailableModels])

  /**
   * 添加 API Key 配置
   */
  const addApiKeyConfig = useCallback(
    async (data: CreateApiKeyRequest): Promise<boolean> => {
      try {
        setLoading(true)
        setError(null)
        await apiKeyService.create(data)
        await refreshApiKeyConfigs()
        await refreshAvailableModels()
        return true
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '创建 API Key 配置失败'
        setError(errorMessage)
        console.error('Failed to add API key config:', err)
        return false
      } finally {
        setLoading(false)
      }
    },
    [refreshApiKeyConfigs, refreshAvailableModels]
  )

  /**
   * 删除 API Key 配置
   */
  const removeApiKeyConfig = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        setLoading(true)
        setError(null)
        await apiKeyService.remove(id)
        await refreshApiKeyConfigs()
        await refreshAvailableModels()
        return true
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '删除 API Key 配置失败'
        setError(errorMessage)
        console.error('Failed to remove API key config:', err)
        return false
      } finally {
        setLoading(false)
      }
    },
    [refreshApiKeyConfigs, refreshAvailableModels]
  )

  /**
   * 更新 API Key 配置
   */
  const updateApiKeyConfig = useCallback(
    async (id: string, data: UpdateApiKeyRequest): Promise<boolean> => {
      try {
        setLoading(true)
        setError(null)
        await apiKeyService.update(id, data)
        await refreshApiKeyConfigs()
        await refreshAvailableModels()
        return true
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '更新 API Key 配置失败'
        setError(errorMessage)
        console.error('Failed to update API key config:', err)
        return false
      } finally {
        setLoading(false)
      }
    },
    [refreshApiKeyConfigs, refreshAvailableModels]
  )

  /**
   * 验证 API Key 配置（测试连接）
   */
  const validateApiKeyConfig = useCallback(
    async (data: TestApiKeyRequest): Promise<{ valid: boolean; message?: string | undefined; error?: string | undefined }> => {
      try {
        setLoading(true)
        setError(null)
        const response = await apiKeyService.test(data)
        return {
          valid: response.valid,
          message: response.message ?? undefined,
          error: response.error ?? undefined,
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '测试 API Key 连接失败'
        setError(errorMessage)
        console.error('Failed to validate API key config:', err)
        return {
          valid: false,
          error: errorMessage,
        }
      } finally {
        setLoading(false)
      }
    },
    []
  )

  return {
    apiKeyConfigs,
    availableModelsFromConfigs,
    loading,
    error,
    addApiKeyConfig,
    removeApiKeyConfig,
    updateApiKeyConfig,
    validateApiKeyConfig,
    getApiKeyConfigById,
    getApiKeyConfigsByApiType,
    refreshApiKeyConfigs,
    refreshAvailableModels,
  }
}
