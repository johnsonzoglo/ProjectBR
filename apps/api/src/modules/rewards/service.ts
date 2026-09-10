import { BadRequestException, ConflictException, NotFoundException, HttpException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { db } from "../../database.js";
import type { Prisma } from "../../../../../packages/database/generated/client.js";

export type Tx = Prisma.TransactionClient;
export const codeHash = (code: string) => createHash("sha256").update(code.trim()).digest("hex");
export const usdCents = (points: number, rate: number) => Math.floor(points * 100 / rate);
export async function settings(tx: Tx = db) {
  return tx.rewardSettings.findUniqueOrThrow({ where: { id: "default" } });
}

// Serialize reward mutations, including cross-account referral credits. This single
// transaction lock deliberately favors correctness over throughput at this scale.
export async function rewardTransaction<T>(work: (tx: Tx) => Promise<T>) {
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(72849103)`;
    return work(tx);
  }, { maxWait: 10000, timeout: 15000 });
}

export async function activeUser(tx: Tx, id: string) {
  const user = await tx.user.findUniqueOrThrow({ where: { id } });
  if (user.status !== "active" || !user.emailVerified) throw new BadRequestException("An active, verified account is required.");
  return user;
}

export async function wallet(tx: Tx, userId: string) {
  return tx.wallet.upsert({ where: { userId }, create: { userId }, update: {} });
}

export async function postLedger(tx: Tx, userId: string, kind: string, points: number, reservedPoints: number, reference: string, description: string) {
  const existing = await tx.ledgerEntry.findUnique({ where: { reference } });
  if (existing) return existing;
  const balance = await wallet(tx, userId);
  if (balance.points + points > 2147483647) throw new BadRequestException("This balance needs an operator review before further credits.");
  if (balance.points + points < 0 || balance.reservedPoints + reservedPoints < 0 || balance.reservedPoints + reservedPoints > balance.points + points) {
    throw new BadRequestException("Insufficient available points.");
  }
  await tx.wallet.update({ where: { userId }, data: { points: { increment: points }, reservedPoints: { increment: reservedPoints } } });
  return tx.ledgerEntry.create({ data: { userId, kind, points, reservedPoints, reference, description } });
}

export async function postDepositLedger(tx: Tx, userId: string, kind: string, depositCents: number, reservedDepositCents: number, reference: string, description: string) {
  const existing = await tx.ledgerEntry.findUnique({ where: { reference } });
  if (existing) return existing;
  const balance = await wallet(tx, userId);
  const next = balance.depositCents + depositCents;
  const reserved = balance.reservedDepositCents + reservedDepositCents;
  if (next > 2147483647 || next < 0 || reserved < 0 || reserved > next) throw new BadRequestException("Insufficient available deposit balance or balance limit reached.");
  await tx.wallet.update({ where: { userId }, data: { depositCents: { increment: depositCents }, reservedDepositCents: { increment: reservedDepositCents } } });
  return tx.ledgerEntry.create({ data: { userId, kind, points: 0, reservedPoints: 0, depositCents, reservedDepositCents, reference, description } });
}

export async function qualifyReferral(tx: Tx, inviteeId: string) {
  const referral = await tx.referral.findUnique({ where: { inviteeId }, include: { inviter: true, invitee: true } });
  if (!referral || referral.qualifiedAt || referral.inviterId === inviteeId) return;
  if (!referral.invitee.emailVerified || referral.invitee.status !== "active") return;
  const count = await tx.taskRun.count({ where: { userId: inviteeId, status: "completed" } });
  if (count < referral.requiredTasks) return;
  await postLedger(tx, referral.inviterId, "referral_credit", referral.rewardPoints, 0, `referral:${referral.id}`, "Qualified referral reward");
  await tx.referral.update({ where: { id: referral.id }, data: { qualifiedAt: new Date() } });
}

export async function rateLimit(tx: Tx, userId: string, action: string, max = 30) {
  const key = `reward:${action}:${userId}`;
  const now = BigInt(Date.now());
  const current = await tx.rateLimit.findUnique({ where: { key } });
  if (!current || now - current.lastRequest >= 60000n) {
    await tx.rateLimit.upsert({ where: { key }, create: { key, count: 1, lastRequest: now }, update: { count: 1, lastRequest: now } });
  } else {
    if (current.count >= max) throw new HttpException("Too many attempts. Try again in a minute.", 429);
    await tx.rateLimit.update({ where: { key }, data: { count: { increment: 1 } } });
  }
}

export async function throttle(userId: string, action: string, max = 30) {
  // Commit the attempt even if the subsequent verification is rejected.
  return rewardTransaction(tx => rateLimit(tx, userId, action, max));
}

export async function startTask(userId: string, taskId: string) {
  return rewardTransaction(async tx => {
    await activeUser(tx, userId);
    const existing = await tx.taskRun.findUnique({ where: { userId_taskId: { userId, taskId } } });
    if (existing) return existing;
    const task = await tx.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException("Task not found.");
    const now = new Date();
    if (!task.active || task.startsAt > now || (task.endsAt && task.endsAt < now)) throw new BadRequestException("This task is not accepting new participants.");
    // Starting reserves a task slot. Existing participants can finish after the
    // closing date and are not displaced by later task edits or new participants.
    const day = new Date(now); day.setUTCHours(0, 0, 0, 0);
    const total = await tx.taskRun.count({ where: { taskId } });
    const today = await tx.taskRun.count({ where: { taskId, startedAt: { gte: day } } });
    if (total >= task.totalLimit || today >= task.dailyLimit) throw new ConflictException("All task slots are taken. Please try another task.");
    return tx.taskRun.create({ data: { userId, taskId, rewardPoints: task.rewardPoints, verification: task.verification } });
  });
}

export async function submitTask(userId: string, taskId: string, body: { code?: string; proof?: string }) {
  await throttle(userId, "verify", 10);
  return rewardTransaction(async tx => {
    await activeUser(tx, userId);
    const run = await tx.taskRun.findUnique({ where: { userId_taskId: { userId, taskId } } });
    if (!run) throw new BadRequestException("Start the task first.");
    if (run.status !== "in_progress") return run;
    if (run.verification === "code") {
      if (!body.code) throw new BadRequestException("Enter your unique completion code.");
      const code = await tx.taskCode.findUnique({ where: { hash: codeHash(body.code) } });
      if (!code || code.taskId !== taskId || code.usedByRunId) throw new BadRequestException("This code is invalid or has already been used.");
      await tx.taskCode.update({ where: { id: code.id }, data: { usedByRunId: run.id } });
      return tx.taskRun.update({ where: { id: run.id }, data: { status: "approved", submittedAt: new Date(), reviewReason: null } });
    }
    if (!body.proof || body.proof.trim().length < 10) throw new BadRequestException("Provide at least 10 characters of feedback or proof for review.");
    return tx.taskRun.update({ where: { id: run.id }, data: { proof: body.proof.trim(), status: "pending_review", submittedAt: new Date(), reviewReason: null } });
  });
}

export async function claimTask(userId: string, taskId: string) {
  return rewardTransaction(async tx => {
    await activeUser(tx, userId);
    const run = await tx.taskRun.findUnique({ where: { userId_taskId: { userId, taskId } }, include: { task: true } });
    if (!run) throw new BadRequestException("Start the task first.");
    if (run.status === "completed") return { run, credited: false };
    if (run.status !== "approved") throw new BadRequestException("Verification must be approved before claiming points.");
    const day = new Date(); day.setUTCHours(0, 0, 0, 0);
    const claimedToday = await tx.taskRun.count({ where: { taskId, status: "completed", completedAt: { gte: day } } });
    if (claimedToday >= run.task.dailyLimit) throw new ConflictException("Today's completion limit has been reached. Your approved points can be claimed after 00:00 UTC tomorrow.");
    await postLedger(tx, userId, "task_credit", run.rewardPoints, 0, `task:${run.id}`, run.task.title);
    const updated = await tx.taskRun.update({ where: { id: run.id }, data: { status: "completed", completedAt: new Date() } });
    await qualifyReferral(tx, userId);
    return { run: updated, credited: true };
  });
}

export async function requestWithdrawal(userId: string, body: { amountCents: number; provider: string; destination: string; requestKey: string; source?: "points" | "deposit" }) {
  return rewardTransaction(async tx => {
    const user = await activeUser(tx, userId);
    const existing = await tx.withdrawal.findUnique({ where: { userId_requestKey: { userId, requestKey: body.requestKey } } });
    const source = body.source || "points";
    if (existing) {
      if (existing.amountCents !== body.amountCents || existing.provider !== body.provider || existing.destination !== body.destination || existing.source !== source) throw new ConflictException("This request key was used for a different withdrawal.");
      return existing;
    }
    if (!user.withdrawalEligible) throw new BadRequestException(user.withdrawalReason || "Withdrawals are not enabled for your account.");
    const rules = await settings(tx);
    if (body.amountCents < rules.minWithdrawalCents || body.amountCents > rules.maxWithdrawalCents) throw new BadRequestException("The withdrawal amount is outside the current minimum and maximum.");
    const points = source === "points" ? Math.ceil(body.amountCents * rules.pointsPerUsd / 100) : 0;
    const balance = await wallet(tx, userId);
    if (points > balance.points - balance.reservedPoints) throw new BadRequestException("You do not have enough withdrawable points.");
    if (source === "deposit" && body.amountCents > balance.depositCents - balance.reservedDepositCents) throw new BadRequestException("You do not have enough available deposit funds.");
    const withdrawal = await tx.withdrawal.create({ data: { userId, ...body, source, points, pointsPerUsd: rules.pointsPerUsd } });
    if (source === "points") await postLedger(tx, userId, "withdrawal_hold", 0, points, `hold:${withdrawal.id}`, "Points reserved for withdrawal review");
    else await postDepositLedger(tx, userId, "withdrawal_hold", 0, body.amountCents, `hold:${withdrawal.id}`, "Deposit funds reserved for withdrawal review");
    await tx.auditLog.create({ data: { actorId: userId, targetId: withdrawal.id, action: "withdrawal.requested", detail: { amountCents: body.amountCents, points, provider: body.provider } } });
    return withdrawal;
  });
}
