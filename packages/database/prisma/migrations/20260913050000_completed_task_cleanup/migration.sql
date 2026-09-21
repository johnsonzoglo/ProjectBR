ALTER TABLE "tasks" ADD COLUMN "completedVisibleHours" INTEGER NOT NULL DEFAULT 24 CHECK ("completedVisibleHours" BETWEEN 0 AND 8760);
