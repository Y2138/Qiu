'use client'

import { useState, useEffect } from 'react'
import { BackButton } from '@/components/common/BackButton'
import { ApiKeyList } from '@/components/apiKey/ApiKeyList'
import { ApiKeyForm } from '@/components/apiKey/ApiKeyForm'
import { useModel } from '@/hooks/useModel'
import type { ApiKeyConfig } from '@/types/model'
import type { CreateApiKeyRequest, UpdateApiKeyRequest, TestApiKeyRequest, ApiKeyTestResponse } from '@/types/apiKey'

type ViewMode = 'list' | 'create' | 'edit'

export default function ApiKeysPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [editingConfig, setEditingConfig] = useState<ApiKeyConfig | null>(null)
  const { apiKeyConfigs, loadApiKeys, createApiKey, updateApiKey, deleteApiKey, testApiKey } = useModel()

  useEffect(() => {
    loadApiKeys()
  }, [loadApiKeys])

  const handleAdd = () => {
    setEditingConfig(null)
    setViewMode('create')
  }

  const handleEdit = (config: ApiKeyConfig) => {
    setEditingConfig(config)
    setViewMode('edit')
  }

  const handleDelete = async (id: string) => {
    if (confirm('确定要删除此 API Key 配置吗？')) {
      await deleteApiKey(id)
    }
  }

  const handleTest = async (_id: string) => {
    // 测试功能需要从表单中获取 API Key，这里暂时跳过
    // 实际测试在表单中进行
    console.log('测试功能在表单中进行')
  }

  const handleSubmit = async (data: CreateApiKeyRequest | UpdateApiKeyRequest) => {
    if (viewMode === 'create') {
      await createApiKey(data as CreateApiKeyRequest)
    } else if (viewMode === 'edit' && editingConfig) {
      await updateApiKey(editingConfig.id, data as UpdateApiKeyRequest)
    }
    setViewMode('list')
    setEditingConfig(null)
  }

  const handleCancel = () => {
    setViewMode('list')
    setEditingConfig(null)
  }

  const handleTestApiKey = async (data: TestApiKeyRequest): Promise<ApiKeyTestResponse> => {
    if (!data.apiKey) {
      return { valid: false, error: '请输入 API Key' }
    }
    if (!data.apiType) {
      return { valid: false, error: '请选择 API 类型' }
    }
    const result = await testApiKey({
      apiKey: data.apiKey,
      baseUrl: data.baseUrl,
      apiType: data.apiType,
    })
    return result
  }

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <BackButton
        href="/settings"
        label="返回"
        preferHistoryBack
        className="mb-6"
      />

      <h1 className="mb-6 text-2xl font-bold">API Keys 管理</h1>

      {viewMode === 'list' ? (
        <ApiKeyList
          onAdd={handleAdd}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onTest={handleTest}
        />
      ) : (
        <div className="bg-card rounded-lg border p-6">
          <h2 className="text-lg font-semibold mb-4">
            {viewMode === 'create' ? '添加新的 API Key 配置' : '编辑 API Key 配置'}
          </h2>
          <ApiKeyForm
            mode={viewMode}
            initialData={editingConfig || undefined}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            onTest={handleTestApiKey}
          />
        </div>
      )}
    </div>
  )
}
