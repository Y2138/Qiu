CREATE TABLE "ChatRequestLog" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT,
    "apiKeyId" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "stream" BOOLEAN,
    "requestMode" TEXT,
    "status" TEXT NOT NULL,
    "durationMs" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "llmRequest" JSONB,
    "llmResponse" JSONB,
    "error" JSONB,

    CONSTRAINT "ChatRequestLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChatRequestLog_requestId_key" ON "ChatRequestLog"("requestId");
CREATE INDEX "ChatRequestLog_userId_createdAt_idx" ON "ChatRequestLog"("userId", "createdAt");
CREATE INDEX "ChatRequestLog_sessionId_createdAt_idx" ON "ChatRequestLog"("sessionId", "createdAt");
CREATE INDEX "ChatRequestLog_status_createdAt_idx" ON "ChatRequestLog"("status", "createdAt");
CREATE INDEX "ChatRequestLog_provider_model_createdAt_idx" ON "ChatRequestLog"("provider", "model", "createdAt");
CREATE INDEX "ChatRequestLog_createdAt_idx" ON "ChatRequestLog"("createdAt");
