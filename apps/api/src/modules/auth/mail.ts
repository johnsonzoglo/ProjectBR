import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { db } from "../../database.js";
import nodemailer from "nodemailer";
import { env } from "../../config.js";

export type AccountEmailPayload = { to: string; subject: string; url: string; otp?: string; message?: string; actionLabel?: string };

function safeAddress(value: string) {
  const address = value.trim().toLowerCase();
  if (address.length > 254 || /[\r\n]/.test(address) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new Error("Invalid email recipient");
  return address;
}

export async function sendAccountEmail(to: string, subject: string, url: string, otp?: string) {
  const payload = { to: safeAddress(to), subject: subject.slice(0, 150), url, ...(otp ? { otp } : {}) };
  // The file transport is a deterministic local/test mailbox. SMTP delivery is
  // persisted first so a web-process restart cannot lose verification mail.
  if (env.MAIL_MODE === "file" || env.NODE_ENV === "test") { await deliverAccountEmail(payload); return; }
  await db.backgroundJob.create({ data: { type: "account_email", payload } });
}

export async function sendUserUpdateEmail(to: string, subject: string, message: string, url = env.APP_ORIGIN + "/dashboard", actionLabel = "Open Rewardly") {
  const payload = { to: safeAddress(to), subject: subject.trim().slice(0, 150), message: message.trim().slice(0, 4000), url, actionLabel: actionLabel.trim().slice(0, 60) };
  if (env.MAIL_MODE === "file" || env.NODE_ENV === "test") { await deliverAccountEmail(payload); return; }
  await db.backgroundJob.create({ data: { type: "account_email", payload } });
}

export async function deliverAccountEmail(input: AccountEmailPayload) {
  const to = safeAddress(input.to);
  if (env.MAIL_MODE === "file") {
    const dir = resolve(env.MAIL_OUTBOX);
    await mkdir(dir, { recursive: true });
    await writeFile(resolve(dir, `${Date.now()}-${randomUUID()}.json`), JSON.stringify({ ...input, to }, null, 2), { mode: 0o600 });
    return { messageId: "file:" + randomUUID() };
  }
  const transport = nodemailer.createTransport({ connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000, host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_PORT === 465, requireTLS: env.SMTP_PORT !== 465, disableFileAccess: true, disableUrlAccess: true, auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined });
  const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!));
  const label = input.actionLabel || (input.subject.startsWith("Verify") ? "Verify my email" : "Reset my password");
  const message = input.message || "Use the button below to continue with your Rewardly account.";
  const linkHtml = `<div style="background:#f3f5fb;padding:30px 12px;font-family:Arial,sans-serif"><div style="max-width:560px;margin:auto;background:white;border:1px solid #e4e7f0;border-radius:18px;padding:34px;color:#17213b"><div style="font-weight:800;color:#6545ed;margin-bottom:24px">Rewardly</div><h2 style="margin:0 0 14px">${escape(input.subject)}</h2><p style="font-size:15px;line-height:1.7;color:#59637a;white-space:pre-line">${escape(message)}</p><p style="margin:30px 0"><a href="${escape(input.url)}" style="display:inline-block;background:#6545ed;color:white;padding:13px 21px;border-radius:10px;text-decoration:none;font-weight:700">${escape(label)}</a></p><p style="font-size:12px;color:#8a91a3">If the button does not work, copy this link into your browser:<br><span style="word-break:break-all">${escape(input.url)}</span></p></div></div>`;
  const html = input.otp ? `<div style="font-family:Arial,sans-serif;padding:32px"><h2>Verify your Rewardly email</h2><p>Enter this code on the verification page:</p><p style="font-size:36px;font-weight:bold;letter-spacing:8px">${escape(input.otp)}</p><p>Expires in 10 minutes. Never share this code.</p></div>` : linkHtml;
  const text = input.otp ? `Your Rewardly verification code: ${input.otp}\n\nExpires in 10 minutes.` : `${input.subject}\n\n${message}\n\n${input.url}`;
  try {
    const result = await transport.sendMail({ from: env.MAIL_FROM, to, subject: input.subject, html, text });
    if (!result.accepted?.length || result.rejected?.length) throw Object.assign(new Error("Email recipient rejected"), { code: "RECIPIENT_REJECTED" });
    await db.auditLog.create({ data: { action: "email.accepted", detail: { recipient: to, subject: input.subject, messageId: result.messageId } } });
    return { messageId: result.messageId };
  } catch (error) {
    const code = String((error as { code?: string }).code || "SEND_FAILED").replace(/[^A-Z0-9_]/g, "").slice(0, 50);
    // Direct delivery is used only by tests/local mail. Production failures are
    // recorded once by the durable worker after all retries are exhausted.
    if (env.NODE_ENV === "test") await db.auditLog.create({ data: { action: "email.delivery_failed", reason: `Account email could not be sent (${code}).`, detail: { recipient: to, subject: input.subject, code } } }).catch(() => undefined);
    throw error;
  } finally { transport.close(); }
}
