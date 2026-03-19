import { Prisma } from '@prisma/client';

const AGENT_PERSISTENCE_TABLES = [
  'public.AgentRun',
  'public.AgentCheckpoint',
  'public.AgentMemoryEntry',
] as const;

export const AGENT_PERSISTENCE_SETUP_MESSAGE = 'Agent 功能尚未完成数据库初始化，请先执行 Prisma 迁移后重试。';

function extractMissingTableName(error: unknown): string | undefined {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError
    && error.code === 'P2021'
    && typeof error.meta?.table === 'string'
  ) {
    return error.meta.table;
  }

  if (!(error instanceof Error)) {
    return undefined;
  }

  const match = error.message.match(/table [`"]?([^`"]+)[`"]? does not exist/i);
  return match?.[1];
}

export function isAgentPersistenceTableMissingError(error: unknown): boolean {
  const table = extractMissingTableName(error);
  if (!table) return false;

  return AGENT_PERSISTENCE_TABLES.some((item) => table === item || table.endsWith(item));
}

export function getAgentPersistenceErrorMessage(feature = 'Agent 功能'): string {
  return `${feature}尚未完成数据库初始化，请先执行 Prisma 迁移后重试。`;
}
