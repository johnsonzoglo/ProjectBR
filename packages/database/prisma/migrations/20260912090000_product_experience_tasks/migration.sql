ALTER TABLE "tasks" ADD COLUMN "taskType" TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE "tasks" DROP COLUMN "onSiteSeconds";
ALTER TABLE "tasks" ADD CONSTRAINT "task_type_valid" CHECK ("taskType" IN ('standard','product_experience'));

CREATE TABLE "task_products" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "imageUrl" TEXT,
  "position" INTEGER NOT NULL,
  CONSTRAINT "task_products_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "task_products_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "task_product_position_valid" CHECK ("position" >= 0)
);
CREATE UNIQUE INDEX "task_products_taskId_position_key" ON "task_products"("taskId", "position");
CREATE INDEX "task_products_taskId_idx" ON "task_products"("taskId");

CREATE TABLE "product_answers" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "answer" BOOLEAN NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_answers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "product_answers_runId_fkey" FOREIGN KEY ("runId") REFERENCES "task_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "product_answers_productId_fkey" FOREIGN KEY ("productId") REFERENCES "task_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "product_answers_runId_productId_key" ON "product_answers"("runId", "productId");
CREATE INDEX "product_answers_runId_idx" ON "product_answers"("runId");
