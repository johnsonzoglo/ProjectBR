import { BadRequestException, ConflictException, Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { db } from "../../database.js";
import { requireUser } from "../permissions/access.js";
import { postDepositLedger, postLedger, rewardTransaction, throttle } from "../rewards/service.js";
import { validate } from "../rewards/rewards.controller.js";

const pagination = (input = "1") => Math.max(1, Math.min(10000, Math.floor(Number(input) || 1)));
const userSelect = { id: true, name: true, email: true, status: true, emailVerified: true, withdrawalEligible: true, withdrawalReason: true, referralCode: true, createdAt: true, wallet: true, roles: { select: { role: { select: { name: true, key: true } } } } } as const;

@Controller("api/v1/admin")
export class AdminController {
  @Get("users")
  async users(@Req() req: Request, @Query("page") pageInput = "1", @Query("search") search = "", @Query("status") status = "all") {
    await requireUser(req, "users.read");
    const page = pagination(pageInput);
    const filter = validate(z.enum(["all", "active", "suspended"]), status);
    const term = search.trim().slice(0, 100);
    const where = { ...(filter === "all" ? {} : { status: filter }), ...(term ? { OR: [{ name: { contains: term, mode: "insensitive" as const } }, { email: { contains: term, mode: "insensitive" as const } }] } : {}) };
    const [items, total] = await db.$transaction([
      db.user.findMany({ where, skip: (page - 1) * 20, take: 20, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: userSelect }),
      db.user.count({ where }),
    ]);
    return { items, total, page: Math.floor(page), pageSize: 20 };
  }

  @Get("overview")
  async overview(@Req() req: Request) {
    await requireUser(req, "users.read"); await requireUser(req, "rewards.manage");
    const [users, suspended, unverified, tasks, reviews, withdrawals, deposits, balances, paid, referrals] = await db.$transaction([
      db.user.count(), db.user.count({ where: { status: "suspended" } }), db.user.count({ where: { emailVerified: false } }), db.task.count({ where: { active: true } }), db.taskRun.count({ where: { status: "pending_review" } }), db.withdrawal.count({ where: { status: { in: ["pending", "approved"] } } }), db.deposit.count({ where: { status: "pending_review" } }), db.wallet.aggregate({ _sum: { points: true, depositCents: true, reservedPoints: true, reservedDepositCents: true } }), db.withdrawal.aggregate({ where: { status: "paid" }, _sum: { amountCents: true } }), db.referral.count(),
    ]);
    return { users, suspended, unverified, tasks, reviews, withdrawals, deposits, balances: balances._sum, paidCents: paid._sum.amountCents || 0, referrals };
  }

  @Get("users/:id")
  async detail(@Req() req: Request, @Param("id") id: string) {
    await requireUser(req, "users.read");
    const user = await db.user.findUnique({ where: { id }, select: { ...userSelect, _count: { select: { taskRuns: true, referralsSent: true, deposits: true, withdrawals: true } } } });
    if (!user) throw new BadRequestException("User not found.");
    return user;
  }

  @Get("users/:id/activity")
  async activity(@Req() req: Request, @Param("id") id: string, @Query("kind") kind = "transactions", @Query("page") input = "1") {
    await requireUser(req, "users.read"); const page = pagination(input); const paging = { skip: (page - 1) * 20, take: 20 };
    const key = validate(z.enum(["transactions", "tasks", "deposits", "withdrawals", "referrals"]), kind);
    const where = { userId: id };
    if (key === "tasks") { const [items, total] = await db.$transaction([db.taskRun.findMany({ where, ...paging, orderBy: { startedAt: "desc" }, include: { task: { select: { title: true } } } }), db.taskRun.count({ where })]); return { items, total, page, pageSize: 20 }; }
    if (key === "referrals") { const [items, total] = await db.$transaction([db.referral.findMany({ where: { inviterId: id }, ...paging, orderBy: { createdAt: "desc" }, include: { invitee: { select: { name: true, email: true } } } }), db.referral.count({ where: { inviterId: id } })]); return { items, total, page, pageSize: 20 }; }
    if (key === "deposits") { const [items, total] = await db.$transaction([db.deposit.findMany({ where, ...paging, orderBy: { createdAt: "desc" } }), db.deposit.count({ where })]); return { items, total, page, pageSize: 20 }; }
    if (key === "withdrawals") { const [items, total] = await db.$transaction([db.withdrawal.findMany({ where, ...paging, orderBy: { createdAt: "desc" } }), db.withdrawal.count({ where })]); return { items, total, page, pageSize: 20 }; }
    const [items, total] = await db.$transaction([db.ledgerEntry.findMany({ where, ...paging, orderBy: { createdAt: "desc" } }), db.ledgerEntry.count({ where })]); return { items, total, page, pageSize: 20 };
  }

  @Patch("users/:id/profile")
  async edit(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) {
    const { user: actor } = await requireUser(req, "users.manage");
    const data = validate(z.object({ name: z.string().trim().min(2).max(80), email: z.email().toLowerCase(), reason: z.string().trim().min(10).max(500) }).strict(), body);
    return rewardTransaction(async tx => {
      const target = await tx.user.findUnique({ where: { id }, include: { roles: { include: { role: true } } } });
      if (!target || id === actor.id || target.roles.some(r => r.role.key !== "user")) throw new BadRequestException("Select a regular user account to edit.");
      const duplicate = await tx.user.findUnique({ where: { email: data.email } });
      if (duplicate && duplicate.id !== id) throw new ConflictException("This email is already registered.");
      const changed = target.email !== data.email;
      await tx.user.update({ where: { id }, data: { name: data.name, email: data.email, ...(changed ? { emailVerified: false } : {}) } });
      if (changed) await tx.session.deleteMany({ where: { userId: id } });
      await tx.auditLog.create({ data: { actorId: actor.id, targetId: id, action: "user.profile_changed", reason: data.reason, detail: { before: { name: target.name, email: target.email }, after: { name: data.name, email: data.email }, verificationRequired: changed } } });
      return { success: true, verificationRequired: changed };
    });
  }

  @Post("users/:id/adjustment")
  async adjustment(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) {
    const { user: actor } = await requireUser(req, "rewards.manage"); await throttle(actor.id, "admin_adjustment", 20);
    const data = validate(z.object({ source: z.enum(["points", "deposit"]), delta: z.number().int().min(-1000000).max(1000000).refine(v => v !== 0), reason: z.string().trim().min(10).max(500), requestKey: z.string().uuid() }).strict(), body);
    return rewardTransaction(async tx => {
      const target = await tx.user.findUnique({ where: { id }, include: { roles: { include: { role: true } } } });
      if (!target || id === actor.id || target.roles.some(r => r.role.key !== "user")) throw new BadRequestException("Balance adjustments are for regular user accounts only.");
      const reference = `adjustment:${actor.id}:${data.requestKey}`;
      const existing = await tx.ledgerEntry.findUnique({ where: { reference } });
      if (existing) {
        if (existing.userId !== id || existing.kind !== `admin_${data.source}_adjustment` || existing.description !== data.reason || (data.source === "points" ? existing.points : existing.depositCents) !== data.delta) throw new ConflictException("This adjustment key was already used for another change.");
        return { success: true, applied: false };
      }
      if (data.source === "points") await postLedger(tx, id, "admin_points_adjustment", data.delta, 0, reference, data.reason);
      else await postDepositLedger(tx, id, "admin_deposit_adjustment", data.delta, 0, reference, data.reason);
      await tx.auditLog.create({ data: { actorId: actor.id, targetId: id, action: "user.balance_adjusted", reason: data.reason, detail: { source: data.source, delta: data.delta, reference } } });
      return { success: true, applied: true };
    });
  }

  @Get("referrals")
  async referrals(@Req() req: Request, @Query("page") input = "1", @Query("search") search = "") {
    await requireUser(req, "rewards.manage"); const page = pagination(input); const term = search.trim().slice(0, 100);
    const where = term ? { OR: [{ inviter: { email: { contains: term, mode: "insensitive" as const } } }, { invitee: { email: { contains: term, mode: "insensitive" as const } } }] } : {};
    const [items, total] = await db.$transaction([db.referral.findMany({ where, skip: (page - 1) * 20, take: 20, orderBy: { createdAt: "desc" }, include: { inviter: { select: { name: true, email: true } }, invitee: { select: { name: true, email: true } } } }), db.referral.count({ where })]);
    return { items, total, page, pageSize: 20 };
  }

  @Get("audit")
  async auditHistory(@Req() req: Request, @Query("page") input = "1", @Query("search") search = "") {
    await requireUser(req, "audit.read"); const page = pagination(input); const term = search.trim().slice(0, 100);
    const where = term ? { OR: [{ action: { contains: term, mode: "insensitive" as const } }, { targetId: { contains: term } }, { actorId: { contains: term } }] } : {};
    const [items, total] = await db.$transaction([db.auditLog.findMany({ where, skip: (page - 1) * 20, take: 20, orderBy: { createdAt: "desc" } }), db.auditLog.count({ where })]);
    return { items, total, page, pageSize: 20 };
  }

  @Post("users/:id/status")
  async status(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) {
    const { user: actor } = await requireUser(req, "users.manage");
    const parsed = z.object({ status: z.enum(["active", "suspended"]), reason: z.string().trim().min(10).max(500) }).strict().safeParse(body);
    if (!parsed.success || id === actor.id) throw new BadRequestException("A valid status and reason are required. You cannot change your own status.");
    await rewardTransaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id }, include: { roles: { include: { role: true } } } });
      if (!target) throw new BadRequestException("User not found.");
      if (target.roles.some(({ role }) => role.key !== "user")) throw new BadRequestException("Staff account changes require a separate staff administration workflow.");
      await tx.user.update({ where: { id }, data: { status: parsed.data.status } });
      if (parsed.data.status === "suspended") await tx.session.deleteMany({ where: { userId: id } });
      await tx.auditLog.create({ data: { actorId: actor.id, targetId: id, action: "user.status_changed", reason: parsed.data.reason, detail: { from: target.status, to: parsed.data.status } } });
    });
    return { success: true };
  }

  @Get("audit-logs")
  async audit(@Req() req: Request) {
    await requireUser(req, "audit.read");
    return db.auditLog.findMany({ take: 50, orderBy: { createdAt: "desc" } });
  }
}
