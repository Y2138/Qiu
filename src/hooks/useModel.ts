'use client'

import { useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useModelStore } from '@/stores/modelStore'
import { apiKeyService } from '@/services/apiKey'
import type { Model, ApiKeyConfig, ApiType } from '@/types/model'
import type { TestApiKeyRequest } from '@/types/apiKey'
import type { CreateApiKeyRequest, UpdateApiKeyRequest } from '@/types/apiKey'

export function useModel() {
  const {
    currentModel,
    availableModels,
    apiKeyConfigs,
    availableModelsFromConfigs,
    activeApiKeyId,
    setCurrentModel,
    setAvailableModels,
    setApiKeyConfigs,
    setAvailableModelsFromConfigs,
    setActiveApiKey,
    getApiKeyConfigById,
    getApiKeyConfigsByApiType,
    getActiveApiKey,
    getModelsForActiveApiKey,
  } = useModelStore(
    useShallow((s) => ({
      currentModel: s.currentModel,
      availableModels: s.availableModels,
      apiKeyConfigs: s.apiKeyConfigs,
      availableModelsFromConfigs: s.availableModelsFromConfigs,
      activeApiKeyId: s.activeApiKeyId,
      setCurrentModel: s.setCurrentModel,
      setAvailableModels: s.setAvailableModels,
      setApiKeyConfigs: s.setApiKeyConfigs,
      setAvailableModelsFromConfigs: s.setAvailableModelsFromConfigs,
      setActiveApiKey: s.setActiveApiKey,
      getApiKeyConfigById: s.getApiKeyConfigById,
      getApiKeyConfigsByApiType: s.getApiKeyConfigsByApiType,
      getActiveApiKey: s.getActiveApiKey,
      getModelsForActiveApiKey: s.getModelsForActiveApiKey,
    }))
  )

  const loadApiKeys = useCallback(async () => {
    try {
      const response = await apiKeyService.findAll()
      // 转换 ApiKeyResponse 到 ApiKeyConfig
      const configs: ApiKeyConfig[] = response.items.map((item) => ({
        ...item,
        apiType: item.apiType as ApiType, // 转换 string 到 ApiType
        lastUsedAt: item.lastUsedAt ? new Date(item.lastUsedAt) : undefined,
        createdAt: new Date(item.createdAt),
        updatedAt: new Date(item.updatedAt),
      }))
      setApiKeyConfigs(configs)
      return response.items
    } catch (error) {
      console.error('Failed to load API keys:', error)
      return []
    }
  }, [setApiKeyConfigs])

  const loadAvailableModels = useCallback(async () => {
    try {
      const response = await apiKeyService.getAvailableModels()
      setAvailableModelsFromConfigs(response.items)
      return response.items
    } catch (error) {
      console.error('Failed to load available models:', error)
      return []
    }
  }, [setAvailableModelsFromConfigs])

  const createApiKey = useCallback(async (data: CreateApiKeyRequest) => {
    const newKey = await apiKeyService.create(data)
    await loadApiKeys()
    return newKey
  }, [loadApiKeys])

  const updateApiKey = useCallback(async (id: string, data: UpdateApiKeyRequest) => {
    const updatedKey = await apiKeyService.update(id, data)
    await loadApiKeys()
    return updatedKey
  }, [loadApiKeys])

  const deleteApiKey = useCallback(async (id: string) => {
    await apiKeyService.remove(id)
    await loadApiKeys()
  }, [loadApiKeys])

  const testApiKey = useCallback(async (data: TestApiKeyRequest) => {
    const result = await apiKeyService.test(data)
    return result
  }, [])

  const modelsForActiveApiKey = useMemo(() => {
    if (!activeApiKeyId) return []

    const config = apiKeyConfigs.find((item) => item.id === activeApiKeyId)
    if (!config) return []

    return config.models.map((modelId) => {
      const availableModel = availableModelsFromConfigs.find(
        (item) => item.apiKeyId === activeApiKeyId && item.model === modelId
      )

      return {
        id: modelId,
        name: availableModel?.model ?? modelId,
        providerName: availableModel?.providerName,
        configName: availableModel?.configName,
        apiType: config.apiType,
        maxTokens: 128000,
        isCustom: true,
      } satisfies Model
    })
  }, [activeApiKeyId, apiKeyConfigs, availableModelsFromConfigs])

  return {
    currentModel,
    availableModels,
    apiKeyConfigs,
    availableModelsFromConfigs,
    activeApiKeyId,
    setCurrentModel,
    setAvailableModels,
    setApiKeyConfigs,
    setAvailableModelsFromConfigs,
    setActiveApiKey,
    getApiKeyConfigById,
    getApiKeyConfigsByApiType,
    getActiveApiKey,
    getModelsForActiveApiKey,
    modelsForActiveApiKey,
    loadApiKeys,
    loadAvailableModels,
    createApiKey,
    updateApiKey,
    deleteApiKey,
    testApiKey,
  }
}
