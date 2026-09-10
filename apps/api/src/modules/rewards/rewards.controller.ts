import { BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Param, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { db } from "../../database.js";
import { env } from "../../config.js";
import { requireUser } from "../permissions/access.js";
import { claimTask, requestWithdrawal, settings, startTask, submitTask, throttle, usdCents } from "./service.js";

export function validate<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues.map(i => `${i.path.join(".") || "Input"}: ${i.message}`).join(" "));
  return parsed.data;
}
const pageValue = (value = "1") => Math.max(1, Math.min(10000, Math.floor(Number(value) || 1)));

@Controller("api/v1")
export class RewardsController {
  @Get("tasks")
  async tasks(@Req() req: Request) {
    const { user, permissions } = await requireUser(req);
    if (permissions.includes("users.read")) throw new ForbiddenException("Staff accounts manage tasks from the admin control center and cannot participate in them.");
    const now = new Date(); const day = new Date(now); day.setUTCHours(0, 0, 0, 0);
    const tasks = await db.task.findMany({
      where: { OR: [{ active: true, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gte: now } }] }, { runs: { some: { userId: user.id } } }] },
      include: { runs: { where: { userId: user.id } }, _count: { select: { runs: true } } },
      orderBy: { createdAt: "desc" },
    });
    const today = await db.taskRun.groupBy({ by: ["taskId"], where: { startedAt: { gte: day } }, _count: true });
    return tasks.map(({ runs, _count, ...task }) => ({ ...task, run: runs[0] || null, slotsRemaining: Math.max(0, Math.min(task.totalLimit - _count.runs, task.dailyLimit - (today.find(t => t.taskId === task.id)?._count || 0))) }));
  }

  @Get("tasks/:id")
  async task(@Req() req: Request, @Param("id") id: string) {
    const all = await this.tasks(req);
    const task = all.find(t => t.id === id);
    if (!task) throw new NotFoundException("Task not found or unavailable.");
    return task;
  }

  @Post("tasks/:id/start")
  async start(@Req() req: Request, @Param("id") id: string) {
    const { user, permissions } = await requireUser(req); if (permissions.includes("users.read")) throw new ForbiddenException("Staff accounts cannot perform tasks."); await throttle(user.id, "start");
    return startTask(user.id, id);
  }

  @Post("tasks/:id/submit")
  async submit(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) {
    const { user, permissions } = await requireUser(req); if (permissions.includes("users.read")) throw new ForbiddenException("Staff accounts cannot perform tasks.");
    return submitTask(user.id, id, validate(z.object({ code: z.string().trim().min(1).max(128).optional(), proof: z.string().trim().min(10).max(4000).optional() }).strict(), body));
  }

  @Post("tasks/:id/claim")
  async claim(@Req() req: Request, @Param("id") id: string) {
    const { user, permissions } = await requireUser(req); if (permissions.includes("users.read")) throw new ForbiddenException("Staff accounts cannot perform tasks."); await throttle(user.id, "claim");
    return claimTask(user.id, id);
  }

  @Get("wallet")
  async wallet(@Req() req: Request) {
    const { user } = await requireUser(req);
    return db.$transaction(async tx => {
      const rules = await settings(tx);
      const wallet = await tx.wallet.findUnique({ where: { userId: user.id } });
      const points = wallet?.points || 0; const reservedPoints = wallet?.reservedPoints || 0;
      const depositCents = wallet?.depositCents || 0; const reservedDepositCents = wallet?.reservedDepositCents || 0;
      const day = new Date(); day.setUTCHours(0, 0, 0, 0);
      const earned = await tx.ledgerEntry.aggregate({ where: { userId: user.id, points: { gt: 0 }, createdAt: { gte: day } }, _sum: { points: true } });
      return { points, reservedPoints, depositCents, reservedDepositCents, withdrawableDepositCents: user.withdrawalEligible ? depositCents - reservedDepositCents : 0, usdCents: usdCents(points, rules.pointsPerUsd), withdrawablePoints: user.withdrawalEligible ? points - reservedPoints : 0, withdrawableCents: user.withdrawalEligible ? usdCents(points - reservedPoints, rules.pointsPerUsd) : 0, eligible: user.withdrawalEligible, eligibilityReason: user.withdrawalReason, todayPoints: earned._sum.points || 0, rules };
    }, { isolationLevel: "RepeatableRead" });
  }

  @Get("wallet/transactions")
  async transactions(@Req() req: Request, @Query("page") pageInput?: string) {
    const { user } = await requireUser(req); const page = pageValue(pageInput);
    const [items, total] = await db.$transaction([
      db.ledgerEntry.findMany({ where: { userId: user.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 20, take: 20 }),
      db.ledgerEntry.count({ where: { userId: user.id } }),
    ]);
    return { items, total, page, pageSize: 20 };
  }

  @Get("wallet/withdrawals")
  async withdrawals(@Req() req: Request, @Query("page") pageInput?: string) {
    const { user } = await requireUser(req); const page = pageValue(pageInput);
    const [items, total] = await db.$transaction([
      db.withdrawal.findMany({ where: { userId: user.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 20, take: 20 }),
      db.withdrawal.count({ where: { userId: user.id } }),
    ]);
    return { items, total, page, pageSize: 20 };
  }

  @Post("wallet/withdrawals")
  async withdraw(@Req() req: Request, @Body() body: unknown) {
    const { user } = await requireUser(req); await throttle(user.id, "withdrawal", 10);
    const data = validate(z.object({ amountCents: z.number().int().positive().max(100000000), provider: z.enum(["paypal", "crypto", "bank"]), destination: z.string().trim().min(5).max(300), requestKey: z.string().uuid(), source: z.enum(["points", "deposit"]).default("points") }).strict(), body);
    if (data.provider === "paypal" && !z.email().safeParse(data.destination).success) throw new BadRequestException("Enter your PayPal email address.");
    if (data.provider === "crypto" && data.destination.length < 15) throw new BadRequestException("Include the cryptocurrency, network, and destination address.");
    if (data.provider === "bank" && data.destination.length < 15) throw new BadRequestException("Include the account holder, bank, and account/IBAN details.");
    return requestWithdrawal(user.id, data);
  }

  @Get("referrals")
  async referrals(@Req() req: Request, @Query("page") pageInput?: string) {
    const { user } = await requireUser(req); const page = pageValue(pageInput);
    const [rules, total, qualified, earnings, rows] = await db.$transaction([
      db.rewardSettings.findUniqueOrThrow({ where: { id: "default" } }),
      db.referral.count({ where: { inviterId: user.id } }),
      db.referral.count({ where: { inviterId: user.id, qualifiedAt: { not: null } } }),
      db.ledgerEntry.aggregate({ where: { userId: user.id, kind: "referral_credit" }, _sum: { points: true } }),
      db.referral.findMany({ where: { inviterId: user.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 20, take: 20, include: { invitee: { select: { name: true, emailVerified: true, _count: { select: { taskRuns: { where: { status: "completed" } } } } } } } }),
    ]);
    return { code: user.referralCode, link: `${env.APP_ORIGIN}/register?ref=${encodeURIComponent(user.referralCode)}`, total, qualified, earningsPoints: earnings._sum.points || 0, rules, page, pageSize: 20,
      items: rows.map(({ invitee, ...r }) => ({ id: r.id, name: invitee.name.split(" ")[0], emailVerified: invitee.emailVerified, completedTasks: invitee._count.taskRuns, requiredTasks: r.requiredTasks, rewardPoints: r.rewardPoints, qualifiedAt: r.qualifiedAt, createdAt: r.createdAt })) };
  }
}
