'use client'

import { memo } from 'react'
import { ChevronDown, KeyRound, Server, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/common/Dropdown'
import { Button } from '@/components/common/Button'
import { useModelStore } from '@/stores'
import { useApiKey } from '@/hooks'
import { cn } from '@/utils/helpers'
import type { ApiKeyConfig } from '@/types/model'

interface ConfigItemProps {
  config: ApiKeyConfig
  isActive: boolean
  onSelect: (id: string) => void
}

const ConfigItem = memo(function ConfigItem({ config, isActive, onSelect }: ConfigItemProps) {
  return (
    <DropdownMenuItem
      onClick={() => onSelect(config.id)}
      className={cn(
        'cursor-pointer transition-colors',
        isActive
          ? 'bg-primary text-primary-foreground'
          : 'text-popover-foreground hover:bg-primary hover:text-primary-foreground',
      )}
    >
      <span className="truncate">{config.name}</span>
    </DropdownMenuItem>
  )
})

export function ProviderSwitcher() {
  const router = useRouter()
  const apiKeyConfigs = useModelStore((s) => s.apiKeyConfigs)
  const activeApiKeyId = useModelStore((s) => s.activeApiKeyId)
  const setActiveApiKey = useModelStore((s) => s.setActiveApiKey)
  const { loading } = useApiKey()

  const activeConfig = apiKeyConfigs.find((c) => c.id === activeApiKeyId)
  const hasConfigs = apiKeyConfigs.length > 0

  if (loading) {
    return (
      <Button
        disabled
        variant="ghost"
        size="sm"
        className="gap-1.5 rounded-md px-2 text-muted-foreground opacity-50"
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>加载中...</span>
      </Button>
    )
  }

  if (!hasConfigs) {
    return (
      <Button
        disabled
        variant="ghost"
        size="sm"
        className="gap-1.5 rounded-md px-2 text-muted-foreground opacity-50"
      >
        <Server className="h-4 w-4" />
        <span>未配置厂商</span>
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "gap-1.5 rounded-md px-2 text-primary hover:bg-primary/10"
          )}
          title="切换厂商"
        >
          <Server className="h-4 w-4" />
          <span className="max-w-[100px] truncate">{activeConfig?.name || '选择厂商'}</span>
          <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-[160px] bg-popover border-border">
        {apiKeyConfigs.map((config) => (
          <ConfigItem
            key={config.id}
            config={config}
            isActive={config.id === activeApiKeyId}
            onSelect={setActiveApiKey}
          />
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => router.push('/settings/api-keys')}
          className="cursor-pointer text-popover-foreground hover:bg-primary hover:text-primary-foreground"
        >
          <KeyRound className="mr-2 h-4 w-4" />
          管理 APIKey
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
