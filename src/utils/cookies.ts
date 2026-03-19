import { cookies } from 'next/headers'

/**
 * Cookie 配置选项
 */
export interface CookieOptions {
  name: string
  value: string
  options?: {
    httpOnly?: boolean
    secure?: boolean
    sameSite?: 'lax' | 'strict' | 'none'
    maxAge?: number
    path?: string
    domain?: string
  }
}

/**
 * 设置 Cookie (服务端使用)
 */
export async function setCookie(options: CookieOptions): Promise<void> {
  const { name, value, options: cookieOptions = {} } = options

  const defaultOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
  }

  const cookieStore = await cookies()
  cookieStore.set(name, value, {
    ...defaultOptions,
    ...cookieOptions,
  })
}

/**
 * 获取 Cookie (服务端使用)
 */
export async function getCookie(name: string): Promise<string | undefined> {
  const cookieStore = await cookies()
  return cookieStore.get(name)?.value
}

/**
 * 删除 Cookie (服务端使用)
 */
export async function deleteCookie(name: string): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(name)
}

/**
 * 设置认证 Cookie (包含 accessToken 和 refreshToken)
 */
export async function setAuthCookies(accessToken: string, refreshToken: string): Promise<void> {
  const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '7d'
  const maxAge = parseJwtExpiresIn(jwtExpiresIn)

  const cookieStore = await cookies()

  cookieStore.set('accessToken', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: maxAge,
  })

  cookieStore.set('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: maxAge * 4, // refreshToken 有效期是 accessToken 的 4 倍
  })
}

/**
 * 清除认证 Cookie
 */
export async function clearAuthCookies(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete('accessToken')
  cookieStore.delete('refreshToken')
}

/**
 * 解析 JWT 过期时间字符串为秒数
 */
function parseJwtExpiresIn(expiresIn: string): number {
  const match = expiresIn.match(/^(\d+)([dhms])$/)
  if (!match) {
    return 7 * 24 * 60 * 60 // 默认 7 天
  }

  const value = parseInt(match[1], 10)
  const unit = match[2]

  switch (unit) {
    case 's':
      return value
    case 'm':
      return value * 60
    case 'h':
      return value * 60 * 60
    case 'd':
      return value * 24 * 60 * 60
    default:
      return 7 * 24 * 60 * 60
  }
}

/**
 * 验证 Token (服务端使用)
 * 注意：这里只是简单的验证 token 格式
 * 实际的 JWT 验证需要在 API 路由中使用 jsonwebtoken 库
 */
export async function verifyToken(token: string): Promise<boolean> {
  try {
    // 简单的格式验证：JWT 有三部分，用 . 分隔
    const parts = token.split('.')
    if (parts.length !== 3) {
      return false
    }

    // 解析 payload 部分
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString())

    // 检查是否过期
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      return false
    }

    return true
  } catch {
    return false
  }
}
