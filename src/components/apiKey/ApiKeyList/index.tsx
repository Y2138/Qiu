'use client'

import { useModelStore } from '@/stores/modelStore'
import { Button } from '@/components/common/Button'
import { ApiKeyCard } from '@/components/apiKey/ApiKeyCard'
import type { ApiKeyConfig } from '@/types/model'

interface ApiKeyListProps {
  onAdd: () => void
  onEdit: (config: ApiKeyConfig) => void
  onDelete: (id: string) => void
  onTest: (id: string) => void
}

/**
 * ApiKeyList 组件
 * 用于展示 API Key 配置列表
 */
export function ApiKeyList({ onAdd, onEdit, onDelete, onTest }: ApiKeyListProps) {
  const { apiKeyConfigs } = useModelStore()

  return (
    <div className="space-y-4">
      {/* 头部：标题和添加按钮 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-card-foreground">
            API Key 配置
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            管理您的 API Key 和模型配置
          </p>
        </div>
        <Button onClick={onAdd} size="sm">
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
              d="M12 4v16m8-8H4"
            />
          </svg>
          添加配置
        </Button>
      </div>

      {/* 列表内容 */}
      {apiKeyConfigs.length === 0 ? (
        <EmptyState onAdd={onAdd} />
      ) : (
        <div className="grid gap-4">
          {apiKeyConfigs.map((config) => (
            <ApiKeyCard
              key={config.id}
              config={config}
              onEdit={() => onEdit(config)}
              onDelete={() => onDelete(config.id)}
              onTest={() => onTest(config.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * 空状态组件
 */
function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 rounded-xl border border-dashed border-border bg-card/50">
      <div className="w-16 h-16 mb-4 rounded-full bg-muted flex items-center justify-center">
        <svg
          className="w-8 h-8 text-muted-foreground"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
          />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-card-foreground mb-1">
        暂无 API Key 配置
      </h3>
      <p className="text-sm text-muted-foreground text-center max-w-sm mb-4">
        添加您的第一个 API Key 配置以开始使用 AI 模型
      </p>
      <Button variant="outline" onClick={onAdd}>
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
            d="M12 4v16m8-8H4"
          />
        </svg>
        添加第一个配置
      </Button>
    </div>
  )
}
