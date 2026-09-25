import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Req } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { db } from "../../database.js";
import { publicProfile, requireUser } from "../permissions/access.js";

@Controller("api/v1/me")
export class UsersController {
  @Get()
  async profile(@Req() req: Request) {
    const { user, permissions } = await requireUser(req, undefined, { allowStaffEnrollment: true });
    return { user: publicProfile(user), permissions, roles: user.roles.map(({ role }) => role.key), security: { twoFactorEnabled: user.twoFactorEnabled }, staffSecurity: user.roles.some(({ role }) => role.key !== "user") ? { twoFactorEnabled: user.twoFactorEnabled, twoFactorEnabledAt: user.twoFactorEnabledAt } : null };
  }

  @Patch()
  async update(@Req() req: Request, @Body() body: unknown) {
    const { user } = await requireUser(req);
    const parsed = z.object({ name: z.string().trim().min(2).max(80), phone: z.string().trim().max(32).nullable().optional(), image: z.string().max(500_000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/).nullable().optional() }).strict().safeParse(body);
    if (!parsed.success) throw new BadRequestException("Check your name, phone number, and profile image.");
    const [updated] = await db.$transaction([
      db.user.update({ where: { id: user.id }, data: parsed.data }),
      db.auditLog.create({ data: { actorId: user.id, targetId: user.id, action: "profile.updated", detail: { fields: Object.keys(parsed.data) } } }),
    ]);
    return { user: publicProfile(updated) };
  }

  @Get("sessions")
  async sessions(@Req() req: Request) {
    const { user, sessionId } = await requireUser(req);
    const rows = await db.session.findMany({ where: { userId: user.id, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" }, select: { id: true, createdAt: true, expiresAt: true, userAgent: true, ipAddress: true } });
    return rows.map((session) => ({ ...session, current: session.id === sessionId }));
  }

  @Delete("sessions")
  async revokeOthers(@Req() req: Request) {
    const { user, sessionId } = await requireUser(req);
    const result = await db.session.deleteMany({ where: { userId: user.id, id: { not: sessionId } } });
    await db.auditLog.create({ data: { actorId: user.id, targetId: user.id, action: "auth.other_sessions_revoked", detail: { count: result.count } } });
    return { success: true, count: result.count };
  }

  @Delete("sessions/:id")
  async revoke(@Req() req: Request, @Param("id") id: string) {
    const { user } = await requireUser(req);
    await db.$transaction([
      db.session.deleteMany({ where: { id, userId: user.id } }),
      db.auditLog.create({ data: { actorId: user.id, targetId: user.id, action: "auth.session_revoked" } }),
    ]);
    return { success: true };
  }
}
