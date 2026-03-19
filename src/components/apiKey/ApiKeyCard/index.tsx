'use client'

import { useState } from 'react'
import { Button } from '@/components/common/Button'
import { Loading } from '@/components/common/Loading'
import { cn } from '@/utils/helpers'
import type { ApiKeyConfig, ApiType } from '@/types/model'

interface ApiKeyCardProps {
  config: ApiKeyConfig
  onEdit: () => void
  onDelete: () => void
  onTest: () => void
}

/**
 * API 类型标签样式映射
 */
const apiTypeStyles: Record<ApiType, string> = {
  openai: 'bg-green-500/20 text-green-400 border-green-500/30',
  anthropic: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
}

/**
 * API 类型显示名称映射
 */
const apiTypeNames: Record<ApiType, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
}

/**
 * ApiKeyCard 组件
 * 用于展示单个 API Key 配置的卡片组件
 */
export function ApiKeyCard({ config, onEdit, onDelete, onTest }: ApiKeyCardProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [isTesting, setIsTesting] = useState(false)

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await onDelete()
    } finally {
      setIsDeleting(false)
    }
  }

  const handleTest = async () => {
    setIsTesting(true)
    try {
      await onTest()
    } finally {
      setIsTesting(false)
    }
  }

  return (
    <div
      className={cn(
        'rounded-xl p-5 border transition-all duration-200',
        'bg-card border-border',
        'hover:border-primary/30 hover:shadow-md',
        !config.isActive && 'opacity-60'
      )}
    >
      {/* 头部：名称和状态 */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-card-foreground">
            {config.name}
          </h3>
          <span
            className={cn(
              'px-2 py-0.5 text-xs font-medium rounded-full border',
              apiTypeStyles[config.apiType]
            )}
          >
            {apiTypeNames[config.apiType]}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'px-2 py-0.5 text-xs font-medium rounded-full',
              config.isActive
                ? 'bg-green-500/20 text-green-400'
                : 'bg-gray-500/20 text-gray-400'
            )}
          >
            {config.isActive ? '已启用' : '已禁用'}
          </span>
        </div>
      </div>

      {/* Base URL */}
      <div className="mb-3">
        <span className="text-xs text-muted-foreground">Base URL: </span>
        <span className="text-sm text-foreground font-mono">
          {config.baseUrl}
        </span>
      </div>

      {/* 模型列表 */}
      <div className="mb-4">
        <span className="text-xs text-muted-foreground block mb-2">可用模型:</span>
        <div className="flex flex-wrap gap-1.5">
          {config.models.map((model, index) => (
            <span
              key={`${model}-${index}`}
              className={cn(
                'px-2 py-0.5 text-xs rounded-md',
                'bg-muted text-muted-foreground',
                'border border-border'
              )}
            >
              {model}
            </span>
          ))}
        </div>
      </div>

      {/* 测试结果 */}
      {config.testResult && (() => {
        try {
          const testResultData = JSON.parse(config.testResult)
          const isValid = testResultData.valid === true
          const testedAt = testResultData.testedAt ? new Date(testResultData.testedAt) : null

          return (
            <div
              className={cn(
                'mb-4 px-3 py-2 rounded-md text-sm',
                isValid
                  ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                  : 'bg-red-500/10 text-red-400 border border-red-500/20'
              )}
            >
              <div className="flex items-center gap-2">
                <span>{isValid ? '连接测试成功' : '连接测试失败'}</span>
                {testedAt && (
                  <span className="text-xs opacity-70">
                    ({testedAt.toLocaleString('zh-CN')})
                  </span>
                )}
              </div>
            </div>
          )
        } catch {
          return null
        }
      })()}

      {/* 最后使用时间 */}
      {config.lastUsedAt && (
        <div className="mb-4 text-xs text-muted-foreground">
          最后使用: {new Date(config.lastUsedAt).toLocaleString('zh-CN')}
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <Button
          variant="ghost"
          size="sm"
          onClick={onEdit}
          className="text-muted-foreground hover:text-foreground"
        >
          <svg
            className="w-4 h-4 mr-1"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
          编辑
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleTest}
          disabled={isTesting}
          className="text-muted-foreground hover:text-foreground"
        >
          {isTesting ? (
            <Loading size="sm" className="mr-1 flex-none" />
          ) : (
            <svg
              className="w-4 h-4 mr-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          )}
          {isTesting ? '测试中...' : '测试'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDelete}
          disabled={isDeleting}
          className="text-red-400 hover:text-red-500 hover:bg-red-500/10"
        >
          <svg
            className="w-4 h-4 mr-1"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
          {isDeleting ? '删除中...' : '删除'}
        </Button>
      </div>
    </div>
  )
}
