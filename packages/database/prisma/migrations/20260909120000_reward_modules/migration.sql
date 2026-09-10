-- AlterTable
ALTER TABLE "users" ADD COLUMN     "signupReferralCode" TEXT,
ADD COLUMN     "withdrawalEligible" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "withdrawalReason" TEXT;

-- CreateTable
CREATE TABLE "reward_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "pointsPerUsd" INTEGER NOT NULL DEFAULT 1000,
    "minWithdrawalCents" INTEGER NOT NULL DEFAULT 100,
    "maxWithdrawalCents" INTEGER NOT NULL DEFAULT 100000,
    "referralRewardPoints" INTEGER NOT NULL DEFAULT 500,
    "referralRequiredTasks" INTEGER NOT NULL DEFAULT 1,
    "referralsEnabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "reward_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "rewardPoints" INTEGER NOT NULL,
    "verification" TEXT NOT NULL,
    "destinationUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "dailyLimit" INTEGER NOT NULL DEFAULT 100,
    "totalLimit" INTEGER NOT NULL DEFAULT 10000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_runs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "rewardPoints" INTEGER NOT NULL,
    "verification" TEXT NOT NULL,
    "proof" TEXT,
    "reviewReason" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "task_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_codes" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "usedByRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "userId" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "reservedPoints" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "reservedPoints" INTEGER NOT NULL DEFAULT 0,
    "reference" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "withdrawals" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    "pointsPerUsd" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "paymentReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referrals" (
    "id" TEXT NOT NULL,
    "inviterId" TEXT NOT NULL,
    "inviteeId" TEXT NOT NULL,
    "rewardPoints" INTEGER NOT NULL,
    "requiredTasks" INTEGER NOT NULL,
    "qualifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_runs_status_idx" ON "task_runs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "task_runs_userId_taskId_key" ON "task_runs"("userId", "taskId");

-- CreateIndex
CREATE UNIQUE INDEX "task_codes_hash_key" ON "task_codes"("hash");

-- CreateIndex
CREATE UNIQUE INDEX "task_codes_usedByRunId_key" ON "task_codes"("usedByRunId");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_reference_key" ON "ledger_entries"("reference");

-- CreateIndex
CREATE INDEX "ledger_entries_userId_createdAt_idx" ON "ledger_entries"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "withdrawals_status_idx" ON "withdrawals"("status");

-- CreateIndex
CREATE UNIQUE INDEX "withdrawals_userId_requestKey_key" ON "withdrawals"("userId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_inviteeId_key" ON "referrals"("inviteeId");

-- CreateIndex
CREATE INDEX "referrals_inviterId_idx" ON "referrals"("inviterId");

-- AddForeignKey
ALTER TABLE "task_runs" ADD CONSTRAINT "task_runs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_runs" ADD CONSTRAINT "task_runs_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_codes" ADD CONSTRAINT "task_codes_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_inviteeId_fkey" FOREIGN KEY ("inviteeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO reward_settings (id) VALUES ('default');
ALTER TABLE wallets ADD CONSTRAINT wallet_nonnegative CHECK (points >= 0 AND "reservedPoints" >= 0 AND "reservedPoints" <= points);
ALTER TABLE tasks ADD CONSTRAINT task_rules CHECK ("rewardPoints" > 0 AND "dailyLimit" > 0 AND "totalLimit" > 0 AND verification IN ('code', 'manual') AND ("endsAt" IS NULL OR "endsAt" > "startsAt"));
ALTER TABLE task_runs ADD CONSTRAINT task_run_status CHECK (status IN ('in_progress', 'pending_review', 'approved', 'completed'));
ALTER TABLE withdrawals ADD CONSTRAINT withdrawal_rules CHECK ("amountCents" > 0 AND points > 0 AND "pointsPerUsd" > 0 AND status IN ('pending', 'approved', 'paid', 'rejected'));
ALTER TABLE referrals ADD CONSTRAINT referral_rules CHECK ("inviterId" <> "inviteeId" AND "rewardPoints" >= 0 AND "requiredTasks" >= 1);
ALTER TABLE reward_settings ADD CONSTRAINT valid_reward_settings CHECK ("pointsPerUsd" > 0 AND "minWithdrawalCents" > 0 AND "maxWithdrawalCents" >= "minWithdrawalCents" AND "referralRewardPoints" >= 0 AND "referralRequiredTasks" >= 1);

CREATE FUNCTION reward_ledger_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Reward ledger entries are immutable'; END; $$;
CREATE TRIGGER immutable_reward_ledger BEFORE UPDATE OR DELETE ON ledger_entries FOR EACH ROW EXECUTE FUNCTION reward_ledger_immutable();

CREATE FUNCTION capture_signup_referral() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE sponsor text; rules reward_settings%ROWTYPE;
BEGIN
  IF NEW."signupReferralCode" IS NOT NULL AND NEW."signupReferralCode" <> '' THEN
    SELECT * INTO STRICT rules FROM reward_settings WHERE id = 'default';
    SELECT id INTO sponsor FROM users WHERE "referralCode" = NEW."signupReferralCode" AND id <> NEW.id AND lower(email) <> lower(NEW.email) AND status = 'active' AND "emailVerified" = true;
    IF sponsor IS NULL OR NOT rules."referralsEnabled" THEN RAISE EXCEPTION 'Invalid referral'; END IF;
    INSERT INTO referrals (id, "inviterId", "inviteeId", "rewardPoints", "requiredTasks", "createdAt") VALUES (gen_random_uuid()::text, sponsor, NEW.id, rules."referralRewardPoints", rules."referralRequiredTasks", now());
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER signup_referral AFTER INSERT ON users FOR EACH ROW EXECUTE FUNCTION capture_signup_referral();

CREATE FUNCTION referral_attribution_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'users' THEN
    IF OLD."signupReferralCode" IS DISTINCT FROM NEW."signupReferralCode" THEN RAISE EXCEPTION 'Referral attribution is permanent'; END IF;
  ELSE
    IF OLD."inviterId" <> NEW."inviterId" OR OLD."inviteeId" <> NEW."inviteeId" OR OLD."rewardPoints" <> NEW."rewardPoints" OR OLD."requiredTasks" <> NEW."requiredTasks" THEN RAISE EXCEPTION 'Referral terms are permanent'; END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER immutable_signup_referral BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION referral_attribution_immutable();
CREATE TRIGGER immutable_referral_terms BEFORE UPDATE ON referrals FOR EACH ROW EXECUTE FUNCTION referral_attribution_immutable();

INSERT INTO permissions (id, key) VALUES (gen_random_uuid()::text, 'rewards.manage') ON CONFLICT (key) DO NOTHING;
INSERT INTO role_permissions ("roleId", "permissionId") SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.key IN ('admin','super_admin') AND p.key = 'rewards.manage' ON CONFLICT DO NOTHING;
