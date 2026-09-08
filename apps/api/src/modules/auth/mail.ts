import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import { env } from "../../config.js";

export async function sendAccountEmail(to: string, subject: string, url: string) {
  if (env.MAIL_MODE === "file") {
    const dir = resolve(env.MAIL_OUTBOX);
    await mkdir(dir, { recursive: true });
    await writeFile(resolve(dir, `${Date.now()}-${randomUUID()}.json`), JSON.stringify({ to, subject, url }, null, 2), { mode: 0o600 });
    return;
  }
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_PORT === 465,
    requireTLS: env.SMTP_PORT !== 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
  });
  await transport.sendMail({ from: env.MAIL_FROM, to, subject, text: `${subject}\n\n${url}\n\nIf you did not request this, you can ignore this email.` });
}
