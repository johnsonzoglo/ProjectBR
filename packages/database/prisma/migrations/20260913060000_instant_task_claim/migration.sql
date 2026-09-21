ALTER TABLE "tasks" ADD COLUMN "autoClaimOnVerification" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "task_runs" ADD COLUMN "autoClaimOnVerification" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "tasks" ADD CONSTRAINT "task_claim_modes" CHECK (NOT ("autoClaimOnVerification" AND "autoClaimOnApproval"));
