import { prisma } from '@/lib/prisma';
import { cleanupChatLogs, createChatLogRepository } from '@/lib/chat-logs';

async function main() {
  const retentionDays = Number.parseInt(process.env.CHAT_LOG_RETENTION_DAYS ?? '7', 10);
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
    throw new Error('CHAT_LOG_RETENTION_DAYS must be a positive integer');
  }

  const startedAt = Date.now();
  const result = await cleanupChatLogs({
    repository: createChatLogRepository(prisma),
    retentionDays,
  });

  console.log(
    JSON.stringify({
      deletedCount: result.deletedCount,
      retentionDays,
      cutoff: result.cutoff.toISOString(),
      durationMs: Date.now() - startedAt,
    }),
  );
}

main()
  .catch((error) => {
    console.error(
      JSON.stringify({
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
