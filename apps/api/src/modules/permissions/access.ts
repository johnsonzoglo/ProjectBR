import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { fromNodeHeaders } from "better-auth/node";
import type { Request } from "express";
import { auth } from "../auth/auth.js";
import { db } from "../../database.js";

export async function requireUser(req: Request, permission?: string, options?: { allowStaffEnrollment?: boolean }) {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session) throw new UnauthorizedException("Sign in to continue.");
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
  });
  if (!user || user.status !== "active") throw new ForbiddenException("An active account is required.");
  const permissions = [...new Set(user.roles.flatMap(({ role }) => role.permissions.map(({ permission }) => permission.key)))];
  const staff = user.roles.some(({ role }) => role.key !== "user");
  if (staff) {
    const record = await db.session.findUnique({ where: { id: session.session.id }, select: { createdAt: true, lastActivityAt: true, staffReauthenticatedAt: true } });
    if (!record) throw new UnauthorizedException("Sign in again to continue.");
    const now = Date.now();
    if (now - record.createdAt.getTime() > 12 * 60 * 60 * 1000 || now - (record.lastActivityAt || record.createdAt).getTime() > 30 * 60 * 1000) {
      await db.session.deleteMany({ where: { id: session.session.id } });
      throw new UnauthorizedException("Your staff session expired. Sign in again.");
    }
    if (now - (record.lastActivityAt || record.createdAt).getTime() > 30 * 1000) await db.session.updateMany({ where: { id: session.session.id }, data: { lastActivityAt: new Date(now) } });
    if (!options?.allowStaffEnrollment && (!user.twoFactorEnabled || !user.twoFactorEnabledAt)) throw new ForbiddenException("Staff two-factor authentication is required. Set it up in Admin security.");
    if (!options?.allowStaffEnrollment && user.twoFactorEnabledAt && record.createdAt.getTime() < user.twoFactorEnabledAt.getTime()) {
      await db.session.deleteMany({ where: { id: session.session.id } });
      throw new UnauthorizedException("Sign in again with your authenticator code.");
    }
  }
  if (permission && !permissions.includes(permission)) throw new ForbiddenException("You do not have access to this action.");
  return { user, permissions, sessionId: session.session.id };
}

export async function requireRecentStaffAuth(sessionId: string) {
  const session = await db.session.findUnique({ where: { id: sessionId }, select: { createdAt: true, staffReauthenticatedAt: true } });
  const freshAt = session?.staffReauthenticatedAt || session?.createdAt;
  if (!freshAt || Date.now() - freshAt.getTime() >= 10 * 60 * 1000) throw new ForbiddenException("REAUTH_REQUIRED: Confirm your password in Admin security, then retry this action.");
}

export function publicProfile(user: { id: string; name: string; email: string; emailVerified: boolean; image?: string | null; phone?: string | null; notificationPreferences?: unknown; status: string; referralCode: string; createdAt: Date; twoFactorEnabled?: boolean }) {
  return { id: user.id, name: user.name, email: user.email, emailVerified: user.emailVerified, image: user.image || null, phone: user.phone || null, notificationPreferences: user.notificationPreferences || {}, status: user.status, referralCode: user.referralCode, createdAt: user.createdAt, twoFactorEnabled: !!user.twoFactorEnabled };
}
