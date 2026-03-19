export type ThemeSetting = 'light' | 'dark' | 'system'
export type LanguageSetting = 'zh-CN' | 'en-US'
export type AgentToneSetting = 'gentle' | 'professional' | 'sharp' | 'concise'
export type AgentResponseDensitySetting = 'brief' | 'balanced' | 'detailed'
export type AgentWorkModeSetting = 'plan' | 'direct'

export interface UserDefinedPromptPreset {
  id: string
  enabled: boolean
  content: string
}

export interface AgentBehaviorPreferences {
  tone: AgentToneSetting
  responseDensity: AgentResponseDensitySetting
  workMode: AgentWorkModeSetting
  rolePromptMarkdown?: string
}

export interface UserSettings {
  theme: ThemeSetting
  language: LanguageSetting
  fontSize: number
  sendOnEnter: boolean
  showTimestamp: boolean
  enableSound: boolean
  tone: AgentToneSetting
  responseDensity: AgentResponseDensitySetting
  workMode: AgentWorkModeSetting
  autoMemoryEnabled: boolean
  allowMcp: boolean
  agentRolePromptMarkdown: string
  enabledPromptPresetIds: string[]
  customPromptPresets: UserDefinedPromptPreset[]
}

export type UserSettingsPatch = Partial<UserSettings>

export const USER_SETTINGS_DEFAULTS: UserSettings = {
  theme: 'system',
  language: 'zh-CN',
  fontSize: 14,
  sendOnEnter: true,
  showTimestamp: true,
  enableSound: false,
  tone: 'professional',
  responseDensity: 'balanced',
  workMode: 'plan',
  autoMemoryEnabled: true,
  allowMcp: true,
  agentRolePromptMarkdown: '',
  enabledPromptPresetIds: ['general-assistant'],
  customPromptPresets: [],
}

export function mergeUserSettings(settings?: unknown): UserSettings {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return USER_SETTINGS_DEFAULTS
  }

  const input = settings as Partial<UserSettings>

  return {
    theme:
      input.theme === 'light' || input.theme === 'dark' || input.theme === 'system'
        ? input.theme
        : USER_SETTINGS_DEFAULTS.theme,
    language:
      input.language === 'zh-CN' || input.language === 'en-US'
        ? input.language
        : USER_SETTINGS_DEFAULTS.language,
    fontSize:
      typeof input.fontSize === 'number' && input.fontSize >= 12 && input.fontSize <= 20
        ? input.fontSize
        : USER_SETTINGS_DEFAULTS.fontSize,
    sendOnEnter:
      typeof input.sendOnEnter === 'boolean'
        ? input.sendOnEnter
        : USER_SETTINGS_DEFAULTS.sendOnEnter,
    showTimestamp:
      typeof input.showTimestamp === 'boolean'
        ? input.showTimestamp
        : USER_SETTINGS_DEFAULTS.showTimestamp,
    enableSound:
      typeof input.enableSound === 'boolean'
        ? input.enableSound
        : USER_SETTINGS_DEFAULTS.enableSound,
    tone:
      input.tone === 'gentle' ||
      input.tone === 'professional' ||
      input.tone === 'sharp' ||
      input.tone === 'concise'
        ? input.tone
        : USER_SETTINGS_DEFAULTS.tone,
    responseDensity:
      input.responseDensity === 'brief' ||
      input.responseDensity === 'balanced' ||
      input.responseDensity === 'detailed'
        ? input.responseDensity
        : USER_SETTINGS_DEFAULTS.responseDensity,
    workMode:
      input.workMode === 'plan' || input.workMode === 'direct'
        ? input.workMode
        : USER_SETTINGS_DEFAULTS.workMode,
    autoMemoryEnabled:
      typeof input.autoMemoryEnabled === 'boolean'
        ? input.autoMemoryEnabled
        : USER_SETTINGS_DEFAULTS.autoMemoryEnabled,
    allowMcp:
      typeof input.allowMcp === 'boolean'
        ? input.allowMcp
        : USER_SETTINGS_DEFAULTS.allowMcp,
    agentRolePromptMarkdown:
      typeof input.agentRolePromptMarkdown === 'string'
        ? input.agentRolePromptMarkdown.slice(0, 6000)
        : USER_SETTINGS_DEFAULTS.agentRolePromptMarkdown,
    enabledPromptPresetIds: normalizeEnabledPromptPresetIds(input.enabledPromptPresetIds),
    customPromptPresets: normalizeCustomPromptPresets(input.customPromptPresets),
  }
}

export function toAgentBehaviorPreferences(settings?: unknown): AgentBehaviorPreferences {
  const merged = mergeUserSettings(settings)

  return {
    tone: merged.tone,
    responseDensity: merged.responseDensity,
    workMode: merged.workMode,
    rolePromptMarkdown: merged.agentRolePromptMarkdown || undefined,
  }
}

function normalizeEnabledPromptPresetIds(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return USER_SETTINGS_DEFAULTS.enabledPromptPresetIds
  }

  const ids = input
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => /^[a-z0-9-]{2,64}$/i.test(item))

  return ids.length > 0 ? Array.from(new Set(ids)) : USER_SETTINGS_DEFAULTS.enabledPromptPresetIds
}

function normalizeCustomPromptPresets(input: unknown): UserDefinedPromptPreset[] {
  if (!Array.isArray(input)) {
    return USER_SETTINGS_DEFAULTS.customPromptPresets
  }

  const items: UserDefinedPromptPreset[] = []
  for (const item of input) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const record = item as Partial<UserDefinedPromptPreset>
    if (typeof record.id !== 'string' || typeof record.content !== 'string') continue

    const id = record.id.trim().toLowerCase()
    const content = record.content.trim()
    if (!/^[a-z0-9-]{2,64}$/.test(id) || content.length === 0) continue

    items.push({
      id,
      enabled: typeof record.enabled === 'boolean' ? record.enabled : true,
      content: content.slice(0, 12000),
    })
  }

  return items.slice(0, 12)
}
