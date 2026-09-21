ALTER TABLE "tasks" ADD COLUMN "requiresMembership" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "membership_plans" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "priceCents" INTEGER NOT NULL,
  "durationDays" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "membership_plans_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "membership_plans_key_key" ON "membership_plans" ("key");

CREATE TABLE "membership_purchases" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "priceCents" INTEGER NOT NULL,
  "bonusCents" INTEGER NOT NULL DEFAULT 0,
  "source" TEXT NOT NULL DEFAULT 'deposit',
  "status" TEXT NOT NULL DEFAULT 'active',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "membership_purchases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "membership_purchases_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "membership_purchases_planId_fkey" FOREIGN KEY ("planId") REFERENCES "membership_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "membership_purchases_userId_status_idx" ON "membership_purchases" ("userId", "status");
