ALTER TABLE tasks ADD COLUMN "repeatHours" INTEGER, ADD COLUMN "autoClaimOnApproval" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tasks ADD CONSTRAINT task_repeat_hours CHECK ("repeatHours" IS NULL OR "repeatHours" BETWEEN 1 AND 8760);
ALTER TABLE task_runs ADD COLUMN round INTEGER NOT NULL DEFAULT 0, ADD COLUMN "autoClaimOnApproval" BOOLEAN NOT NULL DEFAULT false;
DROP INDEX "task_runs_userId_taskId_key";
CREATE UNIQUE INDEX "task_runs_userId_taskId_round_key" ON task_runs("userId", "taskId", round);
ALTER TABLE task_runs ADD CONSTRAINT task_round_nonnegative CHECK (round >= 0);
