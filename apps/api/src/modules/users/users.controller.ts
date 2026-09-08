import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Req } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { db } from "../../database.js";
import { publicProfile, requireUser } from "../permissions/access.js";

@Controller("api/v1/me")
export class UsersController {
  @Get()
  async profile(@Req() req: Request) {
    const { user, permissions } = await requireUser(req);
    return { user: publicProfile(user), permissions, roles: user.roles.map(({ role }) => role.name) };
  }

  @Patch()
  async update(@Req() req: Request, @Body() body: unknown) {
    const { user } = await requireUser(req);
    const parsed = z.object({ name: z.string().trim().min(2).max(80) }).strict().safeParse(body);
    if (!parsed.success) throw new BadRequestException("Provide a display name between 2 and 80 characters.");
    const [updated] = await db.$transaction([
      db.user.update({ where: { id: user.id }, data: parsed.data }),
      db.auditLog.create({ data: { actorId: user.id, targetId: user.id, action: "profile.updated", detail: { field: "name" } } }),
    ]);
    return { user: publicProfile(updated) };
  }

  @Get("sessions")
  async sessions(@Req() req: Request) {
    const { user, sessionId } = await requireUser(req);
    const rows = await db.session.findMany({ where: { userId: user.id, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" }, select: { id: true, createdAt: true, expiresAt: true, userAgent: true } });
    return rows.map((session) => ({ ...session, current: session.id === sessionId }));
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
