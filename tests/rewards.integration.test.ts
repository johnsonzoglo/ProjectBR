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
process.env.DATABASE_URL = testUrl.toString(); process.env.NODE_ENV = "test"; process.env.MAIL_MODE = "file"; process.env.MAIL_OUTBOX = mailPath;
let db: typeof import("../apps/api/src/database.js").db;
let app: Awaited<ReturnType<typeof import("../apps/api/src/app.js").createApp>>;
let base: string;
const origin = process.env.APP_ORIGIN!;
const password = "Rewards test account password 84!";
let user: { id: string; email: string; cookie: string; referralCode: string };
let staff: typeof user; let friend: typeof user;
let codeTask: string; let manualTask: string; let manualRun: string;

async function request(path: string, method = "GET", body?: unknown, cookie = user?.cookie || "") {
  return fetch(`${base}/api/v1${path}`, { method, redirect: "manual", headers: { "Content-Type": "application/json", Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function json<T = Record<string, unknown>>(response: Response, status = 200): Promise<T> {
  assert.equal(response.status, status, await response.clone().text()); return response.json();
}
async function account(email: string, referral?: string) {
  await json(await request("/auth/sign-up/email", "POST", { name: email.split("@")[0], email, password, ...(referral ? { signupReferralCode: referral } : {}) }, ""));
  let url = "";
  for (const name of (await readdir(mailPath)).sort().reverse()) {
    const item = JSON.parse(await readFile(resolve(mailPath, name), "utf8"));
    if (item.to === email && item.subject.includes("Verify")) { url = item.url; break; }
  }
  assert.ok(url, "Verification email missing");
  const parsed = new URL(url);
  const verify = await fetch(`${base}${parsed.pathname}${parsed.search}`, { redirect: "manual" });
  assert.ok([200, 302].includes(verify.status));
  const login = await request("/auth/sign-in/email", "POST", { email, password }, "");
  assert.equal(login.status, 200, await login.clone().text());
  const cookie = login.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");
  const row = await db.user.findUniqueOrThrow({ where: { email } });
  return { id: row.id, email, cookie, referralCode: row.referralCode };
}
const taskBody = (verification = "code") => ({ title: `Approved ${verification} task`, description: "Complete this locally approved task.", instructions: "Submit the requested verification to receive points.", category: "Feedback", rewardPoints: 1500, verification, destinationUrl: null, active: true, startsAt: new Date(Date.now() - 60000).toISOString(), endsAt: null, dailyLimit: 100, totalLimit: 1000 });
async function task(verification = "code", overrides = {}) {
  return json<{ id: string }>(await request("/admin/rewards/tasks", "POST", { ...taskBody(verification), ...overrides }, staff.cookie), 201);
}
async function code(id: string) { return (await json<{ code: string }>(await request(`/admin/rewards/tasks/${id}/codes`, "POST", {}, staff.cookie), 201)).code; }
async function complete(id: string, cookie = user.cookie) {
  await json(await request(`/tasks/${id}/start`, "POST", {}, cookie), 201);
  await json(await request(`/tasks/${id}/submit`, "POST", { code: await code(id) }, cookie), 201);
  return json<{ credited: boolean }>(await request(`/tasks/${id}/claim`, "POST", {}, cookie), 201);
}
async function rules(overrides = {}) {
  const current = await db.rewardSettings.findUniqueOrThrow({ where: { id: "default" } });
  const values = { pointsPerUsd: current.pointsPerUsd, minWithdrawalCents: current.minWithdrawalCents, maxWithdrawalCents: current.maxWithdrawalCents, referralRewardPoints: current.referralRewardPoints, referralRequiredTasks: current.referralRequiredTasks, referralsEnabled: current.referralsEnabled };
  return json(await request("/admin/rewards/settings", "PATCH", { ...values, ...overrides, reason: "Integration test reward rules" }, staff.cookie));
}

before(async () => {
  await admin.connect(); await admin.query(`CREATE DATABASE "${databaseName}"`);
  const client = new pg.Client({ connectionString: testUrl.toString() }); await client.connect();
  const migrations = resolve("packages/database/prisma/migrations");
  for (const dir of (await readdir(migrations)).sort()) if (/^\d/.test(dir)) await client.query(await readFile(resolve(migrations, dir, "migration.sql"), "utf8"));
  await client.end(); await mkdir(mailPath, { recursive: true }); await import("../scripts/seed.js");
  ({ db } = await import("../apps/api/src/database.js"));
  const { createApp } = await import("../apps/api/src/app.js"); app = await createApp(); await app.listen(0, "127.0.0.1"); base = await app.getUrl();
  user = await account("rewards-user@example.test"); staff = await account("rewards-admin@example.test");
  const role = await db.role.findUniqueOrThrow({ where: { key: "admin" } }); await db.userRole.create({ data: { userId: staff.id, roleId: role.id } });
});
beforeEach(async () => { await db.rateLimit.deleteMany(); });
after(async () => {
  if (app) await app.close(); if (db) await db.$disconnect();
  if (/^reward_test_[a-f0-9]{32}$/.test(databaseName)) {
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    const target = resolve(".local", databaseName); assert.ok(target.startsWith(resolve(".local") + "\\") || target.startsWith(resolve(".local") + "/"));
    await rm(target, { recursive: true, force: true });
  }
  await admin.end();
});

test("reward routes require authentication and admin permission", async () => {
  for (const path of ["/tasks", "/wallet", "/wallet/transactions", "/wallet/withdrawals", "/referrals"]) assert.equal((await request(path, "GET", undefined, "")).status, 401);
  assert.equal((await request("/admin/rewards")).status, 403);
  assert.equal((await request("/admin/rewards/tasks", "POST", taskBody())).status, 403);
  assert.equal((await request("/admin/rewards/settings", "PATCH", {})).status, 403);
});
test("tasks start once, reject unverified claims, and do not expose codes", async () => {
  codeTask = (await task()).id;
  const cards = await json<Array<{ id: string; run: unknown; codes?: unknown }>>(await request("/tasks"));
  assert.equal(cards.find(t => t.id === codeTask)?.run, null); assert.equal(cards[0].codes, undefined);
  const starts = await Promise.all([request(`/tasks/${codeTask}/start`, "POST", {}), request(`/tasks/${codeTask}/start`, "POST", {})]);
  const first = await json<{ id: string }>(starts[0], 201); const second = await json<{ id: string }>(starts[1], 201); assert.equal(first.id, second.id);
  assert.equal((await request(`/tasks/${codeTask}/claim`, "POST", {})).status, 400);
  assert.equal((await request(`/tasks/${codeTask}/submit`, "POST", { code: "invalid" })).status, 400);
  assert.equal((await db.wallet.findUnique({ where: { userId: user.id } }))?.points || 0, 0);
});
test("referral registration is linked atomically with fixed qualification terms", async () => {
  await rules({ referralRequiredTasks: 2, referralRewardPoints: 700 });
  friend = await account("rewards-friend@example.test", user.referralCode);
  const row = await db.referral.findUniqueOrThrow({ where: { inviteeId: friend.id } });
  assert.equal(row.inviterId, user.id); assert.equal(row.rewardPoints, 700); assert.equal(row.requiredTasks, 2); assert.equal(row.qualifiedAt, null);
  await rules({ referralRequiredTasks: 1, referralRewardPoints: 900 });
  const unchanged = await db.referral.findUniqueOrThrow({ where: { inviteeId: friend.id } }); assert.equal(unchanged.rewardPoints, 700);
  const summary = await json<{ total: number; qualified: number; earningsPoints: number; link: string }>(await request("/referrals"));
  assert.equal(summary.total, 1); assert.equal(summary.qualified, 0); assert.equal(summary.earningsPoints, 0); assert.equal(new URL(summary.link).searchParams.get("ref"), user.referralCode);
});
test("unique verification codes cannot be reused and concurrent claims credit once", async () => {
  const completionCode = await code(codeTask);
  const stored = await db.taskCode.findFirstOrThrow({ where: { taskId: codeTask } }); assert.notEqual(stored.hash, completionCode);
  const approved = await json<{ status: string }>(await request(`/tasks/${codeTask}/submit`, "POST", { code: completionCode }), 201); assert.equal(approved.status, "approved");
  const claims = await Promise.all([request(`/tasks/${codeTask}/claim`, "POST", {}), request(`/tasks/${codeTask}/claim`, "POST", {})]);
  const results = await Promise.all(claims.map(c => json<{ credited: boolean }>(c, 201))); assert.equal(results.filter(r => r.credited).length, 1);
  assert.equal((await db.wallet.findUniqueOrThrow({ where: { userId: user.id } })).points, 1500);
  assert.equal(await db.ledgerEntry.count({ where: { userId: user.id, kind: "task_credit" } }), 1);
  await request(`/tasks/${codeTask}/start`, "POST", {}, friend.cookie);
  assert.equal((await request(`/tasks/${codeTask}/submit`, "POST", { code: completionCode }, friend.cookie)).status, 400);
  await complete(codeTask, friend.cookie);
  assert.equal((await db.referral.findUniqueOrThrow({ where: { inviteeId: friend.id } })).qualifiedAt, null);
});
test("manual proof can be corrected, approved by staff, and claimed with its original reward", async () => {
  manualTask = (await task("manual", { rewardPoints: 2000 })).id;
  manualRun = (await json<{ id: string }>(await request(`/tasks/${manualTask}/start`, "POST", {}), 201)).id;
  assert.equal((await request(`/tasks/${manualTask}/submit`, "POST", { proof: "short" })).status, 400);
  await json(await request(`/tasks/${manualTask}/submit`, "POST", { proof: "My first feedback submission needs improvement." }), 201);
  assert.equal((await request(`/tasks/${manualTask}/claim`, "POST", {})).status, 400);
  assert.equal((await request(`/admin/rewards/reviews/${manualRun}`, "POST", { decision: "approve", reason: "Trying to approve own work" })).status, 403);
  await json(await request(`/admin/rewards/reviews/${manualRun}`, "POST", { decision: "reject", reason: "Please include the requested detail." }, staff.cookie), 201);
  const rejected = await json<{ run: { status: string; reviewReason: string } }>(await request(`/tasks/${manualTask}`)); assert.equal(rejected.run.status, "in_progress"); assert.match(rejected.run.reviewReason, /detail/);
  await json(await request(`/tasks/${manualTask}/submit`, "POST", { proof: "Updated feedback with all requested details." }), 201);
  await json(await request(`/admin/rewards/tasks/${manualTask}`, "PATCH", { ...taskBody("manual"), rewardPoints: 3000 }, staff.cookie));
  await json(await request(`/admin/rewards/reviews/${manualRun}`, "POST", { decision: "approve", reason: "Proof meets every instruction." }, staff.cookie), 201);
  await json(await request(`/tasks/${manualTask}/claim`, "POST", {}), 201);
  assert.equal((await db.wallet.findUniqueOrThrow({ where: { userId: user.id } })).points, 3500);
});
test("qualification credits only after required claimed tasks, once per friend", async () => {
  const secondTask = (await task()).id; await complete(secondTask, friend.cookie);
  const r = await db.referral.findUniqueOrThrow({ where: { inviteeId: friend.id } }); assert.ok(r.qualifiedAt);
  assert.equal((await db.wallet.findUniqueOrThrow({ where: { userId: user.id } })).points, 4200);
  await request(`/tasks/${secondTask}/claim`, "POST", {}, friend.cookie);
  const summary = await json<{ qualified: number; earningsPoints: number; items: Array<{ email?: string }> }>(await request("/referrals"));
  assert.equal(summary.qualified, 1); assert.equal(summary.earningsPoints, 700); assert.equal(summary.items[0].email, undefined);
  assert.equal(await db.ledgerEntry.count({ where: { reference: `referral:${r.id}` } }), 1);
});
test("invalid, self, duplicate, and retrospective referrals cannot create rewards", async () => {
  assert.equal((await request("/auth/sign-up/email", "POST", { name: "Invalid", email: "invalid-ref@example.test", password, signupReferralCode: "not-a-code" }, "")).status, 400);
  await request("/auth/sign-up/email", "POST", { name: "Duplicate", email: user.email, password, signupReferralCode: user.referralCode }, "");
  assert.equal(await db.referral.count({ where: { inviteeId: user.id } }), 0);
  await request("/auth/sign-up/email", "POST", { name: "Duplicate Friend", email: friend.email, password, signupReferralCode: staff.referralCode }, "");
  assert.equal(await db.referral.count({ where: { inviteeId: friend.id } }), 1);
  assert.equal((await request("/me", "PATCH", { signupReferralCode: staff.referralCode })).status, 400);
  await assert.rejects(db.user.update({ where: { id: friend.id }, data: { signupReferralCode: staff.referralCode } }));
  await rules({ referralsEnabled: false });
  assert.equal((await request("/auth/sign-up/email", "POST", { name: "Paused", email: "paused-ref@example.test", password, signupReferralCode: user.referralCode }, "")).status, 400);
  await rules({ referralsEnabled: true });
});
test("schedule and capacity controls reject unavailable starts without corrupting reservations", async () => {
  const limited = (await task("code", { dailyLimit: 1, totalLimit: 1 })).id;
  await request(`/tasks/${limited}/start`, "POST", {});
  assert.equal((await request(`/tasks/${limited}/start`, "POST", {}, friend.cookie)).status, 409);
  const future = (await task("code", { startsAt: new Date(Date.now() + 3600000).toISOString() })).id;
  assert.equal((await request(`/tasks/${future}/start`, "POST", {})).status, 400);
  const paused = (await task("code", { active: false })).id; assert.equal((await request(`/tasks/${paused}/start`, "POST", {})).status, 400);
  assert.equal((await request("/admin/rewards/tasks", "POST", { ...taskBody(), destinationUrl: "javascript:alert(1)" }, staff.cookie)).status, 400);
});
test("wallet exposes actual balances and refuses below-minimum, oversized, and ineligible withdrawals", async () => {
  const wallet = await json<{ points: number; usdCents: number; withdrawableCents: number }>(await request("/wallet"));
  assert.equal(wallet.points, 4200); assert.equal(wallet.usdCents, 420); assert.equal(wallet.withdrawableCents, 420);
  const payload = { amountCents: 99, provider: "paypal", destination: "payout@example.test", requestKey: randomUUID() };
  assert.equal((await request("/wallet/withdrawals", "POST", payload)).status, 400);
  assert.equal((await request("/wallet/withdrawals", "POST", { ...payload, amountCents: 500, requestKey: randomUUID() })).status, 400);
  assert.equal((await request("/wallet/withdrawals", "POST", { ...payload, amountCents: 100, destination: "invalid" })).status, 400);
  await json(await request("/admin/rewards/eligibility", "PATCH", { email: user.email, eligible: false, reason: "Hold while eligibility is reviewed" }, staff.cookie));
  assert.equal((await json<{ withdrawableCents: number }>(await request("/wallet"))).withdrawableCents, 0);
  assert.equal((await request("/wallet/withdrawals", "POST", { ...payload, amountCents: 100 })).status, 400);
  await request("/admin/rewards/eligibility", "PATCH", { email: user.email, eligible: true, reason: "Eligibility has been confirmed" }, staff.cookie);
});
test("withdrawal retries are idempotent and concurrent spending cannot exceed available points", async () => {
  const payload = { amountCents: 300, provider: "paypal", destination: "payout@example.test", requestKey: randomUUID() };
  const responses = await Promise.all([request("/wallet/withdrawals", "POST", payload), request("/wallet/withdrawals", "POST", payload)]);
  const first = await json<{ id: string }>(responses[0], 201); const second = await json<{ id: string }>(responses[1], 201); assert.equal(first.id, second.id);
  assert.equal((await request("/wallet/withdrawals", "POST", { ...payload, amountCents: 100 })).status, 409);
  const races = await Promise.all([request("/wallet/withdrawals", "POST", { ...payload, amountCents: 100, requestKey: randomUUID() }), request("/wallet/withdrawals", "POST", { ...payload, amountCents: 100, requestKey: randomUUID() })]);
  assert.deepEqual(races.map(r => r.status).sort(), [201, 400]);
  const balance = await json<{ points: number; reservedPoints: number; withdrawableCents: number }>(await request("/wallet")); assert.equal(balance.points, 4200); assert.equal(balance.reservedPoints, 4000); assert.equal(balance.withdrawableCents, 20);
  for (const row of await db.withdrawal.findMany({ where: { userId: user.id } })) {
    await json(await request(`/admin/rewards/withdrawals/${row.id}`, "POST", { decision: "reject", reason: "Rejected for integration test release" }, staff.cookie), 201);
    assert.equal((await request(`/admin/rewards/withdrawals/${row.id}`, "POST", { decision: "reject", reason: "Duplicate review must not release twice" }, staff.cookie)).status, 400);
  }
  assert.equal((await db.wallet.findUniqueOrThrow({ where: { userId: user.id } })).reservedPoints, 0);
});
test("approval requires eligibility; settlement preserves the quoted rate and immutable ledger", async () => {
  const withdrawal = await json<{ id: string; points: number }>(await request("/wallet/withdrawals", "POST", { amountCents: 100, provider: "bank", destination: "Example Account, Demo Bank, IBAN TEST12345", requestKey: randomUUID() }), 201);
  await rules({ pointsPerUsd: 2000 });
  assert.equal(withdrawal.points, 1000);
  assert.equal((await request(`/admin/rewards/withdrawals/${withdrawal.id}`, "POST", { decision: "paid", reason: "Cannot skip approval", paymentReference: "TEST-ONLY-001" }, staff.cookie)).status, 400);
  await request("/admin/rewards/eligibility", "PATCH", { email: user.email, eligible: false, reason: "Test eligibility recheck before approval" }, staff.cookie);
  assert.equal((await request(`/admin/rewards/withdrawals/${withdrawal.id}`, "POST", { decision: "approve", reason: "Review attempted during hold" }, staff.cookie)).status, 400);
  await request("/admin/rewards/eligibility", "PATCH", { email: user.email, eligible: true, reason: "Test eligibility is restored" }, staff.cookie);
  await json(await request(`/admin/rewards/withdrawals/${withdrawal.id}`, "POST", { decision: "approve", reason: "Approved after eligibility check" }, staff.cookie), 201);
  await json(await request(`/admin/rewards/withdrawals/${withdrawal.id}`, "POST", { decision: "paid", reason: "Simulated payment in isolated test database", paymentReference: "TEST-ONLY-001" }, staff.cookie), 201);
  const balance = await db.wallet.findUniqueOrThrow({ where: { userId: user.id } }); assert.equal(balance.points, 3200); assert.equal(balance.reservedPoints, 0);
  const totals = await db.ledgerEntry.aggregate({ where: { userId: user.id }, _sum: { points: true, reservedPoints: true } }); assert.equal(totals._sum.points, balance.points); assert.equal(totals._sum.reservedPoints, balance.reservedPoints);
  const entry = await db.ledgerEntry.findFirstOrThrow(); await assert.rejects(db.ledgerEntry.update({ where: { id: entry.id }, data: { points: 9999 } }));
  await rules({ pointsPerUsd: 1000 });
});
test("rejected verification attempts are rate limited and private histories remain scoped", async () => {
  const id = (await task()).id; await request(`/tasks/${id}/start`, "POST", {});
  for (let i = 0; i < 10; i++) assert.equal((await request(`/tasks/${id}/submit`, "POST", { code: "wrong" })).status, 400);
  assert.equal((await request(`/tasks/${id}/submit`, "POST", { code: "wrong" })).status, 429);
  const history = await json<{ items: Array<{ userId: string }> }>(await request("/wallet/transactions")); assert.ok(history.items.every(row => row.userId === user.id));
  const friendHistory = await json<{ items: Array<{ userId: string }> }>(await request("/wallet/withdrawals", "GET", undefined, friend.cookie)); assert.equal(friendHistory.items.length, 0);
});

test("daily completion limits apply even to earlier starts and approved claims stay recoverable", async () => {
  const id = (await task("code", { dailyLimit: 1, totalLimit: 2 })).id;
  const earlier = await json<{ id: string }>(await request(`/tasks/${id}/start`, "POST", {}, friend.cookie), 201);
  await db.taskRun.update({ where: { id: earlier.id }, data: { startedAt: new Date(Date.now() - 86400000) } });
  await request(`/tasks/${id}/start`, "POST", {});
  await request(`/tasks/${id}/submit`, "POST", { code: await code(id) });
  await request(`/tasks/${id}/submit`, "POST", { code: await code(id) }, friend.cookie);
  await json(await request(`/tasks/${id}/claim`, "POST", {}), 201);
  assert.equal((await request(`/tasks/${id}/claim`, "POST", {}, friend.cookie)).status, 409);
  assert.equal((await db.taskRun.findUniqueOrThrow({ where: { id: earlier.id } })).status, "approved");
  assert.equal((await request(`/admin/rewards/tasks/${id}`, "PATCH", { ...taskBody(), totalLimit: 1 }, staff.cookie)).status, 400);
  await db.taskRun.update({ where: { userId_taskId: { userId: user.id, taskId: id } }, data: { completedAt: new Date(Date.now() - 86400000) } });
  await json(await request(`/tasks/${id}/claim`, "POST", {}, friend.cookie), 201);
});

test("staff cannot participate in tasks, change their eligibility, or review their withdrawal", async () => {
  const manual = (await task("manual")).id;
  assert.equal((await request("/tasks", "GET", undefined, staff.cookie)).status, 403);
  assert.equal((await request(`/tasks/${manual}/start`, "POST", {}, staff.cookie)).status, 403);
  assert.equal((await request("/admin/rewards/eligibility", "PATCH", { email: staff.email, eligible: true, reason: "Cannot change own withdrawal access" }, staff.cookie)).status, 400);
  await db.$transaction([db.wallet.upsert({ where: { userId: staff.id }, create: { userId: staff.id, points: 1500 }, update: { points: { increment: 1500 } } }), db.ledgerEntry.create({ data: { userId: staff.id, kind: "test_credit", points: 1500, reference: `staff-test:${randomUUID()}`, description: "Isolated self-review test balance" } })]);
  const withdrawal = await json<{ id: string }>(await request("/wallet/withdrawals", "POST", { amountCents: 100, provider: "paypal", destination: "staff@example.test", requestKey: randomUUID() }, staff.cookie), 201);
  assert.equal((await request(`/admin/rewards/withdrawals/${withdrawal.id}`, "POST", { decision: "approve", reason: "Cannot review own withdrawal request" }, staff.cookie)).status, 400);
});

test("admin control center searches complete user data and records safe user changes", async () => {
  const controlled = await account("controlled-user@example.test");
  assert.equal((await request("/admin/overview", "GET", undefined, controlled.cookie)).status, 403);
  const overview = await json<{ users: number; balances: { points: number | null } }>(await request("/admin/overview", "GET", undefined, staff.cookie));
  assert.ok(overview.users >= 4);
  const directory = await json<{ items: Array<{ id: string; email: string; wallet: unknown }> }>(await request("/admin/users?search=controlled-user&status=active", "GET", undefined, staff.cookie));
  assert.equal(directory.items.length, 1); assert.equal(directory.items[0].id, controlled.id); assert.ok("wallet" in directory.items[0]);
  assert.equal((await request(`/admin/users/${controlled.id}/profile`, "PATCH", { name: "No access", email: "controlled-user@example.test", reason: "Unauthorized profile edit" }, controlled.cookie)).status, 403);
  await json(await request(`/admin/users/${controlled.id}/profile`, "PATCH", { name: "Controlled Member", email: controlled.email, reason: "Correct the member display name" }, staff.cookie));
  const key = randomUUID(); const adjustment = { source: "points", delta: 1200, reason: "Manual support credit approved for testing", requestKey: key };
  const first = await json<{ applied: boolean }>(await request(`/admin/users/${controlled.id}/adjustment`, "POST", adjustment, staff.cookie), 201);
  const retry = await json<{ applied: boolean }>(await request(`/admin/users/${controlled.id}/adjustment`, "POST", adjustment, staff.cookie), 201);
  assert.equal(first.applied, true); assert.equal(retry.applied, false);
  assert.equal((await request(`/admin/users/${controlled.id}/adjustment`, "POST", { ...adjustment, delta: 999 }, staff.cookie)).status, 409);
  await json(await request(`/admin/users/${controlled.id}/adjustment`, "POST", { source: "deposit", delta: 250, reason: "Manual cash adjustment approved for testing", requestKey: randomUUID() }, staff.cookie), 201);
  const detail = await json<{ name: string; wallet: { points: number; depositCents: number } }>(await request(`/admin/users/${controlled.id}`, "GET", undefined, staff.cookie));
  assert.equal(detail.name, "Controlled Member"); assert.equal(detail.wallet.points, 1200); assert.equal(detail.wallet.depositCents, 250);
  const activity = await json<{ total: number }>(await request(`/admin/users/${controlled.id}/activity?kind=transactions`, "GET", undefined, staff.cookie)); assert.equal(activity.total, 2);
  const audit = await json<{ items: Array<{ action: string }> }>(await request(`/admin/audit?search=user.balance_adjusted`, "GET", undefined, staff.cookie)); assert.ok(audit.items.some(row => row.action === "user.balance_adjusted"));
  assert.equal((await request(`/admin/users/${staff.id}/adjustment`, "POST", { ...adjustment, requestKey: randomUUID() }, staff.cookie)).status, 400);
});

const paymentMethod = { label: "PayPal test receiver", enabled: true, recipient: "isolated-payments@example.test", instructions: "TEST DATABASE ONLY: submit a simulated receipt, never send funds.", minimumCents: 100, maximumCents: 10000, reason: "Configure isolated payment tests" };

let depositId: string;
test("payment setup enforces permissions, configured recipients, limits, and idempotent requests", async () => {
  assert.equal((await request("/payments/methods", "GET", undefined, "")).status, 401);
  assert.deepEqual(await json(await request("/payments/methods")), []);
  assert.equal((await request("/admin/payments")).status, 403);
  assert.equal((await request("/admin/payments/methods/paypal", "PATCH", paymentMethod)).status, 403);
  assert.equal((await request("/admin/payments/methods/paypal", "PATCH", { ...paymentMethod, recipient: "" }, staff.cookie)).status, 400);
  const payload = { provider: "paypal", amountCents: 1000, requestKey: randomUUID() };
  assert.equal((await request("/payments/deposits", "POST", payload)).status, 400);
  await json(await request("/admin/payments/methods/paypal", "PATCH", paymentMethod, staff.cookie));
  assert.equal((await request("/payments/deposits", "POST", { ...payload, amountCents: 99 })).status, 400);
  assert.equal((await request("/payments/deposits", "POST", { ...payload, amountCents: 10001 })).status, 400);
  const responses = await Promise.all([request("/payments/deposits", "POST", payload), request("/payments/deposits", "POST", payload)]);
  const first = await json<{ id: string; status: string }>(responses[0], 201); const second = await json<{ id: string }>(responses[1], 201);
  depositId = first.id; assert.equal(first.id, second.id); assert.equal(first.status, "awaiting_payment");
  assert.equal((await request("/payments/deposits", "POST", { ...payload, amountCents: 500 })).status, 409);
  assert.equal((await json<{ depositCents: number }>(await request("/wallet"))).depositCents, 0);
  await json(await request("/admin/payments/methods/paypal", "PATCH", { ...paymentMethod, recipient: "new-isolated-receiver@example.test" }, staff.cookie));
  assert.equal((await db.deposit.findUniqueOrThrow({ where: { id: depositId } })).recipient, paymentMethod.recipient);
});

test("deposit proof is private, unique across accounts, recoverable after rejection, and credited exactly once", async () => {
  const proof = { paymentReference: "test-receipt-001", proof: "Simulated receipt in an isolated test database." };
  const balanceBefore = await db.wallet.findUniqueOrThrow({ where: { userId: user.id } });
  assert.equal((await request(`/payments/deposits/${depositId}/proof`, "POST", proof, friend.cookie)).status, 404);
  await json(await request(`/payments/deposits/${depositId}/proof`, "POST", proof), 201);
  assert.equal((await request(`/payments/deposits/${depositId}/cancel`, "POST", {})).status, 400);
  assert.equal((await db.wallet.findUniqueOrThrow({ where: { userId: user.id } })).depositCents, 0);
  const other = await json<{ id: string }>(await request("/payments/deposits", "POST", { provider: "paypal", amountCents: 1000, requestKey: randomUUID() }, friend.cookie), 201);
  assert.equal((await request(`/payments/deposits/${other.id}/proof`, "POST", { ...proof, paymentReference: "TEST-RECEIPT-001" }, friend.cookie)).status, 409);
  const review = { decision: "approve", reason: "Independently verified simulated funds", confirmedAmountCents: 1000 };
  assert.equal((await request(`/admin/payments/deposits/${depositId}/review`, "POST", review)).status, 403);
  assert.equal((await request(`/admin/payments/deposits/${depositId}/review`, "POST", { ...review, confirmedAmountCents: 999 }, staff.cookie)).status, 400);
  assert.equal((await request(`/admin/payments/deposits/${depositId}/review`, "POST", { decision: "approve", reason: review.reason }, staff.cookie)).status, 400);
  await json(await request(`/admin/payments/deposits/${depositId}/review`, "POST", { decision: "reject", reason: "Please provide the missing receipt details." }, staff.cookie), 201);
  assert.equal((await request(`/payments/deposits/${depositId}/proof`, "POST", { ...proof, paymentReference: "OTHER-RECEIPT" })).status, 400);
  await json(await request(`/payments/deposits/${depositId}/proof`, "POST", { ...proof, proof: "Corrected original receipt with complete details." }), 201);
  const responses = await Promise.all([request(`/admin/payments/deposits/${depositId}/review`, "POST", review, staff.cookie), request(`/admin/payments/deposits/${depositId}/review`, "POST", review, staff.cookie)]);
  const results = await Promise.all(responses.map(r => json<{ credited: boolean }>(r, 201))); assert.equal(results.filter(r => r.credited).length, 1);
  const balance = await db.wallet.findUniqueOrThrow({ where: { userId: user.id } }); assert.equal(balance.depositCents, 1000); assert.equal(balance.points, balanceBefore.points);
  assert.equal(await db.ledgerEntry.count({ where: { reference: `deposit:${depositId}` } }), 1);
  const ownHistory = await json<{ items: Array<{ userId: string }> }>(await request("/payments/deposits")); assert.ok(ownHistory.items.every(d => d.userId === user.id));
  const own = await json<{ id: string }>(await request("/payments/deposits", "POST", { provider: "paypal", amountCents: 1000, requestKey: randomUUID() }, staff.cookie), 201);
  await request(`/payments/deposits/${own.id}/proof`, "POST", { ...proof, paymentReference: "STAFF-TEST-RECEIPT" }, staff.cookie);
  assert.equal((await request(`/admin/payments/deposits/${own.id}/review`, "POST", review, staff.cookie)).status, 400);
  await json(await request(`/payments/deposits/${other.id}/cancel`, "POST", {}, friend.cookie), 201);
  assert.equal((await request(`/payments/deposits/${other.id}/proof`, "POST", { ...proof, paymentReference: "CANCELLED-RECEIPT" }, friend.cookie)).status, 400);
});

test("deposit withdrawals hold and release USD without spending points, and settle with a matching ledger", async () => {
  const before = await db.wallet.findUniqueOrThrow({ where: { userId: user.id } });
  const payload = { source: "deposit", provider: "paypal", destination: "isolated-payout@example.test", amountCents: 700, requestKey: randomUUID() };
  const responses = await Promise.all([request("/wallet/withdrawals", "POST", payload), request("/wallet/withdrawals", "POST", payload)]);
  const first = await json<{ id: string; points: number }>(responses[0], 201); const second = await json<{ id: string }>(responses[1], 201); assert.equal(first.id, second.id); assert.equal(first.points, 0);
  assert.equal((await request("/wallet/withdrawals", "POST", { ...payload, source: "points" })).status, 409);
  const races = await Promise.all([request("/wallet/withdrawals", "POST", { ...payload, amountCents: 200, requestKey: randomUUID() }), request("/wallet/withdrawals", "POST", { ...payload, amountCents: 200, requestKey: randomUUID() })]);
  assert.deepEqual(races.map(r => r.status).sort(), [201, 400]);
  const held = await json<{ depositCents: number; reservedDepositCents: number; withdrawableDepositCents: number }>(await request("/wallet")); assert.equal(held.depositCents, 1000); assert.equal(held.reservedDepositCents, 900); assert.equal(held.withdrawableDepositCents, 100);
  for (const row of await db.withdrawal.findMany({ where: { userId: user.id, source: "deposit" } })) await json(await request(`/admin/rewards/withdrawals/${row.id}`, "POST", { decision: "reject", reason: "Release isolated test deposit reservation" }, staff.cookie), 201);
  assert.equal((await db.wallet.findUniqueOrThrow({ where: { userId: user.id } })).reservedDepositCents, 0);
  const paid = await json<{ id: string }>(await request("/wallet/withdrawals", "POST", { ...payload, amountCents: 400, requestKey: randomUUID() }), 201);
  await json(await request(`/admin/rewards/withdrawals/${paid.id}`, "POST", { decision: "approve", reason: "Approved isolated cash withdrawal test" }, staff.cookie), 201);
  await json(await request(`/admin/rewards/withdrawals/${paid.id}`, "POST", { decision: "paid", reason: "Simulated cash payout in test database", paymentReference: "CASH-TEST-PAYOUT" }, staff.cookie), 201);
  assert.equal((await request(`/admin/rewards/withdrawals/${paid.id}`, "POST", { decision: "paid", reason: "Attempt repeated cash payout settlement", paymentReference: "CASH-TEST-PAYOUT" }, staff.cookie)).status, 400);
  const balance = await db.wallet.findUniqueOrThrow({ where: { userId: user.id } }); assert.equal(balance.points, before.points); assert.equal(balance.depositCents, 600); assert.equal(balance.reservedDepositCents, 0);
  const totals = await db.ledgerEntry.aggregate({ where: { userId: user.id }, _sum: { depositCents: true, reservedDepositCents: true } }); assert.equal(totals._sum.depositCents, balance.depositCents); assert.equal(totals._sum.reservedDepositCents, 0);
});

test("admins configure each crypto wallet; requests snapshot coin, network, address, and exact amount", async () => {
  const before = await db.wallet.findUniqueOrThrow({ where: { userId: user.id } });
  const options = [
    { asset: "USDT", network: "TRON (TRC20)", recipient: "T" + "A".repeat(33), usdRateCents: 100, expected: "10.000000" },
    { asset: "BTC", network: "Bitcoin", recipient: "1" + "A".repeat(33), usdRateCents: 10000000, expected: "0.00010000" },
    { asset: "ETH", network: "Ethereum", recipient: "0x" + "a".repeat(40), usdRateCents: 200000, expected: "0.005000000000000000" },
  ];
  assert.equal((await request("/payments/deposits", "POST", { provider: "crypto", amountCents: 1000, requestKey: randomUUID() })).status, 400);
  assert.equal((await request("/payments/deposits", "POST", { provider: "crypto", asset: "DOGE", amountCents: 1000, requestKey: randomUUID() })).status, 400);
  let index = 0;
  for (const option of options) {
    await db.rateLimit.deleteMany();
    const key = `crypto_${option.asset.toLowerCase()}`;
    const config = { ...paymentMethod, label: option.asset, network: option.network, recipient: option.recipient, usdRateCents: option.usdRateCents };
    const payload = { provider: "crypto", asset: option.asset, amountCents: 1000, requestKey: randomUUID() };
    assert.equal((await request("/payments/deposits", "POST", payload)).status, 400);
    assert.equal((await request(`/admin/payments/methods/${key}`, "PATCH", config)).status, 403);
    assert.equal((await request(`/admin/payments/methods/${key}`, "PATCH", { ...config, recipient: "wrong-address" }, staff.cookie)).status, 400);
    assert.equal((await request(`/admin/payments/methods/${key}`, "PATCH", { ...config, network: "Wrong network" }, staff.cookie)).status, 400);
    assert.equal((await request(`/admin/payments/methods/${key}`, "PATCH", { ...config, usdRateCents: 0 }, staff.cookie)).status, 400);
    await json(await request(`/admin/payments/methods/${key}`, "PATCH", config, staff.cookie));
    const deposit = await json<{ id: string; cryptoAmount: string; asset: string; recipient: string; network: string }>(await request("/payments/deposits", "POST", payload), 201);
    assert.equal(deposit.asset, option.asset); assert.equal(deposit.cryptoAmount, option.expected); assert.equal(deposit.network, option.network); assert.equal(deposit.recipient, option.recipient);
    const changedAddress = option.recipient.replaceAll("A", "B").replaceAll("a", "b");
    await json(await request(`/admin/payments/methods/${key}`, "PATCH", { ...config, recipient: changedAddress, usdRateCents: config.usdRateCents * 2 }, staff.cookie));
    const original = await db.deposit.findUniqueOrThrow({ where: { id: deposit.id } }); assert.equal(original.recipient, option.recipient); assert.equal(original.cryptoAmount, option.expected);
    const next = await json<{ recipient: string; usdRateCents: number }>(await request("/payments/deposits", "POST", { ...payload, requestKey: randomUUID() }), 201);
    assert.equal(next.recipient, changedAddress); assert.equal(next.usdRateCents, config.usdRateCents * 2);
    assert.equal((await request("/payments/deposits", "POST", { ...payload, asset: option.asset === "USDT" ? "BTC" : "USDT" })).status, 409);
    const retry = await json<{ id: string }>(await request("/payments/deposits", "POST", payload), 201); assert.equal(retry.id, deposit.id);
    assert.equal((await request(`/payments/deposits/${deposit.id}/proof`, "POST", { paymentReference: "invalid-hash", proof: "Invalid test transaction hash" })).status, 400);
    if (index > 0) assert.equal((await request(`/payments/deposits/${deposit.id}/proof`, "POST", { paymentReference: "1".repeat(64), proof: "Duplicate hash across coins must not credit" })).status, 409);
    await json(await request(`/payments/deposits/${deposit.id}/proof`, "POST", { paymentReference: (++index).toString().repeat(64), proof: "Simulated crypto receipt in isolated database" }), 201);
    await json(await request(`/admin/payments/deposits/${deposit.id}/review`, "POST", { decision: "approve", confirmedAmountCents: 1000, reason: "Verified simulated asset, amount, network and recipient" }, staff.cookie), 201);
  }
  const totals = await db.wallet.findUniqueOrThrow({ where: { userId: user.id } }); assert.equal(totals.depositCents, before.depositCents + 3000); assert.equal(totals.points, before.points);
});

test("payment control exposes operational totals, filters, and complete withdrawal history", async () => {
  assert.equal((await request("/admin/payments/withdrawals", "GET", undefined, user.cookie)).status, 403);
  const control = await json<{ methods: Array<{ provider: string }>; metrics: { pendingDepositCount: number; openWithdrawalCount: number; userDepositCents: number; paidWithdrawalCents: number; enabledMethodCount: number } }>(await request("/admin/payments?status=all&channel=all", "GET", undefined, staff.cookie));
  assert.ok(control.methods.some(method => method.provider === "crypto_usdt"));
  assert.ok(control.metrics.userDepositCents >= 0); assert.ok(control.metrics.paidWithdrawalCents >= 0); assert.ok(control.metrics.enabledMethodCount >= 3);
  const crypto = await json<{ items: Array<{ asset: string | null }> }>(await request("/admin/payments?status=all&channel=USDT", "GET", undefined, staff.cookie)); assert.ok(crypto.items.every(item => item.asset === "USDT"));
  const withdrawals = await json<{ items: Array<{ id: string; user: { email: string } }>; total: number }>(await request(`/admin/payments/withdrawals?status=all&search=${encodeURIComponent(user.email)}`, "GET", undefined, staff.cookie));
  assert.ok(withdrawals.total > 0); assert.ok(withdrawals.items.every(item => item.user.email === user.email));
});
