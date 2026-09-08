import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { db } from "../../database.js";
import { requireUser } from "../permissions/access.js";

@Controller("api/v1/admin")
export class AdminController {
  @Get("users")
  async users(@Req() req: Request, @Query("page") pageInput = "1") {
    await requireUser(req, "users.read");
    const page = Math.max(1, Math.min(10000, Number(pageInput) || 1));
    const [items, total] = await db.$transaction([
      db.user.findMany({ skip: (Math.floor(page) - 1) * 20, take: 20, orderBy: { createdAt: "desc" }, select: { id: true, name: true, email: true, status: true, emailVerified: true, createdAt: true, roles: { select: { role: { select: { name: true } } } } } }),
      db.user.count(),
    ]);
    return { items, total, page: Math.floor(page), pageSize: 20 };
  }

  @Post("users/:id/status")
  async status(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) {
    const { user: actor } = await requireUser(req, "users.manage");
    const parsed = z.object({ status: z.enum(["active", "suspended"]), reason: z.string().trim().min(10).max(500) }).strict().safeParse(body);
    if (!parsed.success || id === actor.id) throw new BadRequestException("A valid status and reason are required. You cannot change your own status.");
    await db.$transaction(async (tx) => {
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
