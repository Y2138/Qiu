export const APP_NAME = 'QiuChat'
export const APP_VERSION = '1.0.0'

export const STORAGE_KEYS = {
  AUTH: 'qiuchat-auth',
  SETTINGS: 'qiuchat-settings',
  SESSIONS: 'qiuchat-sessions',
  THEME: 'qiuchat-theme',
} as const

export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/auth/login',
    REGISTER: '/auth/register',
    LOGOUT: '/auth/logout',
    REFRESH: '/auth/refresh',
    ME: '/auth/me',
  },
  CHAT: {
    SESSIONS: '/chat/sessions',
    SEND: '/chat/send',
    STOP: '/chat/stop',
    REGENERATE: '/chat/regenerate',
  },
  MODELS: {
    LIST: '/models',
    CUSTOM: '/models/custom',
  },
  API_KEYS: {
    LIST: '/api-keys',
    VALIDATE: '/api-keys/validate',
  },
  FILES: {
    UPLOAD: '/files/upload',
  },
} as const

export const MAX_MESSAGES_PER_SESSION = 1000
export const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
export const DEFAULT_PAGE_SIZE = 20
