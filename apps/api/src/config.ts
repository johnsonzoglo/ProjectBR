import { config } from "dotenv";
import { resolve } from "node:path";
import { z } from "zod";

config({ path: resolve(process.cwd(), ".env"), quiet: true });
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  APP_ORIGIN: z.string().url(),
  APP_TRUSTED_ORIGINS: z.string().default("").transform(value => value.split(",").map(origin => origin.trim()).filter(Boolean)).refine(origins => origins.every(origin => z.string().url().safeParse(origin).success), "Every trusted origin must be a valid URL"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  MAIL_MODE: z.enum(["file", "smtp"]).default("file"),
  MAIL_OUTBOX: z.string().default(".local/mail"),
  TASK_PROOF_DIR: z.string().default(".local/task-proofs"),
  MAIL_FROM: z.string().default("Rewardly <noreply@example.com>"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  JOB_WORKER_ENABLED: z.string().default("true").transform(value => value === "true"),
  JOB_POLL_MS: z.coerce.number().int().min(500).max(60000).default(2000),
  HEALTH_TOKEN: z.string().min(24).optional(),
});
export const env = schema.parse(process.env);
export const trustedOrigins = [...new Set([env.APP_ORIGIN, ...env.APP_TRUSTED_ORIGINS])];
if (env.NODE_ENV === "production" && (env.MAIL_MODE !== "smtp" || !env.SMTP_HOST || !env.APP_ORIGIN.startsWith("https://"))) {
  throw new Error("Production requires HTTPS APP_ORIGIN and SMTP configuration.");
}
