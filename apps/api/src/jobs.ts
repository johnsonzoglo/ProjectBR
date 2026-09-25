import { randomUUID } from "node:crypto";
import { db } from "./database.js";
import { env } from "./config.js";
import { deliverAccountEmail, type AccountEmailPayload } from "./modules/auth/mail.js";

const workerId = randomUUID();
let timer: NodeJS.Timeout | undefined;
let running = false;
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 1000);
function failureReason(error: unknown) {
  const value = errorText(error);
  if (/verify a domain|only send testing emails/i.test(value)) return "Email provider rejected delivery because the sending domain is not verified. Verify the domain with the provider, update MAIL_FROM, then retry.";
  if (/auth|credential|EAUTH/i.test(value)) return "Email provider authentication failed. Check the SMTP credentials.";
  if (/timeout|connect|ECONN/i.test(value)) return "Email provider could not be reached. Check SMTP networking and configuration.";
  return "Account email could not be delivered. Check the email provider logs and recipient address.";
}

export async function processJobsOnce() {
  if (running) return;
  running = true;
  try {
    await db.backgroundJob.updateMany({ where: { status: "processing", lockedAt: { lt: new Date(Date.now() - 300000) } }, data: { status: "pending", lockedAt: null, lockedBy: null } });
    const candidates = await db.backgroundJob.findMany({ where: { status: "pending", runAt: { lte: new Date() } }, orderBy: { createdAt: "asc" }, take: 10 });
    for (const candidate of candidates) {
      const claimed = await db.backgroundJob.updateMany({ where: { id: candidate.id, status: "pending" }, data: { status: "processing", lockedAt: new Date(), lockedBy: workerId, attempts: { increment: 1 } } });
      if (!claimed.count) continue;
      try {
        if (candidate.type === "account_email") await deliverAccountEmail(candidate.payload as AccountEmailPayload);
        else throw new Error(`Unknown job type: ${candidate.type}`);
        await db.backgroundJob.update({ where: { id: candidate.id }, data: { status: "completed", completedAt: new Date(), lockedAt: null, lockedBy: null, lastError: null } });
      } catch (error) {
        const attempts = candidate.attempts + 1;
        const failed = attempts >= candidate.maxAttempts;
        await db.backgroundJob.update({ where: { id: candidate.id }, data: { status: failed ? "failed" : "pending", runAt: new Date(Date.now() + Math.min(3600000, 30000 * 2 ** (attempts - 1))), lockedAt: null, lockedBy: null, lastError: errorText(error) } });
        if (failed) await db.auditLog.create({ data: { action: "email.delivery_failed", reason: failureReason(error), detail: { jobId: candidate.id, attempts, errorCode: String((error as { code?: string }).code || "SEND_FAILED").slice(0, 50) } } }).catch(() => undefined);
      }
    }
  } finally { running = false; }
}

export function startJobWorker() { if (!env.JOB_WORKER_ENABLED || timer) return; void processJobsOnce(); timer = setInterval(() => void processJobsOnce(), env.JOB_POLL_MS); timer.unref(); }
export function stopJobWorker() { if (timer) clearInterval(timer); timer = undefined; }
