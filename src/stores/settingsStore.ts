import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  USER_SETTINGS_DEFAULTS,
  type UserSettings,
  type UserSettingsPatch,
  type UserDefinedPromptPreset,
  type ThemeSetting,
  type LanguageSetting,
  type AgentToneSetting,
  type AgentResponseDensitySetting,
  type AgentWorkModeSetting,
  mergeUserSettings,
} from '@/types/settings'

interface SettingsState {
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
  isLoaded: boolean
  saveStatus: 'idle' | 'saving' | 'saved' | 'error'
  saveError: string | null

  setTheme: (theme: ThemeSetting) => void
  setLanguage: (language: LanguageSetting) => void
  setFontSize: (size: number) => void
  setSendOnEnter: (enabled: boolean) => void
  setShowTimestamp: (show: boolean) => void
  setEnableSound: (enabled: boolean) => void
  setTone: (tone: AgentToneSetting) => void
  setResponseDensity: (density: AgentResponseDensitySetting) => void
  setWorkMode: (mode: AgentWorkModeSetting) => void
  setAutoMemoryEnabled: (enabled: boolean) => void
  setAllowMcp: (enabled: boolean) => void
  patchSettings: (settings: UserSettingsPatch) => void
  hydrateFromServer: (settings?: unknown) => void
  markSaving: () => void
  markSaved: () => void
  markSaveError: (message: string) => void
  clearSaveState: () => void
  resetSettings: () => void
}

const defaultState: UserSettings = {
  ...USER_SETTINGS_DEFAULTS,
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaultState,
      isLoaded: false,
      saveStatus: 'idle',
      saveError: null,

      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      setFontSize: (fontSize) => set({ fontSize }),
      setSendOnEnter: (sendOnEnter) => set({ sendOnEnter }),
      setShowTimestamp: (showTimestamp) => set({ showTimestamp }),
      setEnableSound: (enableSound) => set({ enableSound }),
      setTone: (tone) => set({ tone }),
      setResponseDensity: (responseDensity) => set({ responseDensity }),
      setWorkMode: (workMode) => set({ workMode }),
      setAutoMemoryEnabled: (autoMemoryEnabled) => set({ autoMemoryEnabled }),
      setAllowMcp: (allowMcp) => set({ allowMcp }),
      patchSettings: (settings) => set((state) => ({
        ...state,
        ...settings,
      })),
      hydrateFromServer: (settings) =>
        set(() => ({
          ...mergeUserSettings(settings),
          isLoaded: true,
          saveStatus: 'idle',
          saveError: null,
        })),
      markSaving: () => set({ saveStatus: 'saving', saveError: null }),
      markSaved: () => set({ saveStatus: 'saved', saveError: null }),
      markSaveError: (message) => set({ saveStatus: 'error', saveError: message }),
      clearSaveState: () => set({ saveStatus: 'idle', saveError: null }),
      resetSettings: () =>
        set({
          ...defaultState,
          saveStatus: 'idle',
          saveError: null,
        }),
    }),
    {
      name: 'settings-storage',
      partialize: (state) => ({
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
      }),
    }
  )
)
