import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "../../database.js";
import { requireUser } from "../permissions/access.js";
import { codeHash, postLedger, postDepositLedger, rewardTransaction, settings, throttle } from "./service.js";
import { validate } from "./rewards.controller.js";

const reasonSchema = z.string().trim().min(10).max(500);
const taskSchema = z.object({ title: z.string().trim().min(3).max(120), description: z.string().trim().min(10).max(500), instructions: z.string().trim().min(10).max(4000), category: z.enum(["Website", "Video", "App", "Survey", "Feedback", "Other"]), rewardPoints: z.number().int().min(1).max(1000000), verification: z.enum(["code", "manual"]), destinationUrl: z.string().url().max(2000).refine(url => ["http:", "https:"].includes(new URL(url).protocol), "Use an HTTP or HTTPS URL").nullable(), active: z.boolean(), startsAt: z.iso.datetime(), endsAt: z.iso.datetime().nullable(), dailyLimit: z.number().int().min(1).max(1000000), totalLimit: z.number().int().min(1).max(10000000) }).strict().refine(t => !t.endsAt || new Date(t.endsAt) > new Date(t.startsAt), "End date must be after start date");

@Controller("api/v1/admin/rewards")
export class AdminRewardsController {
  @Get()
  async overview(@Req() req: Request, @Query("page") input = "1") {
    await requireUser(req, "rewards.manage");
    const page = Math.max(1, Math.min(10000, Math.floor(Number(input) || 1)));
    const [rules, tasks, reviews, withdrawals, reviewCount, withdrawalCount] = await db.$transaction([
      db.rewardSettings.findUniqueOrThrow({ where: { id: "default" } }),
      db.task.findMany({ orderBy: { createdAt: "desc" }, take: 200, include: { _count: { select: { runs: true } } } }),
      db.taskRun.findMany({ where: { status: "pending_review" }, include: { task: { select: { title: true } }, user: { select: { name: true, email: true } } }, orderBy: { submittedAt: "asc" }, take: 20, skip: (page - 1) * 20 }),
      db.withdrawal.findMany({ where: { status: { in: ["pending", "approved"] } }, include: { user: { select: { name: true, email: true, withdrawalEligible: true } } }, orderBy: { createdAt: "asc" }, take: 20, skip: (page - 1) * 20 }),
      db.taskRun.count({ where: { status: "pending_review" } }), db.withdrawal.count({ where: { status: { in: ["pending", "approved"] } } }),
    ]);
    return { rules, tasks, reviews, withdrawals, reviewCount, withdrawalCount, page };
  }

  @Patch("settings")
  async rules(@Req() req: Request, @Body() body: unknown) {
    const { user } = await requireUser(req, "rewards.manage");
    const { reason, ...data } = validate(z.object({ pointsPerUsd: z.number().int().min(1).max(1000000), minWithdrawalCents: z.number().int().min(1).max(1000000), maxWithdrawalCents: z.number().int().min(1).max(1000000), referralRewardPoints: z.number().int().min(0).max(1000000), referralRequiredTasks: z.number().int().min(1).max(1000), referralsEnabled: z.boolean(), reason: reasonSchema }).strict().refine(r => r.maxWithdrawalCents >= r.minWithdrawalCents, "Maximum must be at least the minimum"), body);
    return rewardTransaction(async tx => {
      const previous = await settings(tx);
      const updated = await tx.rewardSettings.update({ where: { id: "default" }, data });
      await tx.auditLog.create({ data: { actorId: user.id, action: "rewards.settings_changed", reason, detail: { before: previous, after: updated } } });
      return updated;
    });
  }

  @Post("tasks")
  async createTask(@Req() req: Request, @Body() body: unknown) {
    const { user } = await requireUser(req, "rewards.manage");
    const data = validate(taskSchema, body);
    return rewardTransaction(async tx => {
      const task = await tx.task.create({ data });
      await tx.auditLog.create({ data: { actorId: user.id, action: "task.created", targetId: task.id, detail: { title: task.title, rewardPoints: task.rewardPoints } } });
      return task;
    });
  }

  @Patch("tasks/:id")
  async editTask(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) {
    const { user } = await requireUser(req, "rewards.manage");
    const data = validate(taskSchema, body);
    return rewardTransaction(async tx => {
      if (!await tx.task.findUnique({ where: { id } })) throw new BadRequestException("Task not found.");
      if (data.totalLimit < await tx.taskRun.count({ where: { taskId: id } })) throw new BadRequestException("The total limit cannot be lower than the number of existing participants.");
      const task = await tx.task.update({ where: { id }, data });
      await tx.auditLog.create({ data: { actorId: user.id, action: "task.updated", targetId: id, detail: { title: task.title, rewardPoints: task.rewardPoints, active: task.active } } });
      return task;
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
      if (run.userId === user.id) throw new BadRequestException("You cannot approve your own task submission.");
      const updated = await tx.taskRun.update({ where: { id }, data: { status: data.decision === "approve" ? "approved" : "in_progress", reviewReason: data.reason } });
      await tx.auditLog.create({ data: { actorId: user.id, targetId: id, action: `task.review_${data.decision}`, reason: data.reason } });
      return updated;
    });
  }

  @Patch("eligibility")
  async eligibility(@Req() req: Request, @Body() body: unknown) {
    const { user } = await requireUser(req, "rewards.manage");
    const data = validate(z.object({ email: z.email().transform(e => e.toLowerCase()), eligible: z.boolean(), reason: reasonSchema }).strict(), body);
    return rewardTransaction(async tx => {
      const target = await tx.user.findUnique({ where: { email: data.email } });
      if (!target) throw new BadRequestException("User not found.");
      if (target.id === user.id) throw new BadRequestException("Another administrator must change your withdrawal eligibility.");
      await tx.user.update({ where: { id: target.id }, data: { withdrawalEligible: data.eligible, withdrawalReason: data.reason } });
      await tx.auditLog.create({ data: { actorId: user.id, targetId: target.id, action: "withdrawal.eligibility_changed", reason: data.reason, detail: { eligible: data.eligible } } });
      return { success: true };
    });
  }

  @Post("withdrawals/:id")
  async withdrawal(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) {
    const { user } = await requireUser(req, "rewards.manage");
    const data = validate(z.object({ decision: z.enum(["approve", "reject", "paid"]), reason: reasonSchema, paymentReference: z.string().trim().min(5).max(150).optional() }).strict(), body);
    return rewardTransaction(async tx => {
      const withdrawal = await tx.withdrawal.findUnique({ where: { id }, include: { user: true } });
      if (!withdrawal) throw new BadRequestException("Withdrawal not found.");
      if (withdrawal.userId === user.id) throw new BadRequestException("Another administrator must review your withdrawal.");
      if (!["pending", "approved"].includes(withdrawal.status)) throw new BadRequestException("This withdrawal is already finalized.");
      if (data.decision !== "reject" && (!withdrawal.user.withdrawalEligible || withdrawal.user.status !== "active" || !withdrawal.user.emailVerified)) throw new BadRequestException("The user is not eligible for payment. Reject to release the reservation.");
      if (data.decision === "approve" && withdrawal.status !== "pending") throw new BadRequestException("This withdrawal has already been approved.");
      if (data.decision === "paid" && (withdrawal.status !== "approved" || !data.paymentReference)) throw new BadRequestException("Approve the request first, then record an actual payment reference.");
      if (withdrawal.source === "points") {
        if (data.decision === "reject") await postLedger(tx, withdrawal.userId, "withdrawal_release", 0, -withdrawal.points, `release:${id}`, "Withdrawal rejected; reserved points released");
        if (data.decision === "paid") await postLedger(tx, withdrawal.userId, "withdrawal_paid", -withdrawal.points, -withdrawal.points, `paid:${id}`, "Withdrawal payment recorded");
      } else {
        if (data.decision === "reject") await postDepositLedger(tx, withdrawal.userId, "withdrawal_release", 0, -withdrawal.amountCents, `release:${id}`, "Withdrawal rejected; deposit funds released");
        if (data.decision === "paid") await postDepositLedger(tx, withdrawal.userId, "withdrawal_paid", -withdrawal.amountCents, -withdrawal.amountCents, `paid:${id}`, "Deposit withdrawal payment recorded");
      }
      const updated = await tx.withdrawal.update({ where: { id }, data: { status: data.decision === "approve" ? "approved" : data.decision === "reject" ? "rejected" : "paid", reason: data.reason, paymentReference: data.paymentReference } });
      await tx.auditLog.create({ data: { actorId: user.id, targetId: id, action: `withdrawal.${updated.status}`, reason: data.reason, detail: { paymentReference: data.paymentReference || null } } });
      return updated;
    });
  }
}
