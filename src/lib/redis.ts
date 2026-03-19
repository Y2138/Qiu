import Redis from 'ioredis';

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

const DEFAULT_REDIS_URL = 'redis://localhost:6379';

function normalizeRedisUrl(redisUrl: string): string {
  try {
    const url = new URL(redisUrl);

    // Backward compatibility: `redis://password@host:port` is often written
    // when the intention is password auth for the default user.
    if ((url.protocol === 'redis:' || url.protocol === 'rediss:') && url.username && !url.password) {
      url.password = url.username;
      url.username = '';
      return url.toString();
    }
  } catch {
    console.warn('REDIS_URL 格式无效，将按原始值传递给 Redis 客户端');
  }

  return redisUrl;
}

const redisUrl = normalizeRedisUrl(process.env.REDIS_URL || DEFAULT_REDIS_URL);

export const redis = globalForRedis.redis ?? new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
});

if (process.env.NODE_ENV !== 'production') {
  globalForRedis.redis = redis;
}

redis.on('connect', () => {
  console.log('Redis 连接已建立');
});

redis.on('error', (err) => {
  console.error('Redis 连接错误:', err);
});
