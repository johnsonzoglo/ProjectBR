import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { db } from "../../database.js";
import nodemailer from "nodemailer";
import { env } from "../../config.js";

export async function sendAccountEmail(to: string, subject: string, url: string, otp?: string) {
  if (env.MAIL_MODE === "file") {
    const dir = resolve(env.MAIL_OUTBOX);
    await mkdir(dir, { recursive: true });
    await writeFile(resolve(dir, `${Date.now()}-${randomUUID()}.json`), JSON.stringify({ to, subject, url, ...(otp ? { otp } : {}) }, null, 2), { mode: 0o600 });
    return;
  }
  const transport = nodemailer.createTransport({
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
    host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_PORT === 465,
    requireTLS: env.SMTP_PORT !== 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
  });
  const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!));
  const label = subject.startsWith("Verify") ? "Verify my email" : "Reset my password";
  const linkHtml = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:32px;color:#17213b"><h2>${escape(subject)}</h2><p>Use the button below to continue with your Rewardly account.</p><p style="margin:32px 0"><a href="${escape(url)}" style="background:#6545ed;color:white;padding:14px 24px;border-radius:8px;text-decoration:none">${label}</a></p><p>This link expires in one hour. If the button does not work, copy this link into your browser:</p><p style="word-break:break-all">${escape(url)}</p><p>If you did not request this, you can ignore this email.</p></div>`;
  const html = otp ? `<div style="font-family:Arial,sans-serif;padding:32px"><h2>Verify your Rewardly email</h2><p>Enter this code on the verification page:</p><p style="font-size:36px;font-weight:bold;letter-spacing:8px">${escape(otp)}</p><p>Expires in 10 minutes. Never share this code. If you did not request it, ignore this email.</p></div>` : linkHtml;
  const text = otp ? `Your Rewardly verification code: ${otp}\n\nExpires in 10 minutes. Enter it on the verification page. Never share this code.` : `${subject}\n\n${url}\n\nIf you did not request this, you can ignore this email.`;
  try { const result = await transport.sendMail({ from: env.MAIL_FROM, to, subject, html, text });
    if (!result.accepted?.length || result.rejected?.length) throw Object.assign(new Error("Email recipient rejected"), { code: "RECIPIENT_REJECTED" });
    await db.auditLog.create({ data: { action: "email.accepted", detail: { recipient: to, subject, messageId: result.messageId } } }).catch(() => console.error("Could not record email acceptance"));
  } catch (error) {
    const code = String((error as {code?:string}).code || "SEND_FAILED").replace(/[^A-Z0-9_]/g, "").slice(0,50);
    await db.auditLog.create({ data: { action: "email.delivery_failed", reason: "Account email could not be sent (" + code + "). Check SMTP and request a fresh link.", detail: { recipient: to, subject, code } } }).catch(() => console.error("Could not record email failure"));
    throw error;
  } finally { transport.close(); }
}
