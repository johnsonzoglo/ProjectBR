import { config } from "dotenv";
import { resolve } from "node:path";
import { z } from "zod";

config({ path: resolve(process.cwd(), ".env"), quiet: true });
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  APP_ORIGIN: z.string().url(),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  MAIL_MODE: z.enum(["file", "smtp"]).default("file"),
  MAIL_OUTBOX: z.string().default(".local/mail"),
  MAIL_FROM: z.string().default("Rewardly <noreply@example.com>"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
});
export const env = schema.parse(process.env);
if (env.NODE_ENV === "production" && (env.MAIL_MODE !== "smtp" || !env.SMTP_HOST || !env.APP_ORIGIN.startsWith("https://"))) {
  throw new Error("Production requires HTTPS APP_ORIGIN and SMTP configuration.");
}
