import { db } from "../apps/api/src/database.js";
import { env } from "../apps/api/src/config.js";

if (env.NODE_ENV !== "development" || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(env.DATABASE_URL).hostname)) throw new Error("Demo tasks can only be created in a local development database.");
try {
  const tasks = [
    { id: "8c299c45-9414-4d69-a1d1-000000000001", title: "Share your first impression", description: "Local demo: explore Rewardly and tell us what you think. Practice the proof-review flow.", instructions: "1. Explore the Tasks, Rewards, and Profile pages.\n2. Return here and describe one thing you like and one thing you would improve (at least 10 characters).\n3. Submit your feedback. A local administrator reviews it under Admin → Reward operations → Proof review.\n4. When approved, return here to claim your development points. This is a local test task; no cash payment is automatic.", category: "Feedback", rewardPoints: 1500, verification: "manual" },
    { id: "8c299c45-9414-4d69-a1d1-000000000002", title: "Try a unique completion code", description: "Local demo: use a one-time code issued by your administrator to practice instant verification.", instructions: "1. Start this task.\n2. Ask the local demo administrator to issue a code under Admin → Reward operations → Tasks → Issue completion code.\n3. Enter that code here. Each code can be redeemed by only one participant.\n4. Claim your development points after verification. No external activity or real payment is involved.", category: "Other", rewardPoints: 1200, verification: "code" },
  ];
  for (const task of tasks) {
    await db.task.upsert({ where: { id: task.id }, create: task, update: {} });
  }
  console.log("Local demo tasks are ready. Existing task edits and balances were preserved.");
} finally { await db.$disconnect(); }
