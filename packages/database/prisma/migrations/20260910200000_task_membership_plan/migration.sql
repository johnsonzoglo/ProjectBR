ALTER TABLE "tasks" ADD COLUMN "membershipPlanId" TEXT;

CREATE INDEX "tasks_membershipPlanId_idx" ON "tasks"("membershipPlanId");

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_membershipPlanId_fkey"
  FOREIGN KEY ("membershipPlanId") REFERENCES "membership_plans"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
