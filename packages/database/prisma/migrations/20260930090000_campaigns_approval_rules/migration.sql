ALTER TABLE "reward_settings"
  ADD COLUMN "autoApproveStructured" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "instantRewardLimit" INTEGER NOT NULL DEFAULT 500,
  ADD COLUMN "trustedUserCompletedTasks" INTEGER NOT NULL DEFAULT 3;

CREATE TABLE "campaigns" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "objective" TEXT NOT NULL,
  "budgetCents" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "tasks" ADD COLUMN "campaignId" TEXT;
CREATE INDEX "campaigns_ownerId_createdAt_idx" ON "campaigns"("ownerId", "createdAt");
CREATE INDEX "campaigns_status_startsAt_idx" ON "campaigns"("status", "startsAt");
CREATE INDEX "tasks_campaignId_idx" ON "tasks"("campaignId");
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
