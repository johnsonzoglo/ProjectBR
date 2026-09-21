import "dotenv/config";
import { db } from "../apps/api/src/database.js";
import { saveTaskProof } from "../apps/api/src/modules/rewards/task-proof-storage.js";

let cursor = "";
let migrated = 0;
let skipped = 0;
try {
  for (;;) {
    const runs = await db.taskRun.findMany({
      where: { id: { gt: cursor }, proofImage: { startsWith: "data:image/" } },
      orderBy: { id: "asc" }, take: 100, select: { id: true, proofImage: true },
    });
    if (!runs.length) break;
    for (const run of runs) {
      cursor = run.id;
      if (!run.proofImage) continue;
      try {
        const { reference } = await saveTaskProof(run.proofImage);
        const result = await db.taskRun.updateMany({ where: { id: run.id, proofImage: run.proofImage }, data: { proofImage: reference } });
        migrated += result.count;
      } catch (error) {
        skipped++;
        console.error(`Skipped proof for run ${run.id}: ${(error as Error).message}`);
      }
    }
  }
  console.log(`Task proofs moved: ${migrated}; skipped: ${skipped}`);
} finally {
  await db.$disconnect();
}
