CREATE TABLE "public"."AgentRun" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "goal" TEXT,
    "memoryMode" TEXT NOT NULL,
    "allowMcp" BOOLEAN NOT NULL DEFAULT false,
    "maxSteps" INTEGER NOT NULL DEFAULT 4,
    "promptPresetIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "stopReason" TEXT,
    "resumedFromCheckpointId" TEXT,
    "latestCheckpointId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."AgentCheckpoint" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "stopReason" TEXT NOT NULL,
    "goal" TEXT,
    "stepCount" INTEGER,
    "messagesSnapshot" JSONB,
    "memorySummary" JSONB,
    "observations" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentCheckpoint_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."AgentMemoryEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT,
    "scope" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "metadata" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentMemoryEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AgentRun_sessionId_updatedAt_idx" ON "public"."AgentRun"("sessionId", "updatedAt");
CREATE INDEX "AgentRun_userId_updatedAt_idx" ON "public"."AgentRun"("userId", "updatedAt");
CREATE INDEX "AgentRun_status_updatedAt_idx" ON "public"."AgentRun"("status", "updatedAt");

CREATE INDEX "AgentCheckpoint_runId_createdAt_idx" ON "public"."AgentCheckpoint"("runId", "createdAt");
CREATE INDEX "AgentCheckpoint_status_createdAt_idx" ON "public"."AgentCheckpoint"("status", "createdAt");

CREATE INDEX "AgentMemoryEntry_userId_scope_updatedAt_idx" ON "public"."AgentMemoryEntry"("userId", "scope", "updatedAt");
CREATE INDEX "AgentMemoryEntry_sessionId_scope_updatedAt_idx" ON "public"."AgentMemoryEntry"("sessionId", "scope", "updatedAt");

ALTER TABLE "public"."AgentCheckpoint"
ADD CONSTRAINT "AgentCheckpoint_runId_fkey"
FOREIGN KEY ("runId") REFERENCES "public"."AgentRun"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "public"."AgentMemoryEntry"
ADD CONSTRAINT "AgentMemoryEntry_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "public"."User"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "public"."AgentMemoryEntry"
ADD CONSTRAINT "AgentMemoryEntry_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "public"."Session"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "public"."AgentRun"
ADD CONSTRAINT "AgentRun_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "public"."Session"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "public"."AgentRun"
ADD CONSTRAINT "AgentRun_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "public"."User"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "public"."AgentRun"
ADD CONSTRAINT "AgentRun_resumedFromCheckpointId_fkey"
FOREIGN KEY ("resumedFromCheckpointId") REFERENCES "public"."AgentCheckpoint"("id")
ON DELETE SET NULL
ON UPDATE NO ACTION;

ALTER TABLE "public"."AgentRun"
ADD CONSTRAINT "AgentRun_latestCheckpointId_fkey"
FOREIGN KEY ("latestCheckpointId") REFERENCES "public"."AgentCheckpoint"("id")
ON DELETE SET NULL
ON UPDATE NO ACTION;
