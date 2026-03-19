import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// 公开路径，不需要认证
const publicPaths = [
  '/login',
  '/register',
]

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 跳过静态文件和 Next.js 内部路径
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname.includes('.') ||
    pathname.startsWith('/public')
  ) {
    return NextResponse.next()
  }

  // API 请求直接代理到后端，不做认证检查（由后端处理）
  // 后端会检查 cookie 中的 token
  if (pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  // 公开页面不需要认证
  if (publicPaths.includes(pathname) || publicPaths.some((path) => pathname.startsWith(path))) {
    return NextResponse.next()
  }

  // 检查认证 cookie
  const accessToken = request.cookies.get('accessToken')

  // 如果没有登录，重定向到登录页
  if (!accessToken) {
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    // 匹配所有路径除了:
    // - _next/static (静态文件)
    // - _next/image (图片优化)
    // - favicon.ico (图标)
    // - /api/* (API 请求)
    '/((?!_next/static|_next/image|favicon.ico|api/).*)',
  ],
}
