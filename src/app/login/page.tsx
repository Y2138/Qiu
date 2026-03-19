'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { login } from '@/services/auth'
import { useAuthStore } from '@/stores'
import { Button } from '@/components/common/Button'
import { Loading } from '@/components/common/Loading'
import { AuthLayout, AuthFormField, FormErrorAlert } from '@/components/auth'
import { Eye, EyeOff, Mail, Lock } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const { login: storeLogin } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)
    try {
      const response = await login({ email, password })
      storeLogin(response.user)
      router.push('/chat')
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AuthLayout
      title="登录 Qiu"
      subtitle="回来继续你的任务"
      footerText="当前线上版本仅开放给已有账号使用。"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && <FormErrorAlert message={error} />}

        <AuthFormField
          id="email"
          label="邮箱"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="your@email.com"
          required
          icon={<Mail className="h-5 w-5" />}
        />
        <AuthFormField
          id="password"
          label="密码"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="••••••••"
          required
          showPassword={showPassword}
          icon={<Lock className="h-5 w-5" />}
          passwordToggle={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setShowPassword(!showPassword)}
              className="h-9 w-9 rounded-full text-muted-foreground hover:text-foreground"
              aria-label={showPassword ? '隐藏密码' : '显示密码'}
            >
              {showPassword ? (
                <EyeOff className="h-5 w-5" />
              ) : (
                <Eye className="h-5 w-5" />
              )}
            </Button>
          }
        />

        <Button
          type="submit"
          className="h-12 w-full rounded-xl text-base font-semibold"
          disabled={isLoading}
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <Loading size="sm" className="flex-none" />
              登录中...
            </span>
          ) : (
            '登录'
          )}
        </Button>
      </form>
    </AuthLayout>
  )
}
