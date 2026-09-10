import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { db } from "../../database.js";
import { env, trustedOrigins } from "../../config.js";
import { sendAccountEmail } from "./mail.js";

export const auth = betterAuth({
  appName: "Rewardly",
  baseURL: env.APP_ORIGIN,
  basePath: "/api/v1/auth",
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins,
  database: prismaAdapter(db, { provider: "postgresql", transaction: true }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    requireEmailVerification: true,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => sendAccountEmail(user.email, "Reset your Rewardly password", url),
    onPasswordReset: async ({ user }) => {
      await db.auditLog.create({ data: { actorId: user.id, action: "auth.password_reset", targetId: user.id } });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: false,
    expiresIn: 3600,
    sendVerificationEmail: async ({ user, url }) => sendAccountEmail(user.email, "Verify your Rewardly email", url),
  },
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24, cookieCache: { enabled: false } },
  verification: { storeIdentifier: "hashed" },
  user: {
    additionalFields: {
      status: { type: "string", defaultValue: "active", input: false },
      signupReferralCode: { type: "string", required: false, input: true },
    },
  },
  rateLimit: {
    enabled: true, storage: "database", window: 60, max: 60,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 60, max: 5 },
      "/request-password-reset": { window: 60, max: 3 },
      "/send-verification-email": { window: 60, max: 3 },
    },
  },
  advanced: {
    useSecureCookies: env.NODE_ENV === "production",
    database: { generateId: "uuid" },
    defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/" },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (user.name.trim().length < 2 || user.name.trim().length > 80) throw new APIError("BAD_REQUEST", { message: "Your name must contain 2 to 80 characters." });
          const code = typeof user.signupReferralCode === "string" ? user.signupReferralCode.trim() : "";
          if (code) {
            const inviter = code.length <= 80 ? await db.user.findUnique({ where: { referralCode: code } }) : null;
            const rules = await db.rewardSettings.findUnique({ where: { id: "default" } });
            if (!rules?.referralsEnabled || !inviter || !inviter.emailVerified || inviter.status !== "active" || inviter.email === user.email.trim().toLowerCase()) {
              throw new APIError("BAD_REQUEST", { message: "This referral code is invalid or unavailable. Check the code or remove it to register without a referral." });
            }
          }
          return { data: { ...user, signupReferralCode: code || null, name: user.name.trim(), email: user.email.trim().toLowerCase() } };
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          const user = await db.user.findUnique({ where: { id: session.userId } });
          if (!user || user.status !== "active") throw new APIError("FORBIDDEN", { message: "This account is not active. Contact support." });
          return { data: session };
        },
        after: async (session) => {
          await db.auditLog.create({ data: { actorId: session.userId, targetId: session.userId, action: "auth.signed_in" } });
        },
      },
    },
  },
});
