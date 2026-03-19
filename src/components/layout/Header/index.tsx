'use client'

import { useSyncExternalStore } from 'react'
import { Settings, User, Sun, Moon } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/common/Button'
import { useAuthStore, useSettingsStore } from '@/stores'
import { useTheme } from '@/hooks'
import { ProviderSwitcher } from '@/components/ProviderSwitcher'
import { userService } from '@/services/user'

export function Header() {
  const { user, isAuthenticated, setUser } = useAuthStore()
  const setThemeSetting = useSettingsStore((state) => state.setTheme)
  const { resolvedTheme, setTheme } = useTheme()
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )

  const isDark = mounted && resolvedTheme === 'dark'

  const toggleTheme = () => {
    const nextTheme = isDark ? 'light' : 'dark'
    setTheme(nextTheme)
    setThemeSetting(nextTheme)

    if (!isAuthenticated || !user) {
      return
    }

    void userService.updateSettings({ theme: nextTheme })
      .then((updatedUser) => {
        setUser(updatedUser)
      })
      .catch((error) => {
        console.error('Failed to persist theme setting:', error)
      })
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-12 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60 shadow-sm">
      <div className="flex h-full items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold text-foreground">
            <div className="w-6 h-6 rounded bg-primary flex items-center justify-center shadow-md">
              <span className="text-primary-foreground text-xs font-bold">Q</span>
            </div>
            <span>Qiu</span>
          </Link>
        </div>

        <div className="flex items-center gap-2">
          {isAuthenticated && <ProviderSwitcher />}

          <Button
            onClick={toggleTheme}
            variant="ghost"
            size="icon"
            className="rounded-md text-primary hover:bg-primary/10"
            title={isDark ? '切换到浅色模式' : '切换到深色模式'}
          >
            {isDark ? (
              <Sun className="h-5 w-5" />
            ) : (
              <Moon className="h-5 w-5" />
            )}
          </Button>

          <Link href="/settings">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-md hover:bg-primary/10 text-primary"
            >
              <Settings className="h-5 w-5" />
            </Button>
          </Link>

          {isAuthenticated ? (
            <Button
              variant="ghost"
              size="icon"
              className="rounded-md hover:bg-primary/10 text-primary"
            >
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                <User className="h-4 w-4 text-primary" />
              </div>
            </Button>
          ) : (
            <Link href="/login">
              <Button variant="primary" size="sm" className="rounded-md">
                登录
              </Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
