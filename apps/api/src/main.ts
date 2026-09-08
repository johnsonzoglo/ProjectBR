import { createApp } from "./app.js";
import { env } from "./config.js";
import { db } from "./database.js";

const app = await createApp();
await app.listen(env.API_PORT, "127.0.0.1");
console.log(`Rewardly API ready at http://127.0.0.1:${env.API_PORT}`);
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => { await app.close(); await db.$disconnect(); process.exit(0); });
}
