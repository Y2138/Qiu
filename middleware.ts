import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// 公开路径，不需要认证
const publicPaths = [
  '/login',
  '/register',
  '/api/auth/login',
  '/api/auth/register',
]

// 静态资源路径
const staticPaths = [
  '/_next',
  '/favicon.ico',
  '/public',
]

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 允许静态资源
  if (staticPaths.some(path => pathname.startsWith(path))) {
    return NextResponse.next()
  }

  // 允许公开路径
  if (publicPaths.some(path => pathname === path || pathname.startsWith(path + '/'))) {
    return NextResponse.next()
  }

  // 检查认证 cookie
  const token = getRequestAuthToken(request)

  // 如果没有 token 且访问的是受保护页面，重定向到登录
  if (!token) {
    // 对于 API 请求，返回 401
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      )
    }

    // 对于页面请求，重定向到登录
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // 验证 token 并添加到请求头（供 API 路由使用）
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('Authorization', `Bearer ${token}`)

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })
}

function getRequestAuthToken(request: NextRequest): string | undefined {
  const candidates = [
    request.cookies.get('auth_token')?.value,
    request.cookies.get('accessToken')?.value,
  ]

  for (const candidate of candidates) {
    const normalized = normalizeToken(candidate)
    if (normalized) {
      return normalized
    }
  }

  return undefined
}

function normalizeToken(value?: string): string | undefined {
  if (!value) return undefined

  const normalized = value.trim()
  if (!normalized) return undefined
  if (normalized === 'undefined' || normalized === 'null') return undefined

  return normalized
}

export const config = {
  matcher: [
    /*
     * 匹配所有路径除了:
     * - _next/static (静态文件)
     * - _next/image (图片优化)
     * - favicon.ico (图标)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
