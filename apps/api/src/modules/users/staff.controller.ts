import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { db } from "../../database.js";
import { requireRecentStaffAuth, requireUser } from "../permissions/access.js";
import { rewardTransaction } from "../rewards/service.js";
import { validate } from "../rewards/rewards.controller.js";

const staffPermissions = ["users.read", "users.manage", "chat.manage", "audit.read", "rewards.manage"] as const;
const roleInput = z.object({ name: z.string().trim().min(3).max(60), permissions: z.array(z.enum(staffPermissions)).max(staffPermissions.length), reason: z.string().trim().min(10).max(500) }).strict();
const assignmentInput = z.object({ roleKey: z.string().max(100), reason: z.string().trim().min(10).max(500) }).strict();

async function superAdmin(req: Request) {
  const actor = await requireUser(req, "roles.manage");
  if (!actor.user.roles.some(entry => entry.role.key === "super_admin")) throw new BadRequestException("Only a super admin can manage staff.");
  return actor;
}

@Controller("api/v1/admin")
export class StaffController {
  @Get("staff")
  async list(@Req() req: Request, @Query("search") search = "") {
    await superAdmin(req);
    const term = search.trim().slice(0, 100);
    const [roles, staff] = await db.$transaction([
      db.role.findMany({ where: { key: { not: "user" } }, select: { id: true, key: true, name: true, permissions: { select: { permission: { select: { key: true } } } }, _count: { select: { users: true } } }, orderBy: { name: "asc" } }),
      db.user.findMany({ where: { status: { not: "deleted" }, ...(term ? { OR: [{ email: { contains: term, mode: "insensitive" as const } }, { name: { contains: term, mode: "insensitive" as const } }] } : { roles: { some: { role: { key: { not: "user" } } } } }) }, select: { id: true, name: true, email: true, status: true, roles: { select: { role: { select: { key: true, name: true } } } } }, take: 50, orderBy: { createdAt: "desc" } }),
    ]);
    return { roles: roles.map(role => ({ ...role, permissions: role.permissions.map(p => p.permission.key) })), staff, availablePermissions: staffPermissions };
  }

  @Post("staff/roles")
  async createRole(@Req() req: Request, @Body() body: unknown) {
    const { user: actor, sessionId } = await superAdmin(req);
    await requireRecentStaffAuth(sessionId);
    const data = validate(roleInput, body);
    return rewardTransaction(async tx => {
      const permissions = await tx.permission.findMany({ where: { key: { in: ["profile.manage", ...data.permissions] } } });
      if (permissions.length !== new Set(["profile.manage", ...data.permissions]).size) throw new BadRequestException("Seed the permission catalog before creating roles.");
      const role = await tx.role.create({ data: { key: `staff_${randomUUID().replaceAll("-", "")}`, name: data.name, permissions: { create: permissions.map(permission => ({ permissionId: permission.id })) } } });
      await tx.auditLog.create({ data: { actorId: actor.id, targetId: role.id, action: "staff.role_created", reason: data.reason, detail: { name: role.name, permissions: data.permissions } } });
      return { id: role.id, key: role.key, name: role.name };
    });
  }

  @Patch("staff/roles/:id")
  async updateRole(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) {
    const { user: actor, sessionId } = await superAdmin(req);
    await requireRecentStaffAuth(sessionId);
    const data = validate(roleInput, body);
    return rewardTransaction(async tx => {
      const role = await tx.role.findUnique({ where: { id }, include: { permissions: { include: { permission: true } }, users: { select: { userId: true } } } });
      if (!role?.key.startsWith("staff_")) throw new BadRequestException("Only custom staff roles can be edited.");
      const permissions = await tx.permission.findMany({ where: { key: { in: ["profile.manage", ...data.permissions] } } });
      if (permissions.length !== new Set(["profile.manage", ...data.permissions]).size) throw new BadRequestException("The permission catalog is incomplete.");
      await tx.role.update({ where: { id }, data: { name: data.name } });
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      await tx.rolePermission.createMany({ data: permissions.map(permission => ({ roleId: id, permissionId: permission.id })) });
      await tx.session.deleteMany({ where: { userId: { in: role.users.map(user => user.userId) } } });
      await tx.auditLog.create({ data: { actorId: actor.id, targetId: id, action: "staff.role_updated", reason: data.reason, detail: { before: role.permissions.map(p => p.permission.key), after: ["profile.manage", ...data.permissions], affectedUsers: role.users.length } } });
      return { id, name: data.name };
    });
  }

  @Patch("staff/users/:id")
  async assign(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) {
    const { user: actor, sessionId } = await superAdmin(req);
    await requireRecentStaffAuth(sessionId);
    const data = validate(assignmentInput, body);
    if (id === actor.id) throw new BadRequestException("You cannot change your own staff role.");
    return rewardTransaction(async tx => {
      const target = await tx.user.findUnique({ where: { id }, include: { roles: { include: { role: true } } } });
      if (!target || target.status === "deleted") throw new BadRequestException("Select an active or suspended account.");
      if (target.roles.some(entry => entry.role.key === "super_admin")) throw new BadRequestException("Super admin access cannot be changed here.");
      const role = await tx.role.findUnique({ where: { key: data.roleKey } });
      if (!role || !["user", "admin"].includes(role.key) && !role.key.startsWith("staff_")) throw new BadRequestException("Select an available staff role.");
      const before = target.roles.map(entry => entry.role.key);
      await tx.userRole.deleteMany({ where: { userId: id, role: { key: { not: "user" } } } });
      if (role.key !== "user") await tx.userRole.create({ data: { userId: id, roleId: role.id } });
      await tx.session.deleteMany({ where: { userId: id } });
      await tx.auditLog.create({ data: { actorId: actor.id, targetId: id, action: "staff.role_assigned", reason: data.reason, detail: { before, after: role.key } } });
      return { userId: id, roleKey: role.key };
    });
  }
}
