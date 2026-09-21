ALTER TABLE "tasks" DROP CONSTRAINT "task_rules";
ALTER TABLE "tasks" ADD CONSTRAINT "task_rules" CHECK (
  "rewardPoints" > 0 AND "dailyLimit" > 0 AND "totalLimit" > 0
  AND "verification" IN ('code', 'manual', 'product_experience')
  AND ("endsAt" IS NULL OR "endsAt" > "startsAt")
);
