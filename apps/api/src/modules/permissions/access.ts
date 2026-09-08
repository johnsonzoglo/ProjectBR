import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { fromNodeHeaders } from "better-auth/node";
import type { Request } from "express";
import { auth } from "../auth/auth.js";
import { db } from "../../database.js";

export async function requireUser(req: Request, permission?: string) {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session) throw new UnauthorizedException("Sign in to continue.");
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
  });
  if (!user || user.status !== "active" || !user.emailVerified) throw new ForbiddenException("An active, verified account is required.");
  const permissions = [...new Set(user.roles.flatMap(({ role }) => role.permissions.map(({ permission }) => permission.key)))];
  if (permission && !permissions.includes(permission)) throw new ForbiddenException("You do not have access to this action.");
  return { user, permissions, sessionId: session.session.id };
}

export function publicProfile(user: { id: string; name: string; email: string; emailVerified: boolean; status: string; referralCode: string; createdAt: Date }) {
  return { id: user.id, name: user.name, email: user.email, emailVerified: user.emailVerified, status: user.status, referralCode: user.referralCode, createdAt: user.createdAt };
}
