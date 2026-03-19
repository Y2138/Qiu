# QiuChat 最小部署说明

本项目当前推荐按“最小可用”方式上线：

- 只开放已有账号登录
- 不开放注册入口
- `/api/auth/register` 已禁用

## 1. 环境要求

- Node.js 20+
- pnpm
- PostgreSQL 14+
- Redis 7+

## 2. 环境变量

至少配置以下变量：

```env
NEXT_PUBLIC_API_BASE_URL=https://your-domain.com/api
DATABASE_URL=postgresql://user:password@host:5432/qiuchat?schema=public
REDIS_URL=redis://:password@host:6379
JWT_SECRET=replace-with-a-long-random-secret
JWT_EXPIRES_IN=7d
ENCRYPTION_KEY=replace-with-64-char-hex-key
MCP_SERVERS_JSON=
AGENT_DIAGNOSTICS_TOKEN=
```

说明：

- `NEXT_PUBLIC_API_BASE_URL` 必须指向正式域名下的 `/api`
- `JWT_SECRET` 建议使用随机长字符串
- `ENCRYPTION_KEY` 需要是 64 位十六进制字符串，可用 `openssl rand -hex 32` 生成

## 3. 部署命令

在项目根目录执行：

```bash
pnpm install
pnpm prisma migrate deploy
pnpm build
pnpm start
```

## 4. 上线前确认

- 数据库中已经存在可登录账号
- 访问 `/login` 可以正常登录
- 访问 `/register` 会跳回 `/login`
- 调用 `POST /api/auth/register` 会返回 `403`
