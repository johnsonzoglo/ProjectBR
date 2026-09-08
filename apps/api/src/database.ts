import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../packages/database/generated/client.js";
import { env } from "./config.js";

export const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 5000, max: 10 }),
});
