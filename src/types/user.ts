import type { UserSettings } from './settings'

export interface User {
  id: string
  email: string
  name: string | null
  createdAt: Date | string
  updatedAt?: Date | string
  settings: UserSettings
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
  tokenType?: string
  expiresIn: number
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterCredentials {
  email: string
  password: string
  nickname?: string
}
