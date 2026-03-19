import { create } from 'zustand'

interface UIState {
  sidebarOpen: boolean
  settingsOpen: boolean
  searchQuery: string

  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  toggleSettings: () => void
  setSettingsOpen: (open: boolean) => void
  setSearchQuery: (query: string) => void
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  settingsOpen: false,
  searchQuery: '',

  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  toggleSettings: () => set((state) => ({ settingsOpen: !state.settingsOpen })),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setSearchQuery: (query) => set({ searchQuery: query }),
}))
