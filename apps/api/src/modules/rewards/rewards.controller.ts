import { mobileNumberSchema } from "./mobile-number.js";
import { BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Param, Post, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";
import { db } from "../../database.js";
import { env } from "../../config.js";
import { requireUser } from "../permissions/access.js";
import { hasRequiredMembership, withdrawalReferralProgress, buyMembership, cancelWithdrawal, claimTask, requestWithdrawal, settings, startTask, submitTask, throttle, usdCents } from "./service.js";
import { cryptoDestination, cryptoNetworks, parseCryptoDestination } from "./crypto.js";
import { decodeTaskProof, displayTaskProof, loadTaskProof } from "./task-proof-storage.js";

export function validate<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues.map(i => `${i.path.join(".") || "Input"}: ${i.message}`).join(" "));
  return parsed.data;
}
const pageValue = (value = "1") => Math.max(1, Math.min(10000, Math.floor(Number(value) || 1)));
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

@Controller("api/v1")
export class RewardsController {
  @Get("tasks")
  async tasks(@Req() req: Request) {
    const { user, permissions } = await requireUser(req);
    if (permissions.includes("users.read")) throw new ForbiddenException("Staff accounts manage tasks from the admin control center and cannot participate in them.");
    const now = new Date(); const day = new Date(now); day.setUTCHours(0, 0, 0, 0);
    const [tasks, purchases, favorites] = await Promise.all([
      db.task.findMany({
        where: { removedAt: null, OR: [{ active: true, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gte: now } }] }, { runs: { some: { userId: user.id } } }] },
        omit: { coverImage: true, surveyQuestions: true },
        include: {
          products: { orderBy: { position: "asc" }, select: { id: true, taskId: true, name: true, description: true, position: true } },
          runs: { where: { userId: user.id }, orderBy: { round: "desc" }, omit: { proofImage: true, surveyAnswers: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      db.membershipPurchase.findMany({ where: { userId: user.id, status: "active", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, select: { planId: true } }),
      db.taskFavorite.findMany({ where: { userId: user.id }, select: { taskId: true } }),
    ]);
    const ownedPlans = purchases.map(purchase => purchase.planId);
    const grants = ownedPlans.length ? await db.membershipPlanAccess.findMany({ where: { grantorPlanId: { in: ownedPlans } }, select: { targetPlanId: true } }) : [];
    const allowedPlans = new Set([...ownedPlans, ...grants.map(grant => grant.targetPlanId)]);
    const visible = tasks.filter(task => !task.requiresMembership || (task.membershipPlanId ? allowedPlans.has(task.membershipPlanId) : ownedPlans.length > 0));
    const currentRounds = new Map(visible.map(task => [task.id, task.repeatHours ? Math.max(0, Math.floor((now.getTime() - task.startsAt.getTime()) / (task.repeatHours * 3600000))) : 0]));
    const [dailyCounts, roundCounts] = visible.length ? await Promise.all([
      db.taskRun.groupBy({ by: ["taskId"], where: { taskId: { in: visible.map(task => task.id) }, startedAt: { gte: day } }, _count: true }),
      db.taskRun.groupBy({ by: ["taskId", "round"], where: { OR: visible.map(task => ({ taskId: task.id, round: currentRounds.get(task.id)! })) }, _count: true }),
    ]) : [[], []];
    const today = new Map(dailyCounts.map(count => [count.taskId, count._count]));
    const usedByRound = new Map(roundCounts.map(count => [`${count.taskId}:${count.round}`, count._count]));
    const favoriteIds = new Set(favorites.map(item => item.taskId));
    return visible.flatMap(({ runs, ...task }) => {
      const round = currentRounds.get(task.id)!;
      const run = runs.find(item => item.round === round) || runs.find(item => item.status !== "completed") || null;
      if (run?.status === "completed" && (!task.completedVisibleHours || (run.completedAt && now.getTime() - run.completedAt.getTime() > task.completedVisibleHours * 3600000))) return [];
      const nextAvailableAt = task.repeatHours ? new Date(task.startsAt.getTime() + (round + 1) * task.repeatHours * 3600000).toISOString() : null;
      return [{ ...task, products: task.products, favorite: favoriteIds.has(task.id), run, round, nextAvailableAt, coverImageUrl: task.coverVersion ? `/api/v1/tasks/${task.id}/cover?v=${task.coverVersion}` : null, slotsRemaining: Math.max(0, Math.min(task.totalLimit - (usedByRound.get(`${task.id}:${round}`) || 0), task.dailyLimit - (today.get(task.id) || 0))) }];
    });
  }

  @Get("tasks/:id")
  async task(@Req() req: Request, @Param("id") id: string) {
    const all = await this.tasks(req);
    const task = all.find(t => t.id === id);
    if (!task) throw new NotFoundException("Task not found or unavailable.");
    const full = await db.task.findUnique({ where: { id }, include: { products: { orderBy: { position: "asc" } }, runs: { where: { userId: (await requireUser(req)).user.id }, orderBy: { round: "desc" } } } });
    if (!full) throw new NotFoundException("Task not found or unavailable.");
    const currentRun = task.run ? full.runs.find(run => run.id === task.run?.id) : null;
    return { ...full, runs: full.runs.map(displayTaskProof), run: currentRun ? displayTaskProof(currentRun) : null, round: task.round, nextAvailableAt: task.nextAvailableAt, slotsRemaining: task.slotsRemaining, coverImageUrl: task.coverImageUrl };
  }

  @Get("task-proofs/:runId")
  async taskProof(@Req() req: Request, @Param("runId") runId: string, @Res() res: Response) {
    const { user, permissions } = await requireUser(req);
    const run = await db.taskRun.findUnique({ where: { id: runId }, select: { userId: true, proofImage: true } });
    if (!run?.proofImage || (run.userId !== user.id && !permissions.includes("rewards.manage"))) throw new NotFoundException("Task proof not found.");
    const stored = await loadTaskProof(run.proofImage);
    if (!stored && run.proofImage.startsWith("task-proof:")) throw new NotFoundException("Task proof not found.");
    const image = stored || decodeTaskProof(run.proofImage);
    res.setHeader("Content-Type", `image/${image.type}`);
    res.setHeader("Cache-Control", "private, no-store");
    return res.send(image.bytes);
  }

  @Get("tasks/:id/cover")
  async cover(@Req() req: Request, @Param("id") id: string, @Res() res: Response) {
    const { user } = await requireUser(req);
    const task = await db.task.findUnique({ where: { id }, select: { coverImage: true, removedAt: true, active: true, startsAt: true, endsAt: true, requiresMembership: true, membershipPlanId: true } });
    if (!task?.coverImage || task.removedAt || (task.requiresMembership && !(await hasRequiredMembership(db, user.id, task.membershipPlanId)))) throw new NotFoundException("Cover not found.");
    const now = new Date();
    if ((!task.active || task.startsAt > now || (task.endsAt && task.endsAt < now)) && !(await db.taskRun.count({ where: { taskId: id, userId: user.id } }))) throw new NotFoundException("Cover not found.");
    const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(task.coverImage);
    if (!match) throw new NotFoundException("Cover not found.");
    res.setHeader("Content-Type", `image/${match[1]}`);
    res.setHeader("Cache-Control", "private, max-age=3600");
    return res.send(Buffer.from(match[2], "base64"));
  }

  @Post("tasks/:id/start")
  async start(@Req() req: Request, @Param("id") id: string) {
    const { user, permissions } = await requireUser(req); if (permissions.includes("users.read")) throw new ForbiddenException("Staff accounts cannot perform tasks."); await throttle(user.id, "start");
    return startTask(user.id, id);
  }

  @Get("membership/plans")
  async membershipPlans(@Req() req: Request) {
    const { user } = await requireUser(req);
    const [plans, wallet, qualifiedReferrals, completedTasks] = await db.$transaction([
      db.membershipPlan.findMany({ where: { active: true }, orderBy: { priceCents: "asc" } }),
      db.wallet.findUnique({ where: { userId: user.id } }),
      db.referral.count({ where: { inviterId: user.id, qualifiedAt: { not: null } } }),
      db.taskRun.count({ where: { userId: user.id, status: "completed" } }),
    ]);
    const availableDepositCents = (wallet?.depositCents || 0) - (wallet?.reservedDepositCents || 0);
    return plans.map(plan => {
      const reasons: string[] = [];
      if (availableDepositCents < plan.priceCents) reasons.push(`Add ${money(plan.priceCents - availableDepositCents)} to your deposit balance.`);
      if (qualifiedReferrals < plan.minimumReferrals) reasons.push(`You need ${plan.minimumReferrals - qualifiedReferrals} more qualified referral${plan.minimumReferrals - qualifiedReferrals === 1 ? "" : "s"}.`);
      if (completedTasks < plan.minimumCompletedTasks) reasons.push(`You need to complete ${plan.minimumCompletedTasks - completedTasks} more task${plan.minimumCompletedTasks - completedTasks === 1 ? "" : "s"}.`);
      return { ...plan, eligibility: { allowed: reasons.length === 0, reasons, availableDepositCents, shortfallCents: Math.max(0, plan.priceCents - availableDepositCents), qualifiedReferrals, completedTasks } };
    });
  }

  @Get("membership")
  async membership(@Req() req: Request) {
    const { user } = await requireUser(req);
    const current = await db.membershipPurchase.findFirst({ where: { userId: user.id, status: "active", OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, include: { plan: true }, orderBy: { expiresAt: "desc" } });
    return { activeMembership: current ? { ...current, plan: current.plan } : null, hasActiveMembership: !!current };
  }

  @Post("membership/purchase")
  async purchaseMembership(@Req() req: Request, @Body() body: unknown) {
    const { user } = await requireUser(req);
    const data = validate(z.object({ planId: z.string().trim().min(1).max(100) }).strict(), body);
    return buyMembership(user.id, data.planId);
  }

  @Post("tasks/:id/submit")
  async submit(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) {
    const { user, permissions } = await requireUser(req); if (permissions.includes("users.read")) throw new ForbiddenException("Staff accounts cannot perform tasks.");
    const result = await submitTask(user.id, id, validate(z.object({ runId: z.string().uuid().optional(), code: z.string().trim().min(1).max(128).optional(), proof: z.string().trim().min(10).max(4000).optional(), proofImage: z.string().max(2_800_000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/).optional(), rating: z.number().int().min(1).max(5).optional(), selectedDesignId: z.string().uuid().optional(), surveyAnswers: z.array(z.object({ questionId: z.string().uuid(), answer: z.string().trim().min(1).max(2000) }).strict()).optional(), productAnswers: z.array(z.object({ productId: z.string().uuid(), answer: z.boolean() }).strict()).min(5).max(10).optional() }).strict(), body));
    return displayTaskProof(result);
  }

  @Post("tasks/:id/claim")
  async claim(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) {
    const { user, permissions } = await requireUser(req); if (permissions.includes("users.read")) throw new ForbiddenException("Staff accounts cannot perform tasks."); await throttle(user.id, "claim");
    const { runId } = validate(z.object({ runId: z.string().uuid().optional() }).strict(), body || {});
    const result = await claimTask(user.id, id, runId);
    return { ...result, run: displayTaskProof(result.run) };
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
      const withdrawalEligible = user.withdrawalEligible && user.emailVerified && rules.withdrawalsEnabled;
      const referralRequirement = await withdrawalReferralProgress(tx, user.id, rules.minWithdrawalReferrals);
      return { referralRequirement, points, reservedPoints, depositCents, reservedDepositCents, withdrawableDepositCents: withdrawalEligible ? depositCents - reservedDepositCents : 0, usdCents: usdCents(points, rules.pointsPerUsd), withdrawablePoints: withdrawalEligible ? points - reservedPoints : 0, withdrawableCents: withdrawalEligible ? usdCents(points - reservedPoints, rules.pointsPerUsd) : 0, eligible: withdrawalEligible, eligibilityReason: !rules.withdrawalsEnabled ? "New reward withdrawals are temporarily disabled." : !user.emailVerified ? "Verify your email from your account page before withdrawing rewards." : user.withdrawalReason, todayPoints: earned._sum.points || 0, rules };
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
      db.withdrawal.findMany({ where: { userId: user.id }, omit: { payoutProofImage: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 20, take: 20 }),
      db.withdrawal.count({ where: { userId: user.id } }),
    ]);
    return { items, total, page, pageSize: 20 };
  }

  @Post("wallet/withdrawals")
  async withdraw(@Req() req: Request, @Body() body: unknown) {
    const { user } = await requireUser(req); await throttle(user.id, "withdrawal", 10);
    const data = validate(z.object({ mobileNumber: mobileNumberSchema, amountCents: z.number().int().positive().max(100000000), provider: z.literal("crypto"), destination: z.string().trim().min(5).max(300).optional(), asset: z.literal("USDT").optional(), network: z.literal("TRON (TRC20)").optional(), address: z.string().trim().max(160).optional(), requestKey: z.string().uuid(), source: z.literal("points").default("points") }).strict(), body);
    if (data.provider === "crypto") {
      if (data.asset && data.network && data.address) {
        if (!cryptoNetworks[data.asset].includes(data.network)) throw new BadRequestException("Select a supported network for this coin.");
        data.destination = cryptoDestination(data.asset, data.network, data.address);
      } else {
        const parsed = parseCryptoDestination(data.destination || "");
        if (parsed.asset !== "USDT" || parsed.network !== "TRON (TRC20)") throw new BadRequestException("Reward payouts use USDT on TRON (TRC20).");
        data.destination = cryptoDestination(parsed.asset, parsed.network, parsed.address);
      }
    }
    if (!data.destination) throw new BadRequestException("Enter a payout destination.");
    return requestWithdrawal(user.id, { amountCents: data.amountCents, provider: data.provider, destination: data.destination, mobileNumber: data.mobileNumber, requestKey: data.requestKey, source: data.source });
  }

  @Post("wallet/withdrawals/:id/cancel")
  async cancelWithdrawal(@Req() req: Request, @Param("id") id: string) {
    const { user } = await requireUser(req); await throttle(user.id, "withdrawal_cancel", 10);
    return cancelWithdrawal(user.id, id);
  }

  @Get("referrals")
  async referrals(@Req() req: Request, @Query("page") pageInput?: string) {
    const { user } = await requireUser(req); const page = pageValue(pageInput);
    const [rules, total, verified, qualified, earnings, rows] = await db.$transaction([
      db.rewardSettings.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} }),
      db.referral.count({ where: { inviterId: user.id } }),
      db.referral.count({ where: { inviterId: user.id, verifiedAt: { not: null } } }),
      db.referral.count({ where: { inviterId: user.id, qualifiedAt: { not: null } } }),
      db.ledgerEntry.aggregate({ where: { userId: user.id, kind: "referral_credit" }, _sum: { points: true } }),
      db.referral.findMany({ where: { inviterId: user.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 20, take: 20, include: { invitee: { select: { name: true, emailVerified: true, _count: { select: { taskRuns: { where: { status: "completed" } } } } } } } }),
    ]);
    return { code: user.referralCode, link: `${env.APP_ORIGIN}/register?ref=${encodeURIComponent(user.referralCode)}`, total, verified, qualified, earningsPoints: earnings._sum.points || 0, rules, page, pageSize: 20,
      items: rows.map(({ invitee, ...r }) => ({ id: r.id, name: invitee.name.split(" ")[0], emailVerified: invitee.emailVerified, completedTasks: invitee._count.taskRuns, requiredTasks: r.requiredTasks, rewardPoints: r.rewardPoints, verifiedAt: r.verifiedAt, qualifiedAt: r.qualifiedAt, createdAt: r.createdAt })) };
  }
}
