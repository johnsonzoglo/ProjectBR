import { surveyQuestionsSchema } from "./survey.js";
import { BadRequestException, Body, ConflictException, Controller, Delete, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { randomBytes, createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "../../database.js";
import { requireRecentStaffAuth, requireUser } from "../permissions/access.js";
import { requireWithdrawalReferrals, creditApprovedRun, codeHash, postLedger, postDepositLedger, rewardTransaction, settings, throttle } from "./service.js";
import { validate } from "./rewards.controller.js";
import { parseCryptoDestination, validateCryptoTransaction } from "./crypto.js";
import { displayTaskProof } from "./task-proof-storage.js";

const reasonSchema = z.string().trim().min(10).max(500);
const membershipPlanSchema = z.object({ key: z.string().trim().min(2).max(50).regex(/^[a-z0-9_-]+$/), name: z.string().trim().min(2).max(100), description: z.string().trim().max(1000), priceCents: z.number().int().min(1).max(100000000), durationDays: z.number().int().min(1).max(3650).nullable(), earningPotentialCents: z.number().int().min(0).max(2147483647), minimumReferrals: z.number().int().min(0).max(1000000), minimumCompletedTasks: z.number().int().min(0).max(1000000), active: z.boolean(), accessToPlanIds: z.array(z.string().trim().min(1).max(100)).max(1000).default([]) }).strict();
const imageSchema = z.string().max(2800000).regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, "Upload a JPG, PNG, or WebP image under 2 MB");
const productSchema = z.object({ name: z.string().trim().min(2).max(100), description: z.string().trim().min(5).max(300), imageUrl: z.union([z.string().url().max(2000).refine(url => ["http:", "https:"].includes(new URL(url).protocol), "Use an HTTP or HTTPS image URL"), imageSchema]).nullable().default(null) }).strict();
const taskSchema = z.object({ coverImage: imageSchema.nullable().optional(), featured: z.boolean().default(false), autoClaimOnVerification: z.boolean().default(false), completedVisibleHours: z.number().int().min(0).max(8760).default(24), surveyQuestions: surveyQuestionsSchema.default([]), repeatHours: z.number().int().min(1).max(8760).nullable().default(null), autoClaimOnApproval: z.boolean().default(false), title: z.string().trim().min(3).max(120), description: z.string().trim().min(10).max(500), instructions: z.string().trim().min(10).max(4000), category: z.enum(["Website", "Video", "App", "Survey", "Feedback", "Other"]), rewardPoints: z.number().int().min(1).max(1000000), verification: z.enum(["code", "manual"]).default("manual"), taskType: z.enum(["standard", "product_experience", "image_preference", "movie_review", "music_review", "survey"]).default("standard"), products: z.array(productSchema).max(10).default([]), destinationUrl: z.string().url().max(2000).refine(url => ["http:", "https:"].includes(new URL(url).protocol), "Use an HTTP or HTTPS URL").nullable(), requiresMembership: z.boolean().default(false), membershipPlanId: z.string().trim().min(1).max(100).nullable().default(null), active: z.boolean().default(true), startsAt: z.iso.datetime().default(new Date().toISOString()), endsAt: z.iso.datetime().nullable().default(null), dailyLimit: z.number().int().min(1).max(1000000).default(100), totalLimit: z.number().int().min(1).max(10000000).default(10000) }).strict().refine(t => !t.autoClaimOnVerification || (!t.autoClaimOnApproval && (t.taskType !== "standard" || t.verification === "code")), "Instant rewards require automatic verification and cannot be combined with admin approval").refine(t => t.taskType === "survey" ? t.surveyQuestions.length >= 1 : t.surveyQuestions.length === 0, "Survey tasks need 1 to 10 questions; other tasks cannot include survey questions").refine(t => !t.endsAt || new Date(t.endsAt) > new Date(t.startsAt), "End date must be after start date").refine(t => !t.membershipPlanId || t.requiresMembership, "Select membership required before choosing a specific plan").refine(t => (t.taskType === "movie_review" || t.taskType === "music_review") ? t.products.length === 1 && !!t.destinationUrl : t.taskType === "image_preference" ? t.products.length === 2 && t.products.every(p => !!p.imageUrl) : t.taskType === "product_experience" ? t.products.length >= 5 : t.products.length === 0, "Movie and music reviews need one content item and a content link; image polls need exactly two designs with images; Product Experience needs 5 to 10 products; standard tasks cannot include products");

@Controller("api/v1/admin/rewards")
export class AdminRewardsController {
  @Get("media-reviews")
  async mediaReviews(@Req() req: Request) {
    await requireUser(req, "rewards.manage");
    const tasks = await db.task.findMany({ where: { taskType: { in: ["movie_review", "music_review"] }, removedAt: null }, take: 200, orderBy: { createdAt: "desc" }, include: { products: { orderBy: { position: "asc" } } } });
    const ratings = await db.taskRun.groupBy({ by: ["taskId"], where: { taskId: { in: tasks.map(task => task.id) }, status: { in: ["approved", "completed"] }, rating: { not: null } }, _avg: { rating: true }, _count: true });
    return tasks.map(task => { const result = ratings.find(r => r.taskId === task.id); return { ...task, acceptedReviews: result?._count || 0, averageRating: result?._avg.rating || null }; });
  }

  @Get("image-polls")
  async imagePolls(@Req() req: Request) {
    await requireUser(req, "rewards.manage");
    const tasks = await db.task.findMany({ where: { taskType: "image_preference", removedAt: null }, orderBy: { createdAt: "desc" }, take: 200, include: { products: { orderBy: { position: "asc" } } } });
    const votes = await db.productAnswer.groupBy({ by: ["productId"], where: { answer: true, product: { taskId: { in: tasks.map(task => task.id) } }, run: { status: { in: ["approved", "completed"] } } }, _count: true });
    return tasks.map(task => ({ ...task, products: task.products.map(product => ({ ...product, votes: votes.find(vote => vote.productId === product.id)?._count || 0 })) }));
  }

  @Get("membership")
  async membership(@Req() req: Request) {
    await requireUser(req, "rewards.manage");
    return db.membershipPlan.findMany({ orderBy: [{ active: "desc" }, { priceCents: "asc" }, { createdAt: "asc" }], include: { _count: { select: { purchases: true } }, accessGrants: { select: { targetPlan: { select: { id: true, name: true, key: true } } } } } });
  }

  @Post("membership")
  async createMembership(@Req() req: Request, @Body() body: unknown) {
    const { user } = await requireUser(req, "rewards.manage");
    const { accessToPlanIds, ...data } = validate(membershipPlanSchema, body);
    return rewardTransaction(async tx => {
      const plan = await tx.membershipPlan.create({ data });
      await tx.membershipPlanAccess.createMany({ data: accessToPlanIds.filter(targetPlanId => targetPlanId !== plan.id).map(targetPlanId => ({ grantorPlanId: plan.id, targetPlanId })), skipDuplicates: true });
      await tx.auditLog.create({ data: { actorId: user.id, action: "membership.plan_created", targetId: plan.id, detail: { key: plan.key, priceCents: plan.priceCents, durationDays: plan.durationDays } } });
      return plan;
    });
  }

  @Patch("membership/:id")
  async editMembership(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) {
    const { user } = await requireUser(req, "rewards.manage");
    const { accessToPlanIds, ...data } = validate(membershipPlanSchema, body);
    return rewardTransaction(async tx => {
      const previous = await tx.membershipPlan.findUnique({ where: { id } });
      if (!previous) throw new BadRequestException("Membership plan not found.");
      const duplicate = await tx.membershipPlan.findFirst({ where: { key: data.key, id: { not: id } } });
      if (duplicate) throw new ConflictException("That membership key is already in use.");
      const plan = await tx.membershipPlan.update({ where: { id }, data });
      await tx.membershipPlanAccess.deleteMany({ where: { grantorPlanId: id } });
      await tx.membershipPlanAccess.createMany({ data: accessToPlanIds.filter(targetPlanId => targetPlanId !== id).map(targetPlanId => ({ grantorPlanId: id, targetPlanId })), skipDuplicates: true });
      await tx.auditLog.create({ data: { actorId: user.id, action: "membership.plan_updated", targetId: id, detail: { before: previous, after: plan } } });
      return plan;
    });
  }

  @Get()
  async overview(@Req() req: Request, @Query("page") input = "1") {
    await requireUser(req, "rewards.manage");
    const page = Math.max(1, Math.min(10000, Math.floor(Number(input) || 1)));
    const [rules, tasks, reviews, withdrawals, reviewCount, withdrawalCount, membershipPlans] = await db.$transaction([
      db.rewardSettings.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} }),
      db.task.findMany({ where: { removedAt: null }, orderBy: { createdAt: "desc" }, take: 200, include: { products: { orderBy: { position: "asc" } }, _count: { select: { runs: true } }, membershipPlan: { select: { id: true, name: true, key: true } } } }),
      db.taskRun.findMany({ where: { status: "pending_review", user: { status: { not: "deleted" } } }, include: { productAnswers: { include: { product: { select: { name: true, imageUrl: true } } } }, task: { select: { title: true, taskType: true, surveyQuestions: true } }, user: { select: { name: true, email: true } } }, orderBy: { submittedAt: "asc" }, take: 20, skip: (page - 1) * 20 }),
      db.withdrawal.findMany({ where: { status: { in: ["pending", "approved"] } }, omit: { payoutProofImage: true }, include: { user: { select: { name: true, email: true, withdrawalEligible: true } } }, orderBy: { createdAt: "asc" }, take: 20, skip: (page - 1) * 20 }),
      db.taskRun.count({ where: { status: "pending_review" } }), db.withdrawal.count({ where: { status: { in: ["pending", "approved"] } } }),
      db.membershipPlan.findMany({ where: { active: true }, orderBy: { priceCents: "asc" }, select: { id: true, name: true, key: true } }),
    ]);
    return { rules, tasks, reviews: reviews.map(displayTaskProof), withdrawals, reviewCount, withdrawalCount, membershipPlans, page };
  }

  @Get("settings")
  async currentRules(@Req() req: Request) {
    await requireUser(req, "rewards.manage");
    return settings();
  }

  @Patch("settings")
  async rules(@Req() req: Request, @Body() body: unknown) {
    const { user } = await requireUser(req, "rewards.manage");
    const { reason, ...data } = validate(z.object({ pointsPerUsd: z.number().int().min(1).max(1000000), minWithdrawalCents: z.number().int().min(1).max(1000000), maxWithdrawalCents: z.number().int().min(1).max(1000000), referralRewardPoints: z.number().int().min(0).max(1000000), referralRequiredTasks: z.number().int().min(1).max(1000), referralsEnabled: z.boolean(), minWithdrawalReferrals: z.number().int().min(0).max(1000000).optional(), reason: reasonSchema }).strict().refine(r => r.maxWithdrawalCents >= r.minWithdrawalCents, "Maximum must be at least the minimum"), body);
    return rewardTransaction(async tx => {
      const previous = await settings(tx);
      const updated = await tx.rewardSettings.update({ where: { id: "default" }, data });
      await tx.auditLog.create({ data: { actorId: user.id, action: "rewards.settings_changed", reason, detail: { before: previous, after: updated } } });
      return updated;
    });
  }

  @Delete("tasks/:id")
  async removeTask(@Req() req: Request, @Param("id") id: string) {
    const { user } = await requireUser(req, "rewards.manage");
    return rewardTransaction(async tx => {
      const task = await tx.task.findUnique({ where: { id } });
      if (!task) throw new BadRequestException("Task not found.");
      await tx.task.update({ where: { id }, data: { removedAt: new Date(), active: false } });
      await tx.auditLog.create({ data: { actorId: user.id, targetId: id, action: "task.removed", detail: { title: task.title } } });
      return { success: true };
    });
  }

  @Post("tasks/bulk")
  async bulkTasks(@Req() req: Request, @Body() body: unknown) {
    const { user } = await requireUser(req, "rewards.manage");
    const input = validate(z.object({ ids: z.array(z.string().uuid()).min(1).max(50), action: z.enum(["pause", "activate", "archive", "duplicate", "reschedule"]), reason: reasonSchema, requestKey: z.string().uuid(), startsAt: z.iso.datetime().optional(), endsAt: z.iso.datetime().nullable().optional(), repeatHours: z.number().int().min(1).max(8760).nullable().optional() }).strict(), body);
    const ids = [...new Set(input.ids)]; const fingerprint = createHash("sha256").update(JSON.stringify({ ...input, ids: [...ids].sort() })).digest("hex");
    return rewardTransaction(async tx => {
      const prior = await tx.auditLog.findUnique({ where: { id: input.requestKey } });
      if (prior) { const detail = prior.detail as { fingerprint?: string; result?: unknown } | null; if (prior.actorId !== user.id || detail?.fingerprint !== fingerprint) throw new ConflictException("This bulk request key was already used."); return detail.result; }
      const tasks = await tx.task.findMany({ where: { id: { in: ids }, removedAt: null }, include: { products: { orderBy: { position: "asc" } }, _count: { select: { runs: true } } } });
      if (tasks.length !== ids.length) throw new BadRequestException("One or more selected tasks were removed. Refresh and select again.");
      if (input.action === "duplicate" && ids.length > 10) throw new BadRequestException("Duplicate at most 10 tasks at a time.");
      if (input.action === "reschedule" && (!input.startsAt || tasks.some(t => t._count.runs))) throw new BadRequestException("Only tasks with no participants can be rescheduled. Duplicate started tasks instead.");
      if (input.action === "reschedule" && input.endsAt && new Date(input.endsAt) <= new Date(input.startsAt!)) throw new BadRequestException("End date must be after start date.");
      const createdIds: string[] = [];
      if (input.action === "duplicate") for (const task of tasks) {
        const { id, products, _count, createdAt, removedAt, ...copy } = task;
        const created = await tx.task.create({ data: { ...copy, surveyQuestions: surveyQuestionsSchema.parse(copy.surveyQuestions), title: (copy.title.slice(0, 113) + " (copy)"), active: false, startsAt: new Date(), endsAt: null, products: { create: products.map(({ name, description, imageUrl, position }) => ({ name, description, imageUrl, position })) } } }); createdIds.push(created.id);
      } else await tx.task.updateMany({ where: { id: { in: ids } }, data: input.action === "archive" ? { active: false, removedAt: new Date() } : input.action === "reschedule" ? { startsAt: new Date(input.startsAt!), endsAt: input.endsAt ? new Date(input.endsAt) : null, repeatHours: input.repeatHours ?? null } : { active: input.action === "activate" } });
      const result = { action: input.action, count: ids.length, createdIds };
      await tx.auditLog.create({ data: { id: input.requestKey, actorId: user.id, action: "task.bulk_" + input.action, reason: input.reason, detail: { ids, fingerprint, result } } });
      return result;
    });
  }

  @Post("tasks")
  async createTask(@Req() req: Request, @Body() body: unknown) {
    const { user } = await requireUser(req, "rewards.manage");
    const { products, ...input } = validate(taskSchema, body);
    return rewardTransaction(async tx => {
      const data = { ...input, coverVersion: input.coverImage ? randomUUID() : null, verification: input.taskType === "movie_review" || input.taskType === "music_review" ? "rating_review" : input.taskType !== "standard" ? input.taskType : input.verification };
      const task = await tx.task.create({ data: { ...data, products: { create: products.map((product, position) => ({ ...product, position })) } }, include: { products: { orderBy: { position: "asc" } } } });
      await tx.auditLog.create({ data: { actorId: user.id, action: "task.created", targetId: task.id, detail: { title: task.title, rewardPoints: task.rewardPoints } } });
      return task;
    });
  }

  @Patch("tasks/:id")
  async editTask(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) {
    const { user } = await requireUser(req, "rewards.manage");
    const { products, ...input } = validate(taskSchema, body);
    return rewardTransaction(async tx => {
      const previous = await tx.task.findUnique({ where: { id }, include: { products: { orderBy: { position: "asc" } }, _count: { select: { runs: true } } } });
      if (!previous) throw new BadRequestException("Task not found.");
      if (!previous.repeatHours && input.totalLimit < previous._count.runs) throw new BadRequestException("The total limit cannot be lower than the number of existing participants.");
      if (previous._count.runs && (previous.repeatHours !== input.repeatHours || (previous.repeatHours !== null && previous.startsAt.getTime() !== new Date(input.startsAt).getTime()))) throw new BadRequestException("The repeat schedule and start date cannot change after participation. Create a new task for a different schedule.");
      if (previous._count.runs && previous.taskType !== input.taskType) throw new BadRequestException("Task type cannot change after participation.");
      if (previous._count.runs && ["movie_review", "music_review"].includes(previous.taskType) && previous.destinationUrl !== input.destinationUrl) throw new BadRequestException("The review content link cannot change after participation.");
      if (previous._count.runs && JSON.stringify(surveyQuestionsSchema.parse(previous.surveyQuestions)) !== JSON.stringify(input.surveyQuestions)) throw new BadRequestException("Survey questions cannot change after participation. Create a new survey instead.");
      const nextProducts = products.map(({ name, description, imageUrl }) => ({ name, description, imageUrl }));
      const priorProducts = previous.products.map(({ name, description, imageUrl }) => ({ name, description, imageUrl }));
      if (previous._count.runs > 0 && JSON.stringify(nextProducts) !== JSON.stringify(priorProducts)) throw new BadRequestException("Products cannot change after users have started this task. Create a new Product Experience task instead.");
      if (!previous._count.runs) { await tx.taskProduct.deleteMany({ where: { taskId: id } }); await tx.taskProduct.createMany({ data: products.map((product, position) => ({ ...product, taskId: id, position })) }); }
      const data = { ...input, verification: input.taskType === "movie_review" || input.taskType === "music_review" ? "rating_review" : input.taskType !== "standard" ? input.taskType : input.verification };
      const task = await tx.task.update({ where: { id }, data, include: { products: { orderBy: { position: "asc" } } } });
      await tx.auditLog.create({ data: { actorId: user.id, action: "task.updated", targetId: id, detail: { title: task.title, rewardPoints: task.rewardPoints, active: task.active } } });
      return task;
    });
  }

  @Patch("tasks/:id/membership")
  async taskMembership(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) {
    const { user } = await requireUser(req, "rewards.manage");
    const data = validate(z.object({ requiresMembership: z.boolean(), membershipPlanId: z.string().trim().min(1).max(100).nullable() }).strict().refine(value => !value.membershipPlanId || value.requiresMembership, "A membership plan requires membership access."), body);
    return rewardTransaction(async tx => {
      const task = await tx.task.findUnique({ where: { id } });
      if (!task) throw new BadRequestException("Task not found.");
      if (data.membershipPlanId && !await tx.membershipPlan.findUnique({ where: { id: data.membershipPlanId } })) throw new BadRequestException("Membership plan not found.");
      const updated = await tx.task.update({ where: { id }, data });
      await tx.auditLog.create({ data: { actorId: user.id, targetId: id, action: "task.membership_access_updated", detail: { requiresMembership: data.requiresMembership, membershipPlanId: data.membershipPlanId } } });
      return updated;
    });
  }

  @Post("tasks/:id/codes")
  async code(@Req() req: Request, @Param("id") id: string) {
    const { user } = await requireUser(req, "rewards.manage"); await throttle(user.id, "issue_code", 20);
    return rewardTransaction(async tx => {
      const task = await tx.task.findUnique({ where: { id } });
      if (!task || task.verification !== "code") throw new BadRequestException("Choose a task with code verification.");
      const code = randomBytes(18).toString("base64url");
      await tx.taskCode.create({ data: { taskId: id, hash: codeHash(code) } });
      await tx.auditLog.create({ data: { actorId: user.id, targetId: id, action: "task.code_issued" } });
      return { code };
    });
  }

  @Post("reviews/:id")
  async review(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) {
    const { user } = await requireUser(req, "rewards.manage");
    const data = validate(z.object({ decision: z.enum(["approve", "reject"]), reason: reasonSchema }).strict(), body);
    return rewardTransaction(async tx => {
      const run = await tx.taskRun.findUnique({ where: { id } });
      if (!run || run.status !== "pending_review") throw new BadRequestException("This submission is no longer awaiting review.");
      if ((await tx.user.findUnique({ where: { id: run.userId } }))?.status === "deleted") throw new BadRequestException("Deleted accounts cannot receive task approvals.");
      if (run.userId === user.id) throw new BadRequestException("You cannot approve your own task submission.");
      const updated = await tx.taskRun.update({ where: { id }, data: { status: data.decision === "approve" ? "approved" : "in_progress", reviewReason: data.reason } });
      await tx.auditLog.create({ data: { actorId: user.id, targetId: id, action: `task.review_${data.decision}`, reason: data.reason } });
      if (data.decision === "approve" && run.autoClaimOnApproval) return creditApprovedRun(tx, run.id);
      return updated;
    });
  }

  @Patch("eligibility")
  async eligibility(@Req() req: Request, @Body() body: unknown) {
    const { user } = await requireUser(req, "rewards.manage");
    const data = validate(z.object({ email: z.email().transform(e => e.toLowerCase()), eligible: z.boolean(), reason: reasonSchema }).strict(), body);
    return rewardTransaction(async tx => {
      const target = await tx.user.findUnique({ where: { email: data.email } });
      if (!target || target.status === "deleted") throw new BadRequestException("User not found or deleted.");
      if (target.id === user.id) throw new BadRequestException("Another administrator must change your withdrawal eligibility.");
      await tx.user.update({ where: { id: target.id }, data: { withdrawalEligible: data.eligible, withdrawalReason: data.reason } });
      await tx.auditLog.create({ data: { actorId: user.id, targetId: target.id, action: "withdrawal.eligibility_changed", reason: data.reason, detail: { eligible: data.eligible } } });
      return { success: true };
    });
  }

  @Post("withdrawals/:id")
  async withdrawal(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) {
    const { user, sessionId } = await requireUser(req, "rewards.manage");
    await requireRecentStaffAuth(sessionId);
    const data = validate(z.object({ decision: z.enum(["approve", "reject", "paid"]), reason: reasonSchema, paymentReference: z.string().trim().min(5).max(150).optional(), payoutProofImage: z.string().max(2800000).regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/).optional() }).strict(), body);
    return rewardTransaction(async tx => {
      const withdrawal = await tx.withdrawal.findUnique({ where: { id }, include: { user: true } });
      if (!withdrawal) throw new BadRequestException("Withdrawal not found.");
      if (withdrawal.userId === user.id) throw new BadRequestException("Another administrator must review your withdrawal.");
      if (!["pending", "approved"].includes(withdrawal.status)) throw new BadRequestException("This withdrawal is already finalized.");
      if (data.decision !== "reject" && (!withdrawal.user.withdrawalEligible || withdrawal.user.status !== "active" || !withdrawal.user.emailVerified)) throw new BadRequestException("The user is not eligible for payment. Reject to release the reservation.");
      if (data.decision === "approve" && withdrawal.source === "points") await requireWithdrawalReferrals(tx, withdrawal.userId);
      if (data.decision === "approve" && withdrawal.status !== "pending") throw new BadRequestException("This withdrawal has already been approved.");
      if (data.decision === "paid" && (withdrawal.status !== "approved")) throw new BadRequestException("Approve the request before recording payment.");
      if (data.decision !== "paid" && data.payoutProofImage) throw new BadRequestException("Attach payout proof only when recording payment.");
      if (data.decision === "paid" && withdrawal.provider === "crypto" && data.paymentReference) {
        const { network } = parseCryptoDestination(withdrawal.destination);
        data.paymentReference = validateCryptoTransaction(network, data.paymentReference);
      }
      if (data.decision === "paid" && data.paymentReference) {
        const duplicate = await tx.withdrawal.findFirst({ where: { paymentReference: data.paymentReference, id: { not: id } } });
        if (duplicate) throw new ConflictException("This payout reference is already attached to another withdrawal.");
      }
      if (withdrawal.source === "points") {
        if (data.decision === "reject") await postLedger(tx, withdrawal.userId, "withdrawal_release", 0, -withdrawal.points, `release:${id}`, "Withdrawal rejected; reserved points released");
        if (data.decision === "paid") await postLedger(tx, withdrawal.userId, "withdrawal_paid", -withdrawal.points, -withdrawal.points, `paid:${id}`, "Withdrawal payment recorded");
      } else {
        if (data.decision === "reject") await postDepositLedger(tx, withdrawal.userId, "withdrawal_release", 0, -withdrawal.amountCents, `release:${id}`, "Withdrawal rejected; deposit funds released");
        if (data.decision === "paid") await postDepositLedger(tx, withdrawal.userId, "withdrawal_paid", -withdrawal.amountCents, -withdrawal.amountCents, `paid:${id}`, "Deposit withdrawal payment recorded");
      }
      const updated = await tx.withdrawal.update({ where: { id }, data: { status: data.decision === "approve" ? "approved" : data.decision === "reject" ? "rejected" : "paid", reason: data.reason, paymentReference: data.paymentReference, ...(data.decision === "paid" ? { payoutProofImage: data.payoutProofImage } : {}) } });
      await tx.auditLog.create({ data: { actorId: user.id, targetId: id, action: `withdrawal.${updated.status}`, reason: data.reason, detail: { paymentReference: data.paymentReference || null, payoutProofAttached: Boolean(data.payoutProofImage) } } });
      return updated;
    });
  }
}
