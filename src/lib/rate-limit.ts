import { redis } from './redis';

// 速率限制配置
interface RateLimitConfig {
  windowMs: number; // 时间窗口（毫秒）
  maxRequests: number; // 最大请求数
}

// 默认配置
const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60 * 1000, // 1分钟
  maxRequests: 60, // 每分钟 60 次请求
};

// 严格配置
const STRICT_CONFIG: RateLimitConfig = {
  windowMs: 60 * 1000, // 1分钟
  maxRequests: 10, // 每分钟 10 次请求
};

// API 路由配置
const ROUTE_CONFIGS: Record<string, RateLimitConfig> = {
  '/api/chat': STRICT_CONFIG,
  '/api/chat/completions': STRICT_CONFIG,
  '/api/auth/login': {
    windowMs: 15 * 60 * 1000, // 15分钟
    maxRequests: 5, // 每15分钟 5 次登录尝试
  },
  '/api/auth/register': {
    windowMs: 60 * 60 * 1000, // 1小时
    maxRequests: 3, // 每小时 3 次注册
  },
};

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetTime: number;
}

/**
 * 基于 Redis 的速率限制器
 * @param identifier - 标识符（通常是用户 IP 或用户 ID）
 * @param route - 路由路径
 */
export async function rateLimit(
  identifier: string,
  route: string
): Promise<RateLimitResult> {
  // 获取对应路由的配置，如果没有则使用默认配置
  const config = ROUTE_CONFIGS[route] || DEFAULT_CONFIG;
  const key = `ratelimit:${route}:${identifier}`;

  try {
    // 使用 Redis 的 INCR 和 EXPIRE 实现滑动窗口
    const current = await redis.incr(key);

    if (current === 1) {
      // 第一次请求，设置过期时间
      await redis.pexpire(key, config.windowMs);
    }

    const ttl = await redis.pttl(key);
    const resetTime = Date.now() + ttl;
    const remaining = Math.max(0, config.maxRequests - current);

    return {
      success: current <= config.maxRequests,
      remaining,
      resetTime,
    };
  } catch (error) {
    console.error('Rate limit error:', error);
    // Redis 出错时允许请求通过
    return {
      success: true,
      remaining: config.maxRequests,
      resetTime: Date.now() + config.windowMs,
    };
  }
}

/**
 * 速率限制中间件
 * @param request - Next.js 请求对象
 */
export async function rateLimitMiddleware(request: Request): Promise<Response | null> {
  // 获取客户端 IP
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ||
    request.headers.get('x-real-ip') ||
    'unknown';

  // 获取路径
  const url = new URL(request.url);
  const route = url.pathname;

  // 检查是否是 API 路由
  if (!route.startsWith('/api/')) {
    return null;
  }

  const result = await rateLimit(ip, route);

  if (!result.success) {
    return new Response(
      JSON.stringify({
        success: false,
        message: '请求过于频繁，请稍后再试',
        code: 'RATE_LIMIT_EXCEEDED',
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': new Date(result.resetTime).toISOString(),
        },
      }
    );
  }

  return null;
}
