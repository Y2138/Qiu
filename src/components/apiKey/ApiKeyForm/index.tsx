'use client'

import { useState, useCallback, useMemo } from 'react'
import { Button } from '@/components/common/Button'
import { Input } from '@/components/common/Input'
import { Switch } from '@/components/common/Switch'
import { Loading } from '@/components/common/Loading'
import { cn } from '@/utils/helpers'
import type { ApiKeyConfig, ApiType } from '@/types/model'
import type { CreateApiKeyRequest, UpdateApiKeyRequest, TestApiKeyRequest, ApiKeyTestResponse } from '@/types/apiKey'

interface ApiKeyFormProps {
  mode: 'create' | 'edit'
  initialData?: ApiKeyConfig
  onSubmit: (data: CreateApiKeyRequest | UpdateApiKeyRequest) => Promise<void>
  onCancel: () => void
  onTest?: (data: TestApiKeyRequest) => Promise<ApiKeyTestResponse>
}

interface FormData {
  name: string
  apiType: ApiType
  baseUrl: string
  apiKey: string
  models: string[]
  isActive: boolean
}

interface FormErrors {
  name?: string | undefined
  baseUrl?: string | undefined
  apiKey?: string | undefined
  models?: string | undefined
}

/**
 * API 类型选项
 */
const API_TYPE_OPTIONS: { value: ApiType; label: string; defaultBaseUrl: string }[] = [
  { value: 'openai', label: 'OpenAI', defaultBaseUrl: 'https://api.openai.com/v1' },
  { value: 'anthropic', label: 'Anthropic', defaultBaseUrl: 'https://api.anthropic.com/v1' },
]

/**
 * 验证 URL 是否有效
 */
function isValidUrl(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

/**
 * ApiKeyForm 组件
 * 用于创建和编辑 API Key 配置的表单组件
 */
export function ApiKeyForm({
  mode,
  initialData,
  onSubmit,
  onCancel,
  onTest,
}: ApiKeyFormProps) {
  const [formData, setFormData] = useState<FormData>({
    name: initialData?.name ?? '',
    apiType: initialData?.apiType ?? 'openai',
    baseUrl: initialData?.baseUrl ?? 'https://api.openai.com/v1',
    apiKey: '',
    models: initialData?.models ?? [],
    isActive: initialData?.isActive ?? true,
  })

  const [errors, setErrors] = useState<FormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<ApiKeyTestResponse | null>(null)
  const [modelInput, setModelInput] = useState('')

  /**
   * 验证表单
   */
  const validateForm = useCallback((): boolean => {
    const newErrors: FormErrors = {}

    if (!formData.name.trim()) {
      newErrors.name = '请输入配置名称'
    }

    if (!formData.baseUrl.trim()) {
      newErrors.baseUrl = '请输入 Base URL'
    } else if (!isValidUrl(formData.baseUrl)) {
      newErrors.baseUrl = '请输入有效的 URL'
    }

    if (mode === 'create' && !formData.apiKey.trim()) {
      newErrors.apiKey = '请输入 API Key'
    }

    if (formData.models.length === 0) {
      newErrors.models = '请至少添加一个模型'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [formData, mode])

  /**
   * 提交表单
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    setIsSubmitting(true)
    try {
      if (mode === 'create') {
        await onSubmit({
          name: formData.name,
          apiType: formData.apiType,
          baseUrl: formData.baseUrl,
          apiKey: formData.apiKey,
          models: formData.models,
        } as CreateApiKeyRequest)
      } else {
        const updateData: UpdateApiKeyRequest = {
          name: formData.name,
          apiType: formData.apiType,
          baseUrl: formData.baseUrl,
          models: formData.models,
          isActive: formData.isActive,
        }
        if (formData.apiKey.trim()) {
          updateData.apiKey = formData.apiKey
        }
        await onSubmit(updateData)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  /**
   * 测试连接
   */
  const handleTest = async () => {
    if (!onTest) return

    if (!formData.baseUrl.trim() || !isValidUrl(formData.baseUrl)) {
      setErrors({ baseUrl: '请输入有效的 Base URL' })
      return
    }

    if (mode === 'create' && !formData.apiKey.trim()) {
      setErrors({ apiKey: '请输入 API Key 以进行测试' })
      return
    }

    setIsTesting(true)
    setTestResult(null)
    try {
      const testData: TestApiKeyRequest = {
        baseUrl: formData.baseUrl,
        apiType: formData.apiType,
      }
      if (formData.apiKey.trim()) {
        testData.apiKey = formData.apiKey
      }
      const result = await onTest(testData)
      setTestResult(result)
    } catch (error) {
      setTestResult({
        valid: false,
        error: error instanceof Error ? error.message : '测试失败',
      })
    } finally {
      setIsTesting(false)
    }
  }

  /**
   * 处理 API 类型变更
   */
  const handleApiTypeChange = (apiType: ApiType) => {
    const option = API_TYPE_OPTIONS.find((o) => o.value === apiType)
    setFormData((prev) => ({
      ...prev,
      apiType,
      baseUrl: option?.defaultBaseUrl ?? prev.baseUrl,
    }))
    setTestResult(null)
  }

  /**
   * 添加模型
   */
  const handleAddModel = useCallback(() => {
    const model = modelInput.trim()
    if (model && !formData.models.includes(model)) {
      setFormData((prev) => ({
        ...prev,
        models: [...prev.models, model],
      }))
      setModelInput('')
      setErrors((prev) => ({ ...prev, models: undefined }))
    }
  }, [modelInput, formData.models])

  /**
   * 移除模型
   */
  const handleRemoveModel = useCallback((model: string) => {
    setFormData((prev) => ({
      ...prev,
      models: prev.models.filter((m) => m !== model),
    }))
  }, [])

  /**
   * 处理模型输入键盘事件
   */
  const handleModelKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      handleAddModel()
    }
  }

  const isFormValid = useMemo(() => {
    return (
      formData.name.trim() &&
      formData.baseUrl.trim() &&
      isValidUrl(formData.baseUrl) &&
      formData.models.length > 0 &&
      (mode === 'edit' || formData.apiKey.trim())
    )
  }, [formData, mode])

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* 配置名称 */}
      <Input
        id="name"
        label="配置名称"
        placeholder="例如: 我的 OpenAI Key"
        value={formData.name}
        onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
        error={errors.name}
      />

      {/* API 类型 */}
      <div>
        <label className="block text-sm font-medium text-muted-foreground mb-2">
          API 类型
        </label>
        <div className="flex gap-2">
          {API_TYPE_OPTIONS.map((option) => (
            <Button
              key={option.value}
              type="button"
              variant={formData.apiType === option.value ? 'secondary' : 'outline'}
              onClick={() => handleApiTypeChange(option.value)}
              className={cn(
                'flex-1 h-11 rounded-md px-4 text-sm font-medium transition-all',
                formData.apiType === option.value
                  ? 'border-primary bg-primary/10 text-primary hover:bg-primary/15'
                  : 'text-muted-foreground hover:border-primary/50 hover:text-foreground'
              )}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Base URL */}
      <Input
        id="baseUrl"
        label="Base URL"
        placeholder="https://api.openai.com/v1"
        value={formData.baseUrl}
        onChange={(e) => {
          setFormData((prev) => ({ ...prev, baseUrl: e.target.value }))
          setTestResult(null)
        }}
        error={errors.baseUrl}
      />

      {/* API Key */}
      <div>
        <Input
          id="apiKey"
          label={mode === 'create' ? 'API Key' : 'API Key (留空保持不变)'}
          type="password"
          placeholder="sk-..."
          value={formData.apiKey}
          onChange={(e) => {
            setFormData((prev) => ({ ...prev, apiKey: e.target.value }))
            setTestResult(null)
          }}
          error={errors.apiKey}
        />
        {mode === 'edit' && (
          <p className="text-xs text-muted-foreground mt-1">
            如需更新 API Key，请输入新的值；否则留空保持原有值
          </p>
        )}
      </div>

      {/* 模型列表 */}
      <div>
        <label className="block text-sm font-medium text-muted-foreground mb-2">
          可用模型
        </label>
        <div className="space-y-2">
          {/* 已添加的模型标签 */}
          {formData.models.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {formData.models.map((model) => (
                <span
                  key={model}
                  className={cn(
                    'inline-flex items-center gap-1 px-2 py-1 text-sm rounded-md',
                    'bg-primary/10 text-primary border border-primary/20'
                  )}
                >
                  {model}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveModel(model)}
                    className="h-4 w-4 p-0 hover:bg-transparent hover:text-red-400"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </Button>
                </span>
              ))}
            </div>
          )}
          {/* 模型输入 */}
          <div className="flex gap-2">
            <Input
              type="text"
              value={modelInput}
              onChange={(e) => setModelInput(e.target.value)}
              onKeyDown={handleModelKeyDown}
              placeholder="输入模型名称，按 Enter 或逗号添加"
            />
            <Button type="button" variant="secondary" size="sm" onClick={handleAddModel}>
              添加
            </Button>
          </div>
          {errors.models && (
            <p className="text-sm text-red-500">{errors.models}</p>
          )}
          <p className="text-xs text-muted-foreground">
            支持的模型示例: gpt-4, gpt-3.5-turbo, claude-3-opus 等
          </p>
        </div>
      </div>

      {/* 启用状态 (仅编辑模式) */}
      {mode === 'edit' && (
        <div className="flex items-center justify-between py-2">
          <div>
            <span className="text-foreground">启用此配置</span>
            <p className="text-xs text-muted-foreground">禁用后，此配置将不会出现在模型选择列表中</p>
          </div>
          <Switch
            checked={formData.isActive}
            onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, isActive: checked }))}
          />
        </div>
      )}

      {/* 测试结果 */}
      {testResult && (
        <div
          className={cn(
            'px-4 py-3 rounded-md text-sm',
            testResult.valid
              ? 'bg-green-500/10 text-green-400 border border-green-500/20'
              : 'bg-red-500/10 text-red-400 border border-red-500/20'
          )}
        >
          <div className="flex items-center gap-2">
            {testResult.valid ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            <span>{testResult.valid ? '连接测试成功' : testResult.error || '连接测试失败'}</span>
          </div>
          {testResult.message && (
            <p className="mt-1 ml-7 text-xs opacity-80">{testResult.message}</p>
          )}
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex items-center justify-between pt-4 border-t border-border">
        <div>
          {onTest && (
            <Button
              type="button"
              variant="ghost"
              onClick={handleTest}
              disabled={isTesting || !formData.baseUrl.trim()}
            >
              {isTesting ? (
                <>
                  <Loading size="sm" className="mr-1 flex-none" />
                  测试中...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  测试连接
                </>
              )}
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            取消
          </Button>
          <Button type="submit" disabled={isSubmitting || !isFormValid}>
            {isSubmitting ? (
              <>
                <Loading size="sm" className="mr-1 flex-none" />
                {mode === 'create' ? '创建中...' : '保存中...'}
              </>
            ) : (
              mode === 'create' ? '创建配置' : '保存修改'
            )}
          </Button>
        </div>
      </div>
    </form>
  )
}
