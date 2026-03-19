import { create } from 'zustand'
import type { Model, ApiKeyConfig, AvailableModel, ApiType } from '@/types/model'
import type { AvailableModelItem } from '@/types/apiKey'

interface ModelState {
  currentModel: Model | null
  availableModels: Model[]
  apiKeyConfigs: ApiKeyConfig[]
  availableModelsFromConfigs: AvailableModelItem[]
  activeApiKeyId: string | null

  setCurrentModel: (model: Model) => void
  setAvailableModels: (models: Model[]) => void
  setApiKeyConfigs: (configs: ApiKeyConfig[]) => void
  addApiKeyConfig: (config: ApiKeyConfig) => void
  removeApiKeyConfig: (id: string) => void
  updateApiKeyConfig: (id: string, updates: Partial<ApiKeyConfig>) => void
  setAvailableModelsFromConfigs: (models: AvailableModelItem[]) => void
  getApiKeyConfigById: (id: string) => ApiKeyConfig | undefined
  getApiKeyConfigsByApiType: (apiType: ApiType) => ApiKeyConfig[]
  setActiveApiKey: (id: string | null) => void
  getActiveApiKey: () => ApiKeyConfig | undefined
  getModelsForActiveApiKey: () => Model[]
}

export const useModelStore = create<ModelState>((set, get) => ({
  currentModel: null,
  availableModels: [],
  apiKeyConfigs: [],
  availableModelsFromConfigs: [],
  activeApiKeyId: null,

  setCurrentModel: (model) => set({ currentModel: model }),
  setAvailableModels: (models) => set({ availableModels: models }),
  setApiKeyConfigs: (configs) => {
    const activeConfig = configs.find((c) => c.isActive)
    const firstConfig = configs[0]
    const activeId = activeConfig?.id ?? firstConfig?.id ?? null
    set({
      apiKeyConfigs: configs,
      activeApiKeyId: activeId,
    })
  },
  addApiKeyConfig: (config) => set((state) => ({
    apiKeyConfigs: [...state.apiKeyConfigs, config]
  })),
  removeApiKeyConfig: (id) => set((state) => ({
    apiKeyConfigs: state.apiKeyConfigs.filter((k) => k.id !== id),
    activeApiKeyId: state.activeApiKeyId === id ? (state.apiKeyConfigs.find((k) => k.id !== id)?.id ?? null) : state.activeApiKeyId,
  })),
  updateApiKeyConfig: (id, updates) => set((state) => ({
    apiKeyConfigs: state.apiKeyConfigs.map((k) => k.id === id ? { ...k, ...updates } : k)
  })),
  setAvailableModelsFromConfigs: (models) => set({ availableModelsFromConfigs: models }),
  getApiKeyConfigById: (id) => get().apiKeyConfigs.find((k) => k.id === id),
  getApiKeyConfigsByApiType: (apiType) => get().apiKeyConfigs.filter((k) => k.apiType === apiType),
  setActiveApiKey: (id) => set({ activeApiKeyId: id }),
  getActiveApiKey: () => {
    const { apiKeyConfigs, activeApiKeyId } = get()
    if (!activeApiKeyId) return undefined
    return apiKeyConfigs.find((k) => k.id === activeApiKeyId)
  },
  getModelsForActiveApiKey: () => {
    const { apiKeyConfigs, activeApiKeyId, availableModelsFromConfigs } = get()
    if (!activeApiKeyId) return []

    const config = apiKeyConfigs.find((k) => k.id === activeApiKeyId)
    if (!config) return []

    const models: Model[] = config.models.map((modelId) => {
      const availableModel = availableModelsFromConfigs.find(
        (m) => m.apiKeyId === activeApiKeyId && m.model === modelId
      )
      return {
        id: modelId,
        name: availableModel?.model ?? modelId,
        providerName: availableModel?.providerName,
        configName: availableModel?.configName,
        apiType: config.apiType,
        maxTokens: 128000,
        isCustom: true,
      }
    })

    return models
  },
}))
