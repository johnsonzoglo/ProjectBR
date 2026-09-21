import "dotenv/config";
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";

const databaseName = `reward_test_${randomUUID().replaceAll("-", "")}`;
const originalUrl = new URL(process.env.DATABASE_URL!);
const adminUrl = new URL(originalUrl); adminUrl.pathname = "/postgres";
const admin = new pg.Client({ connectionString: adminUrl.toString() });
const testUrl = new URL(originalUrl); testUrl.pathname = `/${databaseName}`;
const mailPath = resolve(".local", databaseName, "mail");
process.env.DATABASE_URL = testUrl.toString();
process.env.NODE_ENV = "test";
process.env.MAIL_MODE = "file";
process.env.MAIL_OUTBOX = mailPath;
let db: typeof import("../apps/api/src/database.js").db;
let app: Awaited<ReturnType<typeof import("../apps/api/src/app.js").createApp>>;
let base: string;
const origin = process.env.APP_ORIGIN!;
const password = "A very good testing password 24!";
const email = "member@example.test";
let cookie = "";
let userId = "";

async function request(path: string, method = "GET", body?: unknown, session = cookie, requestOrigin = origin) {
  return fetch(`${base}/api/v1${path}`, { method, redirect: "manual", headers: { "Content-Type": "application/json", Origin: requestOrigin, ...(session ? { Cookie: session } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function mail(to: string, subject: string) {
  const names = (await readdir(mailPath)).sort().reverse();
  for (const name of names) {
    const item = JSON.parse(await readFile(resolve(mailPath, name), "utf8"));
    if (item.to === to && item.subject.includes(subject)) return item as { url: string; otp: string };
  }
  throw new Error("Expected account email was not delivered to the test outbox");
}
async function signIn(to = email, pass = password) {
  const result = await request("/auth/sign-in/email", "POST", { email: to, password: pass }, "");
  assert.equal(result.status, 200, await result.clone().text());
  const tokenCookie = result.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");
  assert.ok(tokenCookie); return tokenCookie;
}

before(async () => {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  const client = new pg.Client({ connectionString: testUrl.toString() }); await client.connect();
  const migrations = resolve("packages/database/prisma/migrations");
  for (const dir of (await readdir(migrations)).sort()) {
    if (!/^\d/.test(dir)) continue;
    await client.query(await readFile(resolve(migrations, dir, "migration.sql"), "utf8"));
  }
  await client.end();
  await mkdir(mailPath, { recursive: true });
  await import("../scripts/seed.js");
  ({ db } = await import("../apps/api/src/database.js"));
  const { createApp } = await import("../apps/api/src/app.js");
  app = await createApp(); await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
});
beforeEach(async () => { await db.rateLimit.deleteMany(); });
after(async () => {
  if (app) await app.close();
  if (db) await db.$disconnect();
  if (/^reward_test_[a-f0-9]{32}$/.test(databaseName)) {
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    const target = resolve(".local", databaseName);
    assert.ok(target.startsWith(resolve(".local") + "/") || target.startsWith(resolve(".local") + "\\"));
    await rm(target, { recursive: true, force: true });
  }
  await admin.end();
});

test("anonymous account access and cross-origin writes are denied", async () => {
  assert.equal((await request("/me", "GET", undefined, "")).status, 401);
  assert.equal((await request("/auth/sign-up/email", "POST", { email, name: "Member", password }, "", "https://untrusted.example")).status, 403);
});
test("registration hashes passwords, assigns only User, and allows login before verification", async () => {
  const result = await request("/auth/sign-up/email", "POST", { email: "MEMBER@example.test", name: "Test Member", password, status: "active", role: "super_admin", callbackURL: `${origin}/login` }, "");
  assert.equal(result.status, 200, await result.clone().text());
  const user = await db.user.findUniqueOrThrow({ where: { email }, include: { accounts: true, roles: { include: { role: true } } } });
  userId = user.id; assert.equal(user.emailVerified, false);
  assert.deepEqual(user.roles.map(r => r.role.key), ["user"]);
  assert.notEqual(user.accounts[0].password, password); assert.ok(user.accounts[0].password!.length > 64);
  const beforeLoginEmails = (await readdir(mailPath)).length;
  const unverifiedLogin = await request("/auth/sign-in/email", "POST", { email, password }, "");
  assert.equal(unverifiedLogin.status, 200, await unverifiedLogin.clone().text());
  assert.equal((await readdir(mailPath)).length, beforeLoginEmails, "Sign-in does not require or send email verification");
  const beforeResendEmails = (await readdir(mailPath)).length;
  assert.equal((await request("/auth/send-verification-email", "POST", { email, callbackURL: `${origin}/login?verified=1` }, "")).status, 200);
  assert.equal((await readdir(mailPath)).length, beforeResendEmails + 1);
  assert.match((await mail(email, "Verify")).otp, /^[0-9]{6}$/);
});
test("verification enables login and session cookies are HttpOnly", async () => {
  const otp = (await mail(email, "Verify")).otp;
  const wrong = otp === "000000" ? "111111" : "000000";
  assert.equal((await request("/auth/email-otp/verify-email", "POST", { email, otp: wrong }, "")).status, 400);
  const response = await request("/auth/email-otp/verify-email", "POST", { email, otp }, "");
  assert.equal(response.status, 200, await response.text());
  assert.equal((await request("/auth/email-otp/verify-email", "POST", { email, otp }, "")).status, 400);
  const login = await request("/auth/sign-in/email", "POST", { email, password }, "");
  assert.equal(login.status, 200, await login.clone().text());
  assert.match(login.headers.get("set-cookie") || "", /HttpOnly/i);
  assert.match(login.headers.get("set-cookie") || "", /SameSite=Lax/i);
  cookie = login.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");
  const me = await request("/me"); assert.equal(me.status, 200);
  const profile = await me.json(); assert.equal(profile.user.email, email); assert.equal(profile.user.emailVerified, true);
});
test("duplicate registration cannot create a second account", async () => {
  const response = await request("/auth/sign-up/email", "POST", { email, name: "Duplicate", password }, "");
  assert.equal(response.status, 200); assert.equal(await db.user.count({ where: { email } }), 1);
});
test("profile validation blocks privilege changes and persists allowed edits", async () => {
  assert.equal((await request("/me", "PATCH", { name: "Changed", status: "suspended", roles: ["super_admin"] })).status, 400);
  assert.equal((await request("/me", "PATCH", { name: "Updated Member" })).status, 200);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: userId } })).name, "Updated Member");
});
test("users cannot read admin data, audit logs, or alter account status", async () => {
  assert.equal((await request("/admin/users")).status, 403);
  assert.equal((await request("/admin/audit-logs")).status, 403);
  assert.equal((await request(`/admin/users/${userId}/status`, "POST", { status: "suspended", reason: "Should be forbidden" })).status, 403);
});
test("session lists do not expose tokens and revocation invalidates a session", async () => {
  const second = await signIn();
  const sessions = await (await request("/me/sessions", "GET", undefined, second)).json();
  assert.ok(sessions.length >= 2); assert.equal(sessions[0].token, undefined);
  const current = sessions.find((s: { current: boolean }) => s.current);
  assert.equal((await request(`/me/sessions/${current.id}`, "DELETE", undefined, second)).status, 200);
  assert.equal((await request("/me", "GET", undefined, second)).status, 401);
});
test("password reset token is single use and revokes prior sessions", async () => {
  assert.equal((await request("/auth/request-password-reset", "POST", { email, redirectTo: `${origin}/reset-password` }, "")).status, 200);
  const reset = new URL((await mail(email, "Reset")).url);
  const redirect = await fetch(`${base}${reset.pathname}${reset.search}`, { redirect: "manual" });
  const token = new URL(redirect.headers.get("location")!).searchParams.get("token"); assert.ok(token);
  const nextPassword = password + " changed";
  assert.equal((await request("/auth/reset-password", "POST", { token, newPassword: nextPassword }, "")).status, 200);
  assert.equal((await request("/me")).status, 401);
  assert.equal((await request("/auth/reset-password", "POST", { token, newPassword: password }, "")).status, 400);
  assert.equal((await request("/auth/sign-in/email", "POST", { email, password }, "")).status, 401);
  cookie = await signIn(email, nextPassword);
});
test("admin suspension revokes sessions and records a reason; self-suspension is blocked", async () => {
  const staffEmail = "staff@example.test";
  await request("/auth/sign-up/email", "POST", { email: staffEmail, name: "Staff Account", password }, "");
  const staff = await db.user.update({ where: { email: staffEmail }, data: { emailVerified: true } });
  const role = await db.role.findUniqueOrThrow({ where: { key: "admin" } });
  await db.userRole.create({ data: { userId: staff.id, roleId: role.id } });
  const staffCookie = await signIn(staffEmail);
  assert.equal((await request("/admin/users", "GET", undefined, staffCookie)).status, 200);
  assert.equal((await request(`/admin/users/${staff.id}/status`, "POST", { status: "suspended", reason: "Cannot suspend myself" }, staffCookie)).status, 400);
  assert.equal((await request(`/admin/users/${userId}/status`, "POST", { status: "suspended", reason: "Security review of this account" }, staffCookie)).status, 201);
  assert.equal((await request("/me")).status, 401);
  assert.equal((await request("/auth/sign-in/email", "POST", { email, password: password + " changed" }, "")).status, 403);
  assert.ok(await db.auditLog.findFirst({ where: { targetId: userId, reason: "Security review of this account" } }));
  assert.equal((await request(`/admin/users/${userId}/status`, "POST", { status: "active", reason: "Security review is now complete" }, staffCookie)).status, 201);
  cookie = await signIn(email, password + " changed");
});
test("audit entries cannot be rewritten", async () => {
  const event = await db.auditLog.findFirstOrThrow();
  await assert.rejects(db.auditLog.update({ where: { id: event.id }, data: { action: "tampered" } }));
});
test("logout invalidates the current session", async () => {
  assert.equal((await request("/auth/sign-out", "POST", {})).status, 200);
  assert.equal((await request("/me")).status, 401);
});
test("password recovery is rate limited", async () => {
  let limited = false;
  for (let i = 0; i < 5; i++) {
    const response = await request("/auth/request-password-reset", "POST", { email: "unknown@example.test", redirectTo: `${origin}/reset-password` }, "");
    if (response.status === 429) limited = true;
  }
  assert.ok(limited, "Expected rate limiting after repeated recovery requests");
});

test("email codes expire, are hashed, and lock after repeated wrong guesses", async () => {
  const to = "otp-security@example.test";
  await request("/auth/sign-up/email", "POST", { email: to, name: "OTP Security", password }, "");
  assert.equal((await request("/auth/send-verification-email", "POST", { email: to }, "")).status, 200);
  const otp = (await mail(to, "Verify")).otp;
  const rows = await db.verification.findMany();
  assert.ok(rows.length);
  assert.ok(rows.every(row => !row.value.startsWith(otp + ":")));
  const wrong = otp === "000000" ? "111111" : "000000";
  for (let attempt = 0; attempt < 5; attempt++) {
    await db.rateLimit.deleteMany();
    assert.notEqual((await request("/auth/email-otp/verify-email", "POST", { email: to, otp: wrong }, "")).status, 200);
  }
  await db.rateLimit.deleteMany();
  assert.notEqual((await request("/auth/email-otp/verify-email", "POST", { email: to, otp }, "")).status, 200);
  await request("/auth/send-verification-email", "POST", { email: to }, "");
  const fresh = (await mail(to, "Verify")).otp;
  await db.verification.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
  assert.notEqual((await request("/auth/email-otp/verify-email", "POST", { email: to, otp: fresh }, "")).status, 200);
  assert.equal((await db.user.findUniqueOrThrow({ where: { email: to } })).emailVerified, false);
});
