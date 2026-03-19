'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import {
  Bell,
  BookOpenText,
  BrainCircuit,
  Key,
  Lock,
  Monitor,
  Moon,
  Sparkles,
  Sun,
  Trash2,
  User,
  WandSparkles,
} from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useAuthStore, useSettingsStore } from '@/stores'
import { userService } from '@/services/user'
import { getAgentConfig } from '@/services/chat'
import {
  mergeUserSettings,
  type AgentResponseDensitySetting,
  type AgentToneSetting,
  type AgentWorkModeSetting,
  type UserDefinedPromptPreset,
  type UserSettings,
} from '@/types/settings'
import type { PromptPresetOption, AgentUserMemoryEntry } from '@/types/chat'
import { BackButton } from '@/components/common/BackButton'
import { SettingsSection } from '@/components/common/SettingsSection'
import { Button } from '@/components/common/Button'
import { Input } from '@/components/common/Input'
import { Switch } from '@/components/common/Switch'

const SETTINGS_DEBOUNCE_MS = 500

const settingsSections = [
  { id: 'profile', label: '个人资料', icon: User },
  { id: 'agent', label: 'Agent 偏好', icon: Sparkles },
  { id: 'memory', label: '自动记忆', icon: BrainCircuit },
  { id: 'presets', label: 'Prompt Presets', icon: WandSparkles },
  { id: 'conversation', label: '对话体验', icon: BookOpenText },
  { id: 'appearance', label: '外观', icon: Moon },
  { id: 'api-keys', label: 'API Keys', icon: Key },
  { id: 'notifications', label: '通知', icon: Bell },
  { id: 'security', label: '安全', icon: Lock },
] as const

const toneOptions: Array<{ value: AgentToneSetting; label: string; description: string }> = [
  { value: 'gentle', label: '温柔', description: '更柔和、更照顾阅读感受。' },
  { value: 'professional', label: '专业', description: '清晰克制，适合大多数工作场景。' },
  { value: 'sharp', label: '凌厉', description: '直接指出问题，减少绕弯。' },
  { value: 'concise', label: '简洁', description: '只保留必要信息。' },
]

const densityOptions: Array<{ value: AgentResponseDensitySetting; label: string; description: string }> = [
  { value: 'brief', label: '简短', description: '优先给结论和最少说明。' },
  { value: 'balanced', label: '平衡', description: '结论和解释保持均衡。' },
  { value: 'detailed', label: '详细', description: '保留更多上下文和过程说明。' },
]

const workModeOptions: Array<{ value: AgentWorkModeSetting; label: string; description: string }> = [
  { value: 'plan', label: '先规划再执行', description: '默认先拆步骤，再逐步推进。' },
  { value: 'direct', label: '直接执行', description: '默认快速动手，只在必要时补规划。' },
]

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return fallback
}

function createPromptPresetTemplate(index: number): UserDefinedPromptPreset {
  const id = `custom-prompt-preset-${index}`
  return {
    id,
    enabled: true,
    content: `# Custom Prompt Preset ${index}

一句话描述这个 prompt preset 的适用场景。

## Instructions
- 说明你希望 Agent 在什么情况下启用这个 preset。
- 用清晰、可执行的规则描述输出方式、边界和注意事项。
- 如果需要固定格式，也在这里写明。`,
  }
}

function parsePromptPresetSummary(content: string, fallbackId: string) {
  const lines = content.split('\n').map((line) => line.trim())
  const titleLine = lines.find((line) => line.startsWith('# '))
  const title = titleLine ? titleLine.replace(/^#\s+/, '').trim() : fallbackId
  const description = lines.find((line) => line && !line.startsWith('#')) || '通过自定义 preset 文本扩展能力。'
  return {
    title,
    description,
  }
}

function mergeVisiblePromptPresets(availablePromptPresets: PromptPresetOption[], customPresets: UserDefinedPromptPreset[]) {
  const items = new Map<string, PromptPresetOption>()

  for (const preset of availablePromptPresets) {
    items.set(preset.id, preset)
  }

  for (const preset of customPresets) {
    const summary = parsePromptPresetSummary(preset.content, preset.id)
    items.set(preset.id, {
      id: preset.id,
      name: summary.title,
      description: summary.description,
      riskLevel: 'medium',
      source: 'custom',
    })
  }

  return Array.from(items.values())
}

export default function SettingsPage() {
  const user = useAuthStore((state) => state.user)
  const setUser = useAuthStore((state) => state.setUser)

  const {
    theme,
    language,
    fontSize,
    sendOnEnter,
    showTimestamp,
    enableSound,
    tone,
    responseDensity,
    workMode,
    autoMemoryEnabled,
    allowMcp,
    agentRolePromptMarkdown,
    enabledPromptPresetIds,
    customPromptPresets,
    hydrateFromServer,
    patchSettings,
    setTheme: setThemeSetting,
    setLanguage,
    setFontSize,
    setSendOnEnter,
    setShowTimestamp,
    setEnableSound,
    setTone,
    setResponseDensity,
    setWorkMode,
    setAutoMemoryEnabled,
    setAllowMcp,
    markSaving,
    markSaved,
    markSaveError,
    saveStatus,
    saveError,
  } = useSettingsStore(
    useShallow((state) => ({
      theme: state.theme,
      language: state.language,
      fontSize: state.fontSize,
      sendOnEnter: state.sendOnEnter,
      showTimestamp: state.showTimestamp,
      enableSound: state.enableSound,
      tone: state.tone,
      responseDensity: state.responseDensity,
      workMode: state.workMode,
      autoMemoryEnabled: state.autoMemoryEnabled,
      allowMcp: state.allowMcp,
      agentRolePromptMarkdown: state.agentRolePromptMarkdown,
      enabledPromptPresetIds: state.enabledPromptPresetIds,
      customPromptPresets: state.customPromptPresets,
      hydrateFromServer: state.hydrateFromServer,
      patchSettings: state.patchSettings,
      setTheme: state.setTheme,
      setLanguage: state.setLanguage,
      setFontSize: state.setFontSize,
      setSendOnEnter: state.setSendOnEnter,
      setShowTimestamp: state.setShowTimestamp,
      setEnableSound: state.setEnableSound,
      setTone: state.setTone,
      setResponseDensity: state.setResponseDensity,
      setWorkMode: state.setWorkMode,
      setAutoMemoryEnabled: state.setAutoMemoryEnabled,
      setAllowMcp: state.setAllowMcp,
      markSaving: state.markSaving,
      markSaved: state.markSaved,
      markSaveError: state.markSaveError,
      saveStatus: state.saveStatus,
      saveError: state.saveError,
    })),
  )

  const { setTheme } = useTheme()

  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [agentMemoryEntries, setAgentMemoryEntries] = useState<AgentUserMemoryEntry[]>([])
  const [agentMemoryLoading, setAgentMemoryLoading] = useState(true)
  const [agentMemoryError, setAgentMemoryError] = useState('')
  const [availablePromptPresets, setAvailablePromptPresets] = useState<PromptPresetOption[]>([])
  const [presetsLoading, setPresetsLoading] = useState(true)
  const [activeSection, setActiveSection] = useState<(typeof settingsSections)[number]['id']>('profile')
  const [nameStatus, setNameStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [nameError, setNameError] = useState('')
  const [memoryDraft, setMemoryDraft] = useState('')
  const [memoryKind, setMemoryKind] = useState<'preference' | 'project_context'>('preference')
  const [isAddingMemory, setIsAddingMemory] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false)

  const settingsSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nameSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const initializedRef = useRef(false)
  const lastSettingsRef = useRef('')
  const lastNameRef = useRef('')

  const visiblePromptPresets = useMemo(
    () => mergeVisiblePromptPresets(availablePromptPresets, customPromptPresets),
    [availablePromptPresets, customPromptPresets],
  )

  const currentSettings = useMemo<UserSettings>(
    () => ({
      theme,
      language,
      fontSize,
      sendOnEnter,
      showTimestamp,
      enableSound,
      tone,
      responseDensity,
      workMode,
      autoMemoryEnabled,
      allowMcp,
      agentRolePromptMarkdown,
      enabledPromptPresetIds,
      customPromptPresets,
    }),
    [
      theme,
      language,
      fontSize,
      sendOnEnter,
      showTimestamp,
      enableSound,
      tone,
      responseDensity,
      workMode,
      autoMemoryEnabled,
      allowMcp,
      agentRolePromptMarkdown,
      enabledPromptPresetIds,
      customPromptPresets,
    ],
  )

  const persistSettings = useCallback(
    async (settings: UserSettings) => {
      try {
        const updatedUser = await userService.updateSettings(settings)
        const mergedSettings = mergeUserSettings(updatedUser.settings)
        lastSettingsRef.current = JSON.stringify(mergedSettings)
        hydrateFromServer(mergedSettings)
        setTheme(mergedSettings.theme)
        setUser(updatedUser)
        markSaved()
      } catch (error) {
        markSaveError(getErrorMessage(error, '设置保存失败'))
      }
    },
    [hydrateFromServer, markSaveError, markSaved, setTheme, setUser],
  )

  const flushSettingsSave = useCallback(() => {
    if (!initializedRef.current) return

    if (settingsSaveTimerRef.current) {
      clearTimeout(settingsSaveTimerRef.current)
      settingsSaveTimerRef.current = null
    }

    const serialized = JSON.stringify(currentSettings)
    if (serialized === lastSettingsRef.current) {
      return
    }

    markSaving()
    void persistSettings(currentSettings)
  }, [currentSettings, markSaving, persistSettings])

  const persistDisplayName = useCallback(
    async (value: string) => {
      const nextValue = value.trim()
      if (nextValue.length < 2) {
        setNameStatus('error')
        setNameError('昵称至少 2 个字符')
        return
      }

      try {
        setNameStatus('saving')
        setNameError('')
        const updatedUser = await userService.updateProfile(nextValue)
        setUser(updatedUser)
        setDisplayName(updatedUser.name ?? '')
        lastNameRef.current = updatedUser.name ?? ''
        setNameStatus('saved')
      } catch (error) {
        setNameStatus('error')
        setNameError(getErrorMessage(error, '昵称保存失败'))
      }
    },
    [setUser],
  )

  const flushDisplayNameSave = useCallback(() => {
    if (!initializedRef.current) return

    if (nameSaveTimerRef.current) {
      clearTimeout(nameSaveTimerRef.current)
      nameSaveTimerRef.current = null
    }

    const trimmedName = displayName.trim()
    if (trimmedName === lastNameRef.current.trim()) {
      return
    }

    void persistDisplayName(trimmedName)
  }, [displayName, persistDisplayName])

  useEffect(() => {
    let cancelled = false

    const loadPageData = async () => {
      try {
        setIsLoading(true)
        setLoadError('')

        const [profile, memory, agentConfig] = await Promise.all([
          userService.getMe(),
          userService.getAgentMemory(),
          getAgentConfig().catch(() => ({ promptPresets: [], tools: [] })),
        ])

        if (cancelled) return

        const mergedSettings = mergeUserSettings(profile.settings)
        setUser(profile)
        hydrateFromServer(mergedSettings)
        setTheme(mergedSettings.theme)
        setDisplayName(profile.name ?? '')
        setAgentMemoryEntries(memory.entries)
        setAvailablePromptPresets(agentConfig.promptPresets ?? [])
        setAgentMemoryLoading(false)
        setPresetsLoading(false)

        lastSettingsRef.current = JSON.stringify(mergedSettings)
        lastNameRef.current = profile.name ?? ''
        initializedRef.current = true
      } catch (error) {
        if (!cancelled) {
          setLoadError(getErrorMessage(error, '加载设置失败'))
          setAgentMemoryLoading(false)
          setPresetsLoading(false)
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadPageData()

    return () => {
      cancelled = true
      if (settingsSaveTimerRef.current) clearTimeout(settingsSaveTimerRef.current)
      if (nameSaveTimerRef.current) clearTimeout(nameSaveTimerRef.current)
    }
  }, [hydrateFromServer, setTheme, setUser])

  useEffect(() => {
    if (!initializedRef.current) return

    const serialized = JSON.stringify(currentSettings)
    if (serialized === lastSettingsRef.current) {
      return
    }

    markSaving()
    if (settingsSaveTimerRef.current) {
      clearTimeout(settingsSaveTimerRef.current)
    }

    settingsSaveTimerRef.current = setTimeout(() => {
      void persistSettings(currentSettings)
    }, SETTINGS_DEBOUNCE_MS)

    return () => {
      if (settingsSaveTimerRef.current) clearTimeout(settingsSaveTimerRef.current)
    }
  }, [currentSettings, markSaving, persistSettings])

  useEffect(() => {
    if (!initializedRef.current) return

    const trimmedName = displayName.trim()
    if (trimmedName === lastNameRef.current.trim()) {
      return
    }

    if (trimmedName.length < 2) {
      setNameStatus('error')
      setNameError('昵称至少 2 个字符')
      return
    }

    setNameStatus('saving')
    setNameError('')

    if (nameSaveTimerRef.current) {
      clearTimeout(nameSaveTimerRef.current)
    }

    nameSaveTimerRef.current = setTimeout(() => {
      void persistDisplayName(trimmedName)
    }, SETTINGS_DEBOUNCE_MS)

    return () => {
      if (nameSaveTimerRef.current) clearTimeout(nameSaveTimerRef.current)
    }
  }, [displayName, persistDisplayName])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        const nextId = visible[0]?.target.id as (typeof settingsSections)[number]['id'] | undefined
        if (nextId) {
          setActiveSection(nextId)
        }
      },
      {
        rootMargin: '-20% 0px -60% 0px',
        threshold: [0.1, 0.4, 0.7],
      },
    )

    for (const section of settingsSections) {
      const element = document.getElementById(section.id)
      if (element) {
        observer.observe(element)
      }
    }

    return () => observer.disconnect()
  }, [isLoading])

  const handleDeleteAgentMemory = useCallback(async (id: string) => {
    if (typeof window !== 'undefined' && !window.confirm('删除这条长期偏好记忆？此操作不可撤销。')) {
      return
    }

    try {
      setAgentMemoryError('')
      const result = await userService.updateAgentMemory({ action: 'delete', id })
      setAgentMemoryEntries(result.entries)
    } catch (error) {
      setAgentMemoryError(getErrorMessage(error, '删除记忆失败'))
    }
  }, [])

  const handleClearAgentMemory = useCallback(async () => {
    if (typeof window !== 'undefined' && !window.confirm('清空全部长期记忆？此操作不可撤销。')) {
      return
    }

    try {
      setAgentMemoryError('')
      const result = await userService.updateAgentMemory({ action: 'clear' })
      setAgentMemoryEntries(result.entries)
    } catch (error) {
      setAgentMemoryError(getErrorMessage(error, '清空记忆失败'))
    }
  }, [])

  const handleAddAgentMemory = useCallback(async () => {
    if (!memoryDraft.trim()) {
      setAgentMemoryError('请先输入要长期记住的内容')
      return
    }

    try {
      setIsAddingMemory(true)
      setAgentMemoryError('')
      const result = await userService.updateAgentMemory({
        action: 'add',
        kind: memoryKind,
        content: memoryDraft,
      })
      setAgentMemoryEntries(result.entries)
      setMemoryDraft('')
    } catch (error) {
      setAgentMemoryError(getErrorMessage(error, '新增记忆失败'))
    } finally {
      setIsAddingMemory(false)
    }
  }, [memoryDraft, memoryKind])

  const handleSetTheme = useCallback(
    (nextTheme: UserSettings['theme']) => {
      setTheme(nextTheme)
      setThemeSetting(nextTheme)
    },
    [setTheme, setThemeSetting],
  )

  const handleUpdatePassword = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      setPasswordError('')
      setPasswordSuccess('')

      if (!currentPassword || !newPassword || !confirmPassword) {
        setPasswordError('请完整填写密码字段')
        return
      }

      if (newPassword !== confirmPassword) {
        setPasswordError('两次输入的新密码不一致')
        return
      }

      setIsSubmittingPassword(true)
      try {
        await userService.updatePassword({ currentPassword, newPassword })
        setPasswordSuccess('密码修改成功')
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      } catch (error) {
        setPasswordError(getErrorMessage(error, '密码修改失败'))
      } finally {
        setIsSubmittingPassword(false)
      }
    },
    [confirmPassword, currentPassword, newPassword],
  )

  const scrollToSection = useCallback((id: (typeof settingsSections)[number]['id']) => {
    const element = document.getElementById(id)
    if (!element) return
    element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setActiveSection(id)
  }, [])

  const toggleEnabledPromptPreset = useCallback(
    (presetId: string) => {
      const next = enabledPromptPresetIds.includes(presetId)
        ? enabledPromptPresetIds.filter((id) => id !== presetId)
        : [...enabledPromptPresetIds, presetId]

      patchSettings({ enabledPromptPresetIds: next })
    },
    [enabledPromptPresetIds, patchSettings],
  )

  const updateCustomPromptPreset = useCallback(
    (presetId: string, updater: (preset: UserDefinedPromptPreset) => UserDefinedPromptPreset) => {
      patchSettings({
        customPromptPresets: customPromptPresets.map((preset) => (preset.id === presetId ? updater(preset) : preset)),
      })
    },
    [customPromptPresets, patchSettings],
  )

  const handleAddCustomPromptPreset = useCallback(() => {
    const nextIndex = customPromptPresets.length + 1
    const nextSkill = createPromptPresetTemplate(nextIndex)
    patchSettings({
      customPromptPresets: [...customPromptPresets, nextSkill],
      enabledPromptPresetIds: enabledPromptPresetIds.includes(nextSkill.id) ? enabledPromptPresetIds : [...enabledPromptPresetIds, nextSkill.id],
    })
  }, [customPromptPresets, enabledPromptPresetIds, patchSettings])

  const handleDeleteCustomPromptPreset = useCallback(
    (presetId: string) => {
      patchSettings({
        customPromptPresets: customPromptPresets.filter((preset) => preset.id !== presetId),
        enabledPromptPresetIds: enabledPromptPresetIds.filter((id) => id !== presetId),
      })
    },
    [customPromptPresets, enabledPromptPresetIds, patchSettings],
  )

  if (isLoading) {
    return (
      <div className="min-h-full bg-background">
        <div className="container mx-auto max-w-6xl px-4 py-8">
          <BackButton href="/chat" label="返回聊天" />
          <div className="rounded-3xl border border-border bg-card p-6 shadow-md">
            <p className="text-muted-foreground">设置加载中...</p>
          </div>
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="min-h-full bg-background">
        <div className="container mx-auto max-w-6xl px-4 py-8">
          <BackButton href="/chat" label="返回聊天" />
          <div className="rounded-3xl border border-destructive/40 bg-card p-6 shadow-md">
            <p className="text-sm text-destructive">{loadError}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,rgba(234,179,8,0.14),transparent_24%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.12),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent)]">
      <div className="mx-auto max-w-[1440px] px-4 py-8 xl:pl-[320px]">
        <BackButton href="/chat" label="返回聊天" className="mb-6" />

        <div className="mx-auto mb-6 max-w-6xl rounded-[28px] border border-border/70 bg-card/95 p-6 shadow-lg shadow-black/5 backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                Agent control center
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">调教你的 Qiu</h1>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                这里集中管理默认语气、角色设定、自动记忆、Prompt Presets 与 MCP 开关。主聊天流程保持极简，只有你主动开启的能力才会被默认加载。
              </p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/70 px-4 py-3 text-sm text-muted-foreground">
              {saveStatus === 'saving' && '设置保存中...'}
              {saveStatus === 'saved' && '设置已保存'}
              {saveStatus === 'error' && (saveError || '设置保存失败')}
              {saveStatus === 'idle' && '已同步'}
            </div>
          </div>
        </div>

        <div className="relative mx-auto max-w-6xl">
          <aside className="mb-6 xl:fixed xl:left-6 xl:top-24 xl:mb-0 xl:w-[260px] xl:max-h-[calc(100vh-7rem)] xl:overflow-auto">
            <div className="rounded-[28px] border border-border/70 bg-card/90 p-4 shadow-2xl shadow-black/20 backdrop-blur-xl">
              <p className="px-2 pb-3 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Sections
              </p>
              <nav className="space-y-1">
                {settingsSections.map((section) => {
                  const Icon = section.icon
                  const active = activeSection === section.id

                  return (
                    <Button
                      key={section.id}
                      type="button"
                      variant={active ? 'primary' : 'ghost'}
                      size="sm"
                      onClick={() => scrollToSection(section.id)}
                      className={`h-auto w-full items-center justify-start gap-3 rounded-2xl px-3 py-3 text-left text-sm transition ${
                        active
                          ? 'shadow-md shadow-primary/20'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{section.label}</span>
                    </Button>
                  )
                })}
              </nav>

              <div className="mt-4 rounded-2xl border border-border/60 bg-background/80 p-4 text-xs leading-6 text-muted-foreground">
                默认加载 Prompt Presets：{enabledPromptPresetIds.length} 项
                <br />
                自定义 Prompt Presets：{customPromptPresets.length} 项
                <br />
                长期记忆：{agentMemoryEntries.length} 条
              </div>
            </div>
          </aside>

          <div className="min-w-0 space-y-6">
            <SettingsSection id="profile" icon={<User className="h-5 w-5" />} title="个人资料">
              <div className="space-y-4">
                <div className="rounded-2xl border border-border/50 bg-muted p-4">
                  <label className="mb-1 block text-sm text-muted-foreground">邮箱</label>
                  <p className="font-medium">{user?.email}</p>
                </div>
                <div className="rounded-2xl border border-border/50 bg-muted p-4">
                  <Input
                    label="昵称"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    onBlur={flushDisplayNameSave}
                    placeholder="输入昵称"
                  />
                  <p className="mt-2 text-xs text-muted-foreground">
                    {nameStatus === 'saving' && '昵称保存中...'}
                    {nameStatus === 'saved' && '昵称已保存'}
                    {nameStatus === 'error' && (nameError || '昵称保存失败')}
                  </p>
                </div>
              </div>
            </SettingsSection>

            <SettingsSection id="agent" icon={<Sparkles className="h-5 w-5" />} title="Agent 偏好">
              <div className="space-y-4">
                <PreferenceOptionGroup
                  label="回复语气"
                  description="只影响表达风格，不改变事实和安全边界。"
                  value={tone}
                  options={toneOptions}
                  onChange={(value) => setTone(value as AgentToneSetting)}
                  onBlur={flushSettingsSave}
                />
                <PreferenceOptionGroup
                  label="回复密度"
                  description="控制回答是偏短、均衡还是偏详细。"
                  value={responseDensity}
                  options={densityOptions}
                  onChange={(value) => setResponseDensity(value as AgentResponseDensitySetting)}
                  onBlur={flushSettingsSave}
                />
                <PreferenceOptionGroup
                  label="工作方式"
                  description="决定 Qiu 默认是先拆步骤，还是更直接地推进。"
                  value={workMode}
                  options={workModeOptions}
                  onChange={(value) => setWorkMode(value as AgentWorkModeSetting)}
                  onBlur={flushSettingsSave}
                />

                <div className="flex items-center justify-between rounded-2xl border border-border/50 bg-muted p-4">
                  <div>
                    <p className="font-medium text-foreground">允许使用 MCP 工具</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      开启后允许调用已配置的 MCP 工具；关闭后仅保留内置工具。
                    </p>
                  </div>
                  <Switch
                    checked={allowMcp}
                    onCheckedChange={setAllowMcp}
                    onBlur={flushSettingsSave}
                  />
                </div>

                <div className="rounded-2xl border border-border/50 bg-muted p-4">
                  <div className="mb-3">
                    <p className="font-medium text-foreground">角色配置（Markdown）</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      手动写一段 markdown，告诉 Agent 应该扮演什么角色、遵循哪些默认规则。内容会作为系统级角色补充，适合长期偏好。
                    </p>
                  </div>
                  <textarea
                    value={agentRolePromptMarkdown}
                    onChange={(event) => patchSettings({ agentRolePromptMarkdown: event.target.value })}
                    onBlur={flushSettingsSave}
                    rows={10}
                    placeholder={`# 角色定位

你是我的产品与工程搭档，默认用中文回答。

## 输出偏好
- 先给结论，再给关键依据
- 如果涉及代码，优先给最小可执行方案
- 不要为了礼貌而弱化风险提示`}
                    className="min-h-[220px] w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm leading-6 text-foreground outline-none transition focus:border-primary/50"
                  />
                </div>
              </div>
            </SettingsSection>

            <SettingsSection id="memory" icon={<BrainCircuit className="h-5 w-5" />} title="自动记忆">
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-2xl border border-border/50 bg-muted p-4">
                  <div>
                    <p className="font-medium text-foreground">自动记住稳定偏好</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      只保存长期有效、低风险的偏好和项目背景，不会把一次性任务细节长期保留。
                    </p>
                  </div>
                  <Switch
                    checked={autoMemoryEnabled}
                    onCheckedChange={setAutoMemoryEnabled}
                    onBlur={flushSettingsSave}
                  />
                </div>

                <div className="rounded-2xl border border-border/50 bg-muted p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">手动补充长期记忆</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        对稳定偏好或项目背景可以直接手动写入，无需等待自动抽取。
                      </p>
                    </div>
                    <Button variant="outline" onClick={handleClearAgentMemory} disabled={agentMemoryEntries.length === 0}>
                      清空全部
                    </Button>
                  </div>

                  <div className="grid gap-3 md:grid-cols-[180px,minmax(0,1fr),auto]">
                    <select
                      value={memoryKind}
                      onChange={(event) => setMemoryKind(event.target.value as 'preference' | 'project_context')}
                      className="rounded-2xl border border-border bg-background px-3 py-2 text-sm"
                    >
                      <option value="preference">长期偏好</option>
                      <option value="project_context">项目背景</option>
                    </select>
                    <Input
                      value={memoryDraft}
                      onChange={(event) => setMemoryDraft(event.target.value)}
                      placeholder="例如：默认用中文回复，并在代码建议里优先给最小补丁"
                    />
                    <Button onClick={handleAddAgentMemory} disabled={isAddingMemory}>
                      {isAddingMemory ? '写入中...' : '加入记忆'}
                    </Button>
                  </div>
                </div>

                {agentMemoryError && <p className="text-sm text-destructive">{agentMemoryError}</p>}

                {agentMemoryLoading ? (
                  <div className="rounded-2xl border border-border/50 bg-muted p-4 text-sm text-muted-foreground">
                    加载记忆中...
                  </div>
                ) : agentMemoryEntries.length === 0 ? (
                  <div className="rounded-2xl border border-border/50 bg-muted p-4 text-sm text-muted-foreground">
                    目前还没有长期记忆。Qiu 只会在内容稳定且低风险时才自动记住。
                  </div>
                ) : (
                  <div className="space-y-3">
                    {agentMemoryEntries.map((entry) => (
                      <div key={entry.id} className="rounded-2xl border border-border/50 bg-muted p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">
                              {entry.kind === 'preference' ? '偏好' : '项目背景'}
                            </p>
                            <p className="mt-1 break-words font-medium text-foreground">{entry.content}</p>
                            <p className="mt-2 text-xs text-muted-foreground">来源：{entry.source}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              更新时间：{new Date(entry.updatedAt).toLocaleString('zh-CN')}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => handleDeleteAgentMemory(entry.id)}
                            className="h-9 w-9 rounded-lg border-border/60 p-0 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </SettingsSection>

            <SettingsSection id="presets" icon={<WandSparkles className="h-5 w-5" />} title="Prompt Presets">
              <div className="space-y-4">
                <div className="rounded-2xl border border-border/50 bg-muted p-4 text-sm leading-6 text-muted-foreground">
                  Prompt Presets 用来补充角色与表达风格。只有你勾选为默认加载的 preset 会进入系统提示词，且不会影响工具权限或运行策略。
                  自定义 preset 只保存一份 Markdown 文本，适合沉淀可复用的提示词片段。
                </div>

                <div className="rounded-2xl border border-border/50 bg-muted p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">默认加载的 Prompt Presets</p>
                      <p className="text-sm text-muted-foreground">切换默认加载项。未勾选的 preset 保留在能力池中，需要时再启用。</p>
                    </div>
                    <span className="rounded-full bg-background px-3 py-1 text-xs text-muted-foreground">
                      {presetsLoading ? '加载中' : `${visiblePromptPresets.length} 项`}
                    </span>
                  </div>

                  {presetsLoading ? (
                    <p className="text-sm text-muted-foreground">正在加载 Prompt Presets...</p>
                  ) : visiblePromptPresets.length === 0 ? (
                    <p className="text-sm text-muted-foreground">当前没有可管理的 Prompt Preset。</p>
                  ) : (
                    <div className="grid gap-3 xl:grid-cols-2">
                      {visiblePromptPresets.map((preset) => {
                        const selected = enabledPromptPresetIds.includes(preset.id)
                        return (
                          <div
                            key={preset.id}
                            className={`rounded-2xl border px-4 py-4 text-left transition ${
                              selected
                                ? 'border-primary/40 bg-background shadow-sm'
                                : 'border-border bg-background/70 hover:border-primary/20'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-medium text-foreground">{preset.name}</p>
                                <p className="mt-1 text-sm text-muted-foreground">{preset.description}</p>
                              </div>
                              <Switch checked={selected} onCheckedChange={() => toggleEnabledPromptPreset(preset.id)} />
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                              <span className="rounded-full bg-muted px-3 py-1">来源 {preset.source ?? 'builtin'}</span>
                              <span className="rounded-full bg-muted px-3 py-1">风险 {preset.riskLevel}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-border/50 bg-muted p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">自定义 Prompt Presets</p>
                      <p className="text-sm text-muted-foreground">每个 preset 只保存一份 Markdown 文本；启用后会出现在能力池里，并可设为默认加载。</p>
                    </div>
                    <Button onClick={handleAddCustomPromptPreset}>新增 preset</Button>
                  </div>

                  {customPromptPresets.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border bg-background/70 p-4 text-sm text-muted-foreground">
                      还没有自定义 preset。点击上方按钮创建一个模板。
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {customPromptPresets.map((preset) => {
                        const summary = parsePromptPresetSummary(preset.content, preset.id)
                        const selected = enabledPromptPresetIds.includes(preset.id)

                        return (
                          <div key={preset.id} className="rounded-2xl border border-border bg-background p-4">
                            <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                              <div>
                                <p className="font-medium text-foreground">{summary.title}</p>
                                <p className="mt-1 text-sm text-muted-foreground">{summary.description}</p>
                                <p className="mt-2 text-xs text-muted-foreground">Preset ID: {preset.id}</p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <label className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-2 text-xs text-muted-foreground">
                                  已发布
                                  <Switch
                                    checked={preset.enabled}
                                    onCheckedChange={(checked) => {
                                      updateCustomPromptPreset(preset.id, (item) => ({ ...item, enabled: checked }))
                                      if (!checked && selected) {
                                        toggleEnabledPromptPreset(preset.id)
                                      }
                                    }}
                                  />
                                </label>
                                <label className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-2 text-xs text-muted-foreground">
                                  默认加载
                                  <Switch
                                    checked={selected}
                                    onCheckedChange={() => toggleEnabledPromptPreset(preset.id)}
                                    disabled={!preset.enabled}
                                  />
                                </label>
                                <Button variant="outline" size="sm" onClick={() => handleDeleteCustomPromptPreset(preset.id)}>
                                  删除
                                </Button>
                              </div>
                            </div>

                            <textarea
                              value={preset.content}
                              onChange={(event) =>
                                updateCustomPromptPreset(preset.id, (item) => ({
                                  ...item,
                                  content: event.target.value,
                                }))
                              }
                              onBlur={flushSettingsSave}
                              rows={14}
                              className="min-h-[280px] w-full rounded-2xl border border-border bg-muted/40 px-4 py-3 font-mono text-sm leading-6 text-foreground outline-none transition focus:border-primary/50"
                            />
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </SettingsSection>

            <SettingsSection id="conversation" icon={<BookOpenText className="h-5 w-5" />} title="对话体验">
              <div className="space-y-4">
                <div className="rounded-2xl border border-border/50 bg-muted p-4">
                  <label className="mb-2 block text-sm text-muted-foreground">语言偏好</label>
                  <select
                    value={language}
                    onChange={(event) => setLanguage(event.target.value as UserSettings['language'])}
                    onBlur={flushSettingsSave}
                    className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm"
                  >
                    <option value="zh-CN">简体中文</option>
                    <option value="en-US">English (US)</option>
                  </select>
                </div>

                <div className="rounded-2xl border border-border/50 bg-muted p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <label className="text-sm text-muted-foreground">字体大小</label>
                    <span className="text-sm font-medium">{fontSize}px</span>
                  </div>
                  <input
                    type="range"
                    min={12}
                    max={20}
                    step={1}
                    value={fontSize}
                    onChange={(event) => setFontSize(Number(event.target.value))}
                    onMouseUp={flushSettingsSave}
                    onTouchEnd={flushSettingsSave}
                    className="w-full"
                  />
                </div>

                <div className="flex items-center justify-between rounded-2xl border border-border/50 bg-muted p-4">
                  <span>Enter 发送消息</span>
                  <Switch checked={sendOnEnter} onCheckedChange={setSendOnEnter} onBlur={flushSettingsSave} />
                </div>

                <div className="flex items-center justify-between rounded-2xl border border-border/50 bg-muted p-4">
                  <span>显示消息时间戳</span>
                  <Switch checked={showTimestamp} onCheckedChange={setShowTimestamp} onBlur={flushSettingsSave} />
                </div>
              </div>
            </SettingsSection>

            <SettingsSection id="appearance" icon={<Moon className="h-5 w-5" />} title="外观">
              <div className="rounded-2xl border border-border/50 bg-muted p-4">
                <div className="flex gap-3">
                  <Button variant={theme === 'light' ? 'primary' : 'outline'} size="sm" onClick={() => handleSetTheme('light')} className="flex-1">
                    <Sun className="mr-2 h-4 w-4" />
                    浅色
                  </Button>
                  <Button variant={theme === 'dark' ? 'primary' : 'outline'} size="sm" onClick={() => handleSetTheme('dark')} className="flex-1">
                    <Moon className="mr-2 h-4 w-4" />
                    深色
                  </Button>
                  <Button variant={theme === 'system' ? 'primary' : 'outline'} size="sm" onClick={() => handleSetTheme('system')} className="flex-1">
                    <Monitor className="mr-2 h-4 w-4" />
                    跟随系统
                  </Button>
                </div>
              </div>
            </SettingsSection>

            <SettingsSection id="api-keys" icon={<Key className="h-5 w-5" />} title="API Keys">
              <div className="mb-4 rounded-2xl border border-border/50 bg-muted p-4">
                <p className="text-muted-foreground">管理你的 API Keys，以连接不同模型。</p>
              </div>
              <Link href="/settings/api-keys">
                <Button variant="outline" className="w-full bg-card shadow-sm hover:bg-card/80 md:w-auto">
                  管理 API Keys
                </Button>
              </Link>
            </SettingsSection>

            <SettingsSection id="notifications" icon={<Bell className="h-5 w-5" />} title="通知">
              <div className="flex items-center justify-between rounded-2xl border border-border/50 bg-muted p-4">
                <span>启用声音提示</span>
                <Switch checked={enableSound} onCheckedChange={setEnableSound} onBlur={flushSettingsSave} />
              </div>
            </SettingsSection>

            <SettingsSection id="security" icon={<Lock className="h-5 w-5" />} title="安全">
              <form onSubmit={handleUpdatePassword} className="space-y-4">
                <Input
                  type="password"
                  label="当前密码"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  autoComplete="current-password"
                />
                <Input
                  type="password"
                  label="新密码"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  autoComplete="new-password"
                />
                <Input
                  type="password"
                  label="确认新密码"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                />

                {passwordError && <p className="text-sm text-destructive">{passwordError}</p>}
                {passwordSuccess && <p className="text-sm text-emerald-600">{passwordSuccess}</p>}

                <Button type="submit" disabled={isSubmittingPassword}>
                  {isSubmittingPassword ? '提交中...' : '更新密码'}
                </Button>
              </form>
            </SettingsSection>
          </div>
        </div>
      </div>
    </div>
  )
}

function PreferenceOptionGroup({
  label,
  description,
  value,
  options,
  onChange,
  onBlur,
}: {
  label: string
  description: string
  value: string
  options: Array<{ value: string; label: string; description: string }>
  onChange: (value: string) => void
  onBlur: () => void
}) {
  return (
    <div className="rounded-2xl border border-border/50 bg-muted p-4">
      <p className="font-medium text-foreground">{label}</p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {options.map((option) => (
          <Button
            key={option.value}
            type="button"
            variant="outline"
            onClick={() => {
              onChange(option.value)
              onBlur()
            }}
            className={`h-auto flex-col items-start justify-start rounded-2xl px-4 py-3 text-left transition-colors ${
              value === option.value
                ? 'border-primary/60 bg-background text-foreground shadow-sm ring-2 ring-primary/12'
                : 'border-border bg-background/60 text-muted-foreground hover:border-primary/25 hover:bg-background hover:text-foreground'
            }`}
          >
            <p className="w-full text-left font-medium">{option.label}</p>
            <p className="mt-1 w-full text-left text-sm">{option.description}</p>
          </Button>
        ))}
      </div>
    </div>
  )
}
