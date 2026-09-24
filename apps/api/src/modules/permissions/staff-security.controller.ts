import { BadRequestException, Body, Controller, Get, Post, Req, UnauthorizedException } from "@nestjs/common";
import { verifyPassword } from "better-auth/crypto";
import type { Request } from "express";
import { z } from "zod";
import { db } from "../../database.js";
import { throttle } from "../rewards/service.js";
import { requireUser } from "./access.js";

@Controller("api/v1/admin/security")
export class StaffSecurityController {
  @Get()
  async status(@Req() req: Request) {
    const { user, sessionId } = await requireUser(req, undefined, { allowStaffEnrollment: true });
    if (!user.roles.some(({ role }) => role.key !== "user")) throw new UnauthorizedException("Staff access is required.");
    const session = await db.session.findUnique({ where: { id: sessionId }, select: { createdAt: true, staffReauthenticatedAt: true } });
    const freshAt = session?.staffReauthenticatedAt || session?.createdAt;
    return { twoFactorEnabled: user.twoFactorEnabled, recentAuth: !!freshAt && Date.now() - freshAt.getTime() < 10 * 60 * 1000, idleMinutes: 30, maximumHours: 12 };
  }

  @Post("confirm")
  async confirm(@Req() req: Request, @Body() body: unknown) {
    const { user, sessionId } = await requireUser(req, "users.read");
    const parsed = z.object({ password: z.string().min(1).max(128) }).strict().safeParse(body);
    if (!parsed.success) throw new BadRequestException("Enter your current password.");
    await throttle(user.id, "staff_reauthentication", 5);
    const account = await db.account.findFirst({ where: { userId: user.id, providerId: "credential" }, select: { password: true } });
    if (!account?.password || !await verifyPassword({ password: parsed.data.password, hash: account.password })) {
      await db.auditLog.create({ data: { actorId: user.id, action: "staff.reauthentication_failed", targetId: user.id } });
      throw new UnauthorizedException("Incorrect password.");
    }
    await db.$transaction([
      db.session.update({ where: { id: sessionId }, data: { staffReauthenticatedAt: new Date() } }),
      db.auditLog.create({ data: { actorId: user.id, action: "staff.reauthenticated", targetId: user.id } }),
    ]);
    return { success: true, validMinutes: 10 };
  }
}
