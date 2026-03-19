'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser } from '@/services/auth'
import { useAuthStore } from '@/stores'
import { useSettingsStore } from '@/stores/settingsStore'
import { AppLayout } from '@/components/layout/AppLayout'
import { FullScreenLoading } from '@/components/common/Loading'

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const checkAuth = async () => {
      if (!isAuthenticated) {
        try {
          const user = await getCurrentUser()
          useAuthStore.getState().login(user)
          useSettingsStore.getState().hydrateFromServer(user.settings)
        } catch {
          router.push('/login')
          return
        }
      }
      setIsLoading(false)
    }

    checkAuth()
  }, [isAuthenticated, router])

  // 始终渲染 AppLayout 骨架，仅在主内容区显示 loading，避免整树切换导致的布局抖动（CLS）
  return (
    <AppLayout>
      {isLoading ? <FullScreenLoading message="加载中..." /> : children}
    </AppLayout>
  )
}
