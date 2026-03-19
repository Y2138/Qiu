'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { login as loginApi, register as registerApi, logout as logoutApi, getCurrentUser } from '@/services/auth'
import { useAuthStore } from '@/stores/authStore'
import type { LoginCredentials, RegisterCredentials } from '@/types/user'

export function useAuth() {
  const router = useRouter()
  const { user, isAuthenticated, login: storeLogin, logout: storeLogout } = useAuthStore()

  const login = useCallback(async (credentials: LoginCredentials) => {
    const response = await loginApi(credentials)
    storeLogin(response.user)
    return response
  }, [storeLogin])

  const register = useCallback(async (credentials: RegisterCredentials) => {
    const response = await registerApi(credentials)
    storeLogin(response.user)
    return response
  }, [storeLogin])

  const logout = useCallback(async () => {
    try {
      await logoutApi()
    } catch {
      // 忽略错误
    }
    storeLogout()
    router.push('/login')
  }, [storeLogout, router])

  const refreshUser = useCallback(async () => {
    try {
      const user = await getCurrentUser()
      return user
    } catch {
      storeLogout()
      router.push('/login')
      throw new Error('获取用户信息失败')
    }
  }, [storeLogout, router])

  return {
    user,
    isAuthenticated,
    login,
    register,
    logout,
    refreshUser,
  }
}
