ALTER TABLE "membership_plans"
  ADD COLUMN "description" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "earningPotentialCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "minimumReferrals" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "minimumCompletedTasks" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "membership_plans"
  ALTER COLUMN "durationDays" DROP NOT NULL;

ALTER TABLE "membership_purchases"
  ALTER COLUMN "expiresAt" DROP NOT NULL;
