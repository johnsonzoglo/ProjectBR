DELETE FROM "task_codes" WHERE "taskId" IN (SELECT "id" FROM "tasks" WHERE "verification" = 'purchase');
DELETE FROM "task_runs" WHERE "taskId" IN (SELECT "id" FROM "tasks" WHERE "verification" = 'purchase');
DELETE FROM "tasks" WHERE "verification" = 'purchase';

ALTER TABLE "tasks"
  DROP COLUMN "itemImageUrl",
  DROP COLUMN "purchaseKeyHash";