import { BadRequestException, Body, ConflictException, Controller, Delete, Get, Param, Patch, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { db } from "../../database.js";
import { requireUser } from "../permissions/access.js";

const preferencesSchema = z.object({ emailTaskApproved: z.boolean(), emailPayments: z.boolean(), emailSecurity: z.boolean(), inAppTasks: z.boolean(), inAppPayments: z.boolean(), marketing: z.boolean() }).strict();

@Controller("api/v1")
export class PortalController {
  @Get("me/preferences")
  async preferences(@Req() req: Request) { const { user } = await requireUser(req); return { emailTaskApproved: true, emailPayments: true, emailSecurity: true, inAppTasks: true, inAppPayments: true, marketing: false, ...(user.notificationPreferences as object) }; }

  @Patch("me/preferences")
  async updatePreferences(@Req() req: Request, @Body() body: unknown) {
    const { user } = await requireUser(req); const input = preferencesSchema.safeParse(body);
    if (!input.success) throw new BadRequestException("Choose valid notification preferences.");
    await db.user.update({ where: { id: user.id }, data: { notificationPreferences: input.data } });
    await db.auditLog.create({ data: { actorId: user.id, targetId: user.id, action: "profile.notification_preferences_updated" } });
    return input.data;
  }

  @Get("me/export")
  async exportData(@Req() req: Request) {
    const { user } = await requireUser(req);
    const [runs, ledger, withdrawals, deposits, referrals, memberships, tickets] = await Promise.all([
      db.taskRun.findMany({ where: { userId: user.id }, include: { task: { select: { title: true } } }, orderBy: { startedAt: "desc" } }), db.ledgerEntry.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }), db.withdrawal.findMany({ where: { userId: user.id }, omit: { payoutProofImage: true } }), db.deposit.findMany({ where: { userId: user.id }, omit: { proofImage: true } }), db.referral.findMany({ where: { inviterId: user.id } }), db.membershipPurchase.findMany({ where: { userId: user.id }, include: { plan: true } }), db.supportTicket.findMany({ where: { userId: user.id } })
    ]);
    await db.auditLog.create({ data: { actorId: user.id, targetId: user.id, action: "profile.data_exported" } });
    return { exportedAt: new Date(), profile: { name: user.name, email: user.email, phone: user.phone, createdAt: user.createdAt }, taskHistory: runs, ledger, withdrawals, deposits, referrals, memberships, supportTickets: tickets };
  }

  @Post("me/deletion-request")
  async requestDeletion(@Req() req: Request, @Body() body: unknown) {
    const { user } = await requireUser(req); const parsed = z.object({ reason: z.string().trim().min(10).max(500) }).strict().safeParse(body);
    if (!parsed.success) throw new BadRequestException("Explain your request in at least 10 characters.");
    const [withdrawals, deposits] = await Promise.all([db.withdrawal.count({ where: { userId: user.id, status: { in: ["pending", "approved"] } } }), db.deposit.count({ where: { userId: user.id, status: { in: ["awaiting_payment", "pending_review"] } } })]);
    if (withdrawals || deposits) throw new ConflictException("Resolve open payments and withdrawals before requesting account deletion.");
    return db.accountDeletionRequest.upsert({ where: { userId: user.id }, create: { userId: user.id, reason: parsed.data.reason }, update: { reason: parsed.data.reason, status: "pending", reviewedAt: null } });
  }

  @Get("support/tickets")
  async tickets(@Req() req: Request) { const { user } = await requireUser(req); return db.supportTicket.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50 }); }

  @Post("support/tickets")
  async createTicket(@Req() req: Request, @Body() body: unknown) {
    const { user } = await requireUser(req); const parsed = z.object({ category: z.enum(["task", "payment", "account", "other"]), referenceType: z.string().trim().max(30).optional(), referenceId: z.string().trim().max(100).optional(), subject: z.string().trim().min(4).max(120), message: z.string().trim().min(10).max(4000) }).strict().safeParse(body);
    if (!parsed.success) throw new BadRequestException("Complete the ticket subject and message.");
    return db.supportTicket.create({ data: { userId: user.id, ...parsed.data } });
  }

  @Post("tasks/:id/favorite")
  async favorite(@Req() req: Request, @Param("id") taskId: string) { const { user } = await requireUser(req); await db.taskFavorite.upsert({ where: { userId_taskId: { userId: user.id, taskId } }, create: { userId: user.id, taskId }, update: {} }); return { favorite: true }; }
  @Delete("tasks/:id/favorite")
  async unfavorite(@Req() req: Request, @Param("id") taskId: string) { const { user } = await requireUser(req); await db.taskFavorite.deleteMany({ where: { userId: user.id, taskId } }); return { favorite: false }; }
}
