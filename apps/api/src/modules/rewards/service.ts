import { surveyQuestionsSchema } from "./survey.js";
import { decodeTaskProof, saveTaskProof, taskProofReference } from "./task-proof-storage.js";
import { BadRequestException, ConflictException, NotFoundException, HttpException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { db } from "../../database.js";
import type { Prisma } from "../../../../../packages/database/generated/client.js";

export type Tx = Prisma.TransactionClient;
export const codeHash = (code: string) => createHash("sha256").update(code.trim()).digest("hex");
export const usdCents = (points: number, rate: number) => Math.floor(points * 100 / rate);
export async function settings(tx: Tx = db) {
  return tx.rewardSettings.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} });
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
  if (user.status !== "active") throw new BadRequestException("An active account is required.");
  return user;
}

export async function hasActiveMembership(tx: Tx, userId: string, now = new Date()) {
  return !!await tx.membershipPurchase.findFirst({ where: { userId, status: "active", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, orderBy: { expiresAt: "desc" } });
}

export async function hasRequiredMembership(tx: Tx, userId: string, membershipPlanId: string | null, now = new Date()) {
  if (!membershipPlanId) return hasActiveMembership(tx, userId, now);
  const purchases = await tx.membershipPurchase.findMany({ where: { userId, status: "active", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, select: { planId: true } });
  const planIds = purchases.map(purchase => purchase.planId);
  if (planIds.includes(membershipPlanId)) return true;
  return !!await tx.membershipPlanAccess.findFirst({ where: { targetPlanId: membershipPlanId, grantorPlanId: { in: planIds } } });
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
  if (!referral || referral.inviter.status === "deleted" || referral.qualifiedAt || referral.inviterId === inviteeId) return;
  if (!referral.invitee.emailVerified || referral.invitee.status !== "active") return;
  if (!referral.verifiedAt) await tx.referral.update({ where: { id: referral.id }, data: { verifiedAt: new Date() } });
  const count = await tx.taskRun.count({ where: { userId: inviteeId, status: "completed" } });
  if (count < referral.requiredTasks) return;
  await postLedger(tx, referral.inviterId, "referral_credit", referral.rewardPoints, 0, `referral:${referral.id}`, "Qualified referral reward");
  await tx.referral.update({ where: { id: referral.id }, data: { qualifiedAt: new Date() } });
}

export async function markReferralVerified(inviteeId: string) {
  return db.referral.updateMany({ where: { inviteeId, verifiedAt: null }, data: { verifiedAt: new Date() } });
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

export function taskRound(task: { repeatHours: number | null; startsAt: Date }, now = new Date()) {
  return task.repeatHours ? Math.max(0, Math.floor((now.getTime() - task.startsAt.getTime()) / (task.repeatHours * 3600000))) : 0;
}

export async function creditApprovedRun(tx: Tx, runId: string) {
  const run = await tx.taskRun.findUniqueOrThrow({ where: { id: runId }, include: { task: true } });
  if (run.status === "completed") return run;
  if (run.status !== "approved") throw new BadRequestException("Verification must be approved before crediting points.");
  await activeUser(tx, run.userId);
  if (run.task.requiresMembership && !(await hasRequiredMembership(tx, run.userId, run.task.membershipPlanId))) throw new BadRequestException("An active required membership is needed to credit this reward.");
  const day = new Date(); day.setUTCHours(0, 0, 0, 0);
  const completedToday = await tx.taskRun.count({ where: { taskId: run.taskId, status: "completed", completedAt: { gte: day } } });
  if (completedToday >= run.task.dailyLimit) throw new ConflictException("Today's completion limit has been reached. This submission remains pending; approve it after 00:00 UTC tomorrow.");
  await postLedger(tx, run.userId, "task_credit", run.rewardPoints, 0, `task:${run.id}`, run.task.title);
  const updated = await tx.taskRun.update({ where: { id: run.id }, data: { status: "completed", completedAt: new Date() } });
  await qualifyReferral(tx, run.userId);
  return updated;
}

export async function startTask(userId: string, taskId: string) {
  return rewardTransaction(async tx => {
    await activeUser(tx, userId);
    const task = await tx.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException("Task not found.");
    if (task.removedAt) throw new BadRequestException("This task has been removed.");
    if (task.requiresMembership && !(await hasRequiredMembership(tx, userId, task.membershipPlanId))) throw new BadRequestException(task.membershipPlanId ? "The required membership plan is not active on your account." : "A valid membership is required to start this task.");
    const now = new Date();
    if (!task.active || task.startsAt > now || (task.endsAt && task.endsAt < now)) throw new BadRequestException("This task is not accepting new participants.");
    const round = taskRound(task, now);
    const existing = await tx.taskRun.findFirst({ where: { userId, taskId, OR: [{ round }, { status: { not: "completed" } }] }, orderBy: { round: "desc" } });
    if (existing) return existing;
    // Starting reserves a task slot. Existing participants can finish after the
    // closing date and are not displaced by later task edits or new participants.
    const day = new Date(now); day.setUTCHours(0, 0, 0, 0);
    const total = await tx.taskRun.count({ where: { taskId, round } });
    const today = await tx.taskRun.count({ where: { taskId, startedAt: { gte: day } } });
    if (total >= task.totalLimit || today >= task.dailyLimit) throw new ConflictException("All task slots are taken. Please try another task.");
    return tx.taskRun.create({ data: { userId, taskId, round, autoClaimOnVerification: task.autoClaimOnVerification, autoClaimOnApproval: task.autoClaimOnApproval, rewardPoints: task.rewardPoints, verification: task.verification } });
  });
}

export async function submitTask(userId: string, taskId: string, body: { surveyAnswers?: Array<{ questionId: string; answer: string }>; rating?: number; selectedDesignId?: string; runId?: string; code?: string; proof?: string; proofImage?: string; productAnswers?: Array<{ productId: string; answer: boolean }> }) {
  await throttle(userId, "verify", 10);
  return rewardTransaction(async tx => {
    await activeUser(tx, userId);
    const run = await tx.taskRun.findFirst({ where: { userId, taskId, ...(body.runId ? { id: body.runId } : {}) }, include: { task: true }, orderBy: { round: "desc" } });
    if (!run) throw new BadRequestException("Start the task first.");
    if (run.task.repeatHours && !body.runId) throw new BadRequestException("Refresh this task and submit its current round ID.");
    if (run.status !== "in_progress") return run;
    async function flagFastRepeat() {
      if (run!.task.repeatHours && run!.round > 0 && Date.now() - run!.startedAt.getTime() < 8000) {
        await tx.auditLog.create({ data: { actorId: userId, targetId: run!.id, action: "task.fast_repeat_flagged", detail: { taskId, round: run!.round } } });
      }
    }
    async function verified(data: Prisma.TaskRunUpdateInput) {
      const updated = await tx.taskRun.update({ where: { id: run!.id }, data: { ...data, ...(run!.autoClaimOnVerification ? { status: "approved" } : {}) } });
      await flagFastRepeat();
      return run!.autoClaimOnVerification ? creditApprovedRun(tx, updated.id) : updated;
    }
    if (run.verification === "survey") {
      const questions = surveyQuestionsSchema.parse(run.task.surveyQuestions);
      const answers = body.surveyAnswers || [];
      if (!questions.length || answers.length !== questions.length || new Set(answers.map(answer => answer.questionId)).size !== questions.length) throw new BadRequestException("Answer every survey question exactly once.");
      for (const question of questions) {
        const answer = answers.find(answer => answer.questionId === question.id)?.answer?.trim();
        if (!answer || answer.length > 2000 || (question.type === "yes_no" && !["Yes", "No"].includes(answer)) || (question.type === "single_choice" && !question.options.includes(answer))) throw new BadRequestException("Provide a valid answer for: " + question.prompt);
      }
      return verified({ surveyAnswers: answers.map(answer => ({ ...answer, answer: answer.answer.trim() })), status: "pending_review", submittedAt: new Date(), reviewReason: null });
    }
    if (run.verification === "rating_review") {
      if (!Number.isInteger(body.rating) || body.rating! < 1 || body.rating! > 5 || !body.proof || body.proof.trim().length < 10) throw new BadRequestException("Choose a rating from 1 to 5 stars and write at least 10 characters of feedback.");
      return verified({ rating: body.rating, proof: body.proof.trim(), status: "pending_review", submittedAt: new Date(), reviewReason: null });
    }
    if (run.verification === "image_preference") {
      const designs = await tx.taskProduct.findMany({ where: { taskId } });
      if (designs.length !== 2 || !body.selectedDesignId || !designs.some(design => design.id === body.selectedDesignId)) throw new BadRequestException("Choose one of the two designs before submitting your vote.");
      await tx.productAnswer.deleteMany({ where: { runId: run.id } });
      await tx.productAnswer.createMany({ data: designs.map(design => ({ runId: run.id, productId: design.id, answer: design.id === body.selectedDesignId })) });
      return verified({ status: run.autoClaimOnApproval ? "pending_review" : "approved", submittedAt: new Date(), reviewReason: null });
    }
    if (run.verification === "product_experience") {
      const products = await tx.taskProduct.findMany({ where: { taskId }, orderBy: { position: "asc" } });
      const answers = body.productAnswers || []; const ids = answers.map(answer => answer.productId);
      if (products.length < 5 || products.length > 10 || answers.length !== products.length || new Set(ids).size !== ids.length || products.some(product => !ids.includes(product.id))) throw new BadRequestException("Answer Yes or No for every product before completing this task.");
      await tx.productAnswer.deleteMany({ where: { runId: run.id } });
      await tx.productAnswer.createMany({ data: answers.map(answer => ({ runId: run.id, ...answer })) });
      return verified({ status: run.autoClaimOnApproval ? "pending_review" : "approved", submittedAt: new Date(), reviewReason: null });
    }
    if (run.verification === "code") {
      if (!body.code) throw new BadRequestException("Enter your unique completion code.");
      const code = await tx.taskCode.findUnique({ where: { hash: codeHash(body.code) } });
      if (!code || code.taskId !== taskId || (code.usedByRunId && code.usedByRunId !== run.id)) throw new BadRequestException("This code is invalid or has already been used.");
      await tx.taskCode.update({ where: { id: code.id }, data: { usedByRunId: run.id } });
      return verified({ status: run.autoClaimOnApproval ? "pending_review" : "approved", submittedAt: new Date(), reviewReason: null });
    }
    if (!body.proofImage && (!body.proof || body.proof.trim().length < 10)) throw new BadRequestException("Provide at least 10 characters of feedback or proof for review.");
    let proofImage: string | undefined;
    if (body.proofImage) {
      const image = decodeTaskProof(body.proofImage);
      proofImage = taskProofReference(image.hash, image.type);
      const sameImage = `task-proof:${image.hash}.`;
      const ownPrior = await tx.taskRun.findFirst({ where: { id: { not: run.id }, userId, taskId, proofImage: { startsWith: sameImage } }, select: { id: true } });
      if (ownPrior) throw new BadRequestException("This screenshot was already used for an earlier round. Upload proof of this completion.");
      const reused = await tx.taskRun.findFirst({ where: { id: { not: run.id }, userId: { not: userId }, proofImage: { startsWith: sameImage } }, select: { id: true } });
      if (reused) await tx.auditLog.create({ data: { actorId: userId, targetId: run.id, action: "task.shared_proof_flagged", detail: { taskId, otherRunId: reused.id } } });
      await saveTaskProof(body.proofImage);
    }
    const updated = await tx.taskRun.update({ where: { id: run.id }, data: { proof: body.proof?.trim() || "Image proof submitted", proofImage, status: "pending_review", submittedAt: new Date(), reviewReason: null } });
    await flagFastRepeat();
    return updated;
  });
}

export async function claimTask(userId: string, taskId: string, runId?: string) {
  return rewardTransaction(async tx => {
    await activeUser(tx, userId);
    const run = await tx.taskRun.findFirst({ where: { userId, taskId, ...(runId ? { id: runId } : {}) }, include: { task: true }, orderBy: { round: "desc" } });
    if (!run) throw new BadRequestException("Start the task first.");
    if (run.task.repeatHours && !runId) throw new BadRequestException("Refresh this task and claim its current round ID.");
    if (run.task.requiresMembership && !(await hasRequiredMembership(tx, userId, run.task.membershipPlanId))) throw new BadRequestException(run.task.membershipPlanId ? "The required membership plan is no longer active. Renew it to claim this task." : "Your membership expired. Renew it to claim this task.");
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

export async function buyMembership(userId: string, planId: string) {
  return rewardTransaction(async tx => {
    const user = await activeUser(tx, userId);
    const plan = await tx.membershipPlan.findUnique({ where: { id: planId } });
    if (!plan || !plan.active) throw new BadRequestException("This membership plan is unavailable.");
    const balance = await wallet(tx, userId);
    const availableDeposit = balance.depositCents - balance.reservedDepositCents;
    if (availableDeposit < plan.priceCents) throw new BadRequestException("Insufficient deposit balance to buy this membership.");
    const now = new Date();
    const qualifiedReferrals = await tx.referral.count({ where: { inviterId: userId, qualifiedAt: { not: null } } });
    if (qualifiedReferrals < plan.minimumReferrals) throw new BadRequestException(`You need at least ${plan.minimumReferrals} qualified referral${plan.minimumReferrals === 1 ? "" : "s"} to buy this membership.`);
    const completedTasks = await tx.taskRun.count({ where: { userId, status: "completed" } });
    if (completedTasks < plan.minimumCompletedTasks) throw new BadRequestException(`You need to complete at least ${plan.minimumCompletedTasks} task${plan.minimumCompletedTasks === 1 ? "" : "s"} to buy this membership.`);
    const existing = await tx.membershipPurchase.findFirst({ where: { userId, status: "active", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, orderBy: { expiresAt: "desc" } });
    if (existing?.planId === plan.id) throw new BadRequestException("This membership plan is already active on your account.");
    const expiresAt = plan.durationDays === null ? null : new Date(now.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);
    const purchase = await tx.membershipPurchase.create({ data: { userId, planId: plan.id, priceCents: plan.priceCents, expiresAt, status: "active" } });
    await postDepositLedger(tx, userId, "membership_purchase", -plan.priceCents, 0, `membership:${purchase.id}`, `${plan.name} membership purchased`);
    let bonusCents = 0;
    const referral = await tx.referral.findUnique({ where: { inviteeId: user.id } });
    if (referral) {
      bonusCents = Math.round(plan.priceCents * 0.1);
      await postDepositLedger(tx, referral.inviterId, "membership_referral_bonus", bonusCents, 0, `membership_referral:${purchase.id}`, `${plan.name} referral bonus`);
      await tx.membershipPurchase.update({ where: { id: purchase.id }, data: { bonusCents } });
    }
    if (existing) await tx.membershipPurchase.update({ where: { id: existing.id }, data: { status: "expired" } });
    return { ...purchase, plan, bonusCents, referrerBonusCents: bonusCents, status: "active", referrer: referral ? { id: referral.inviterId } : null };
  });
}

export async function withdrawalReferralProgress(tx: Tx, userId: string, minimum?: number) {
  const required = minimum ?? (await settings(tx)).minWithdrawalReferrals;
  const qualified = await tx.referral.count({ where: { inviterId: userId, qualifiedAt: { not: null } } });
  return { required, qualified, remaining: Math.max(0, required - qualified), met: qualified >= required };
}
export async function requireWithdrawalReferrals(tx: Tx, userId: string, minimum?: number) {
  const progress = await withdrawalReferralProgress(tx, userId, minimum);
  if (!progress.met) throw new BadRequestException({ code: "WITHDRAWAL_REFERRALS_REQUIRED", message: "This account needs " + progress.remaining + " more qualified referral(s) before withdrawing rewards.", referralRequirement: progress });
}

export async function requestWithdrawal(userId: string, body: { mobileNumber?: string; amountCents: number; provider: string; destination: string; requestKey: string; source?: "points" | "deposit" }) {
  return rewardTransaction(async tx => {
    const user = await activeUser(tx, userId);
    const existing = await tx.withdrawal.findUnique({ where: { userId_requestKey: { userId, requestKey: body.requestKey } } });
    const source = body.source || "points";
    if (existing) {
      if (existing.mobileNumber !== (body.mobileNumber || null) || existing.amountCents !== body.amountCents || existing.provider !== body.provider || existing.destination !== body.destination || existing.source !== source) throw new ConflictException("This request key was used for a different withdrawal.");
      return existing;
    }
    if (!(await settings(tx)).withdrawalsEnabled) throw new BadRequestException("New reward withdrawals are temporarily disabled.");
    if (!user.withdrawalEligible) throw new BadRequestException(user.withdrawalReason || "Withdrawals are not enabled for your account.");
    if (!user.emailVerified) throw new BadRequestException("Verify your email from your account page before requesting a reward withdrawal.");
    const rules = await settings(tx);
    if (source === "points") await requireWithdrawalReferrals(tx, userId, rules.minWithdrawalReferrals);
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

export async function cancelWithdrawal(userId: string, id: string) {
  return rewardTransaction(async tx => {
    await activeUser(tx, userId);
    const withdrawal = await tx.withdrawal.findUnique({ where: { id } });
    if (!withdrawal || withdrawal.userId !== userId) throw new NotFoundException("Withdrawal not found.");
    if (withdrawal.status === "cancelled") return withdrawal;
    if (withdrawal.status !== "pending") throw new BadRequestException("Only a withdrawal awaiting approval can be cancelled.");
    if (withdrawal.source === "points") await postLedger(tx, userId, "withdrawal_release", 0, -withdrawal.points, `release:${id}`, "Withdrawal cancelled; reserved points released");
    else await postDepositLedger(tx, userId, "withdrawal_release", 0, -withdrawal.amountCents, `release:${id}`, "Withdrawal cancelled; deposit funds released");
    const updated = await tx.withdrawal.update({ where: { id }, data: { status: "cancelled", reason: "Cancelled by user" } });
    await tx.auditLog.create({ data: { actorId: userId, targetId: id, action: "withdrawal.cancelled" } });
    return updated;
  });
}
