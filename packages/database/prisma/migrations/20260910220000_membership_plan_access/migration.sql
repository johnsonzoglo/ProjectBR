CREATE TABLE "membership_plan_access" (
  "grantorPlanId" TEXT NOT NULL,
  "targetPlanId" TEXT NOT NULL,
  CONSTRAINT "membership_plan_access_pkey" PRIMARY KEY ("grantorPlanId", "targetPlanId"),
  CONSTRAINT "membership_plan_access_grantorPlanId_fkey" FOREIGN KEY ("grantorPlanId") REFERENCES "membership_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "membership_plan_access_targetPlanId_fkey" FOREIGN KEY ("targetPlanId") REFERENCES "membership_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
