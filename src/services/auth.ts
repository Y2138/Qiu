import type { User, LoginCredentials, RegisterCredentials } from '@/types/user'
import type { ApiResponse } from '@/types/api'

const API_BASE = '/api/auth'

interface AuthResponse {
  accessToken: string
  refreshToken: string
  tokenType: string
  expiresIn: number
  user: User
}

interface RefreshTokenResponse {
  accessToken: string
  refreshToken: string
  tokenType: string
  expiresIn: number
}

export async function login(credentials: LoginCredentials): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE}/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include', // 包含 cookie
    body: JSON.stringify(credentials),
  })

  const result: ApiResponse<AuthResponse> = await response.json()

  if (!response.ok || !result.success || !result.data) {
    throw new Error(result.error?.message || '登录失败')
  }

  // 认证 cookie 由服务端通过 Set-Cookie 维护，这里只清理旧的前端遗留 cookie。
  if (typeof document !== 'undefined') {
    document.cookie = 'accessToken=; path=/; max-age=0; SameSite=Lax'
    document.cookie = 'refreshToken=; path=/; max-age=0; SameSite=Lax'
  }

  return result.data
}

export async function register(credentials: RegisterCredentials): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE}/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include', // 包含 cookie
    body: JSON.stringify(credentials),
  })

  const result: ApiResponse<AuthResponse> = await response.json()

  if (!response.ok || !result.success || !result.data) {
    throw new Error(result.error?.message || '注册失败')
  }

  // 认证 cookie 由服务端通过 Set-Cookie 维护，这里只清理旧的前端遗留 cookie。
  if (typeof document !== 'undefined') {
    document.cookie = 'accessToken=; path=/; max-age=0; SameSite=Lax'
    document.cookie = 'refreshToken=; path=/; max-age=0; SameSite=Lax'
  }

  return result.data
}

export async function logout(): Promise<void> {
  await fetch(`${API_BASE}/logout`, {
    method: 'POST',
    credentials: 'include', // 包含 cookie
  })

  // 清除 cookie
  if (typeof document !== 'undefined') {
    document.cookie = 'accessToken=; path=/; max-age=0'
    document.cookie = 'refreshToken=; path=/; max-age=0'
  }
}

export async function refreshToken(): Promise<void> {
  const response = await fetch(`${API_BASE}/refresh`, {
    method: 'POST',
    credentials: 'include', // 包含 cookie
  })

  if (!response.ok) {
    throw new Error('令牌刷新失败')
  }
}

export async function getCurrentUser(): Promise<User> {
  const response = await fetch(`${API_BASE}/me`, {
    credentials: 'include', // 包含 cookie
  })

  const result: ApiResponse<User> = await response.json()

  if (!response.ok || !result.success || !result.data) {
    throw new Error(result.error?.message || '获取用户信息失败')
  }

  return result.data
}
