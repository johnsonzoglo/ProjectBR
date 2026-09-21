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
const payoutDestination = "USDT | TRON (TRC20) | T" + "A".repeat(33);
const receiptImage = "data:image/png;base64,iVBORw0KGgo=";
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
  await json(await request("/auth/send-verification-email", "POST", { email }, ""));
  let url = "";
  for (const name of (await readdir(mailPath)).sort().reverse()) {
    const item = JSON.parse(await readFile(resolve(mailPath, name), "utf8"));
    if (item.to === email && item.subject.includes("Verify")) { url = item.otp; break; }
  }
  assert.ok(url, "Verification email missing");
  const verify = await request("/auth/email-otp/verify-email", "POST", { email, otp: url }, "");
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
test("Product Experience requires 5–10 complete Yes or No answers and credits once", async () => {
  const participant = await account("product-experience@example.test");
  const uploadedImage = `data:image/png;base64,${"A".repeat(450000)}`;
  const productList = Array.from({ length: 5 }, (_, index) => ({ name: `Product ${index + 1}`, description: `Test description for product ${index + 1}`, imageUrl: uploadedImage }));
  const payload = { ...taskBody("manual"), title: "Product familiarity survey", taskType: "product_experience", products: productList, rewardPoints: 650 };
  assert.equal((await request("/admin/rewards/tasks", "POST", { ...payload, products: productList.slice(0, 4) }, staff.cookie)).status, 400);
  const created = await json<{ id: string; verification: string; products: Array<{ id: string }> }>(await request("/admin/rewards/tasks", "POST", payload, staff.cookie), 201);
  assert.equal(created.verification, "product_experience"); assert.equal(created.products.length, 5);
  const lightweightResponse = await request("/tasks?summary=1", "GET", undefined, participant.cookie);
  const lightweightText = await lightweightResponse.text(); assert.equal(lightweightResponse.status, 200); assert.ok(lightweightText.length < 50000, "Task list must not include embedded image payloads");
  const lightweight = JSON.parse(lightweightText).find((item: {id:string}) => item.id === created.id); assert.equal(lightweight.products.length, 5); assert.equal(lightweight.products[0].imageUrl, undefined);
  const detail = await json<{products:Array<{imageUrl:string}>}>(await request('/tasks/'+created.id,'GET',undefined,participant.cookie)); assert.equal(detail.products[0].imageUrl,uploadedImage);

  const cards = await json<Array<{ id: string; products: Array<{ id: string }> }>>(await request("/tasks", "GET", undefined, participant.cookie)); assert.equal(cards.find(item => item.id === created.id)?.products.length, 5);
  await json(await request(`/tasks/${created.id}/start`, "POST", {}, participant.cookie), 201);
  const completeAnswers = created.products.map((product, index) => ({ productId: product.id, answer: index % 2 === 0 }));
  assert.equal((await request(`/tasks/${created.id}/submit`, "POST", { productAnswers: completeAnswers.slice(0, 4) }, participant.cookie)).status, 400);
  assert.equal((await request(`/tasks/${created.id}/submit`, "POST", { productAnswers: [...completeAnswers.slice(0, 4), completeAnswers[0]] }, participant.cookie)).status, 400);
  const approved = await json<{ status: string }>(await request(`/tasks/${created.id}/submit`, "POST", { productAnswers: completeAnswers }, participant.cookie), 201); assert.equal(approved.status, "approved");
  assert.equal(await db.productAnswer.count({ where: { run: { userId: participant.id }, product: { taskId: created.id } } }), 5);
  const claims = await Promise.all([request(`/tasks/${created.id}/claim`, "POST", {}, participant.cookie), request(`/tasks/${created.id}/claim`, "POST", {}, participant.cookie)]);
  const results = await Promise.all(claims.map(response => json<{ credited: boolean }>(response, 201))); assert.equal(results.filter(result => result.credited).length, 1);
  assert.equal((await db.wallet.findUniqueOrThrow({ where: { userId: participant.id } })).points, 650);
  assert.equal((await request(`/admin/rewards/tasks/${created.id}`, "PATCH", { ...payload, products: productList.map((product, index) => index ? product : { ...product, name: "Changed product" }) }, staff.cookie)).status, 400);
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
  const payload = { amountCents: 99, provider: "crypto", destination: payoutDestination, requestKey: randomUUID() };
  assert.equal((await request("/wallet/withdrawals", "POST", payload)).status, 400);
  assert.equal((await request("/wallet/withdrawals", "POST", { ...payload, amountCents: 500, requestKey: randomUUID() })).status, 400);
  assert.equal((await request("/wallet/withdrawals", "POST", { ...payload, amountCents: 100, destination: "invalid" })).status, 400);
  await json(await request("/admin/rewards/eligibility", "PATCH", { email: user.email, eligible: false, reason: "Hold while eligibility is reviewed" }, staff.cookie));
  assert.equal((await json<{ withdrawableCents: number }>(await request("/wallet"))).withdrawableCents, 0);
  assert.equal((await request("/wallet/withdrawals", "POST", { ...payload, amountCents: 100 })).status, 400);
  await request("/admin/rewards/eligibility", "PATCH", { email: user.email, eligible: true, reason: "Eligibility has been confirmed" }, staff.cookie);
});
test("withdrawal retries are idempotent and concurrent spending cannot exceed available points", async () => {
  const payload = { amountCents: 300, provider: "crypto", destination: payoutDestination, requestKey: randomUUID() };
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
test("users can cancel only their own pending withdrawal and recover the reservation", async () => {
  const withdrawing = await json<{ id: string; points: number }>(await request("/wallet/withdrawals", "POST", { amountCents: 100, provider: "crypto", destination: payoutDestination, requestKey: randomUUID() }), 201);
  assert.equal((await request(`/wallet/withdrawals/${withdrawing.id}/cancel`, "POST", {}, friend.cookie)).status, 404);
  await json(await request(`/wallet/withdrawals/${withdrawing.id}/cancel`, "POST", {}), 201);
  const cancelled = await db.withdrawal.findUniqueOrThrow({ where: { id: withdrawing.id } });
  assert.equal(cancelled.status, "cancelled");
  assert.equal((await db.wallet.findUniqueOrThrow({ where: { userId: user.id } })).reservedPoints, 0);
  assert.equal((await request(`/admin/rewards/withdrawals/${withdrawing.id}`, "POST", { decision: "approve", reason: "Cannot approve a cancelled withdrawal" }, staff.cookie)).status, 400);
});
test("approval requires eligibility; settlement preserves the quoted rate and immutable ledger", async () => {
  const withdrawal = await json<{ id: string; points: number }>(await request("/wallet/withdrawals", "POST", { amountCents: 100, provider: "crypto", destination: payoutDestination, requestKey: randomUUID() }), 201);
  await rules({ pointsPerUsd: 2000 });
  assert.equal(withdrawal.points, 1000);
  assert.equal((await request(`/admin/rewards/withdrawals/${withdrawal.id}`, "POST", { decision: "paid", reason: "Cannot skip approval", paymentReference: "TEST-ONLY-001" }, staff.cookie)).status, 400);
  await request("/admin/rewards/eligibility", "PATCH", { email: user.email, eligible: false, reason: "Test eligibility recheck before approval" }, staff.cookie);
  assert.equal((await request(`/admin/rewards/withdrawals/${withdrawal.id}`, "POST", { decision: "approve", reason: "Review attempted during hold" }, staff.cookie)).status, 400);
  await request("/admin/rewards/eligibility", "PATCH", { email: user.email, eligible: true, reason: "Test eligibility is restored" }, staff.cookie);
  await json(await request(`/admin/rewards/withdrawals/${withdrawal.id}`, "POST", { decision: "approve", reason: "Approved after eligibility check" }, staff.cookie), 201);
  await json(await request(`/admin/rewards/withdrawals/${withdrawal.id}`, "POST", { decision: "paid", reason: "Simulated payment in isolated test database" }, staff.cookie), 201);
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
  await db.taskRun.update({ where: { userId_taskId_round: { userId: user.id, taskId: id, round: 0 } }, data: { completedAt: new Date(Date.now() - 86400000) } });
  await json(await request(`/tasks/${id}/claim`, "POST", {}, friend.cookie), 201);
});

test("staff cannot participate in tasks, change their eligibility, or review their withdrawal", async () => {
  const manual = (await task("manual")).id;
  assert.equal((await request("/tasks", "GET", undefined, staff.cookie)).status, 403);
  assert.equal((await request(`/tasks/${manual}/start`, "POST", {}, staff.cookie)).status, 403);
  assert.equal((await request("/admin/rewards/eligibility", "PATCH", { email: staff.email, eligible: true, reason: "Cannot change own withdrawal access" }, staff.cookie)).status, 400);
  await db.$transaction([db.wallet.upsert({ where: { userId: staff.id }, create: { userId: staff.id, points: 1500 }, update: { points: { increment: 1500 } } }), db.ledgerEntry.create({ data: { userId: staff.id, kind: "test_credit", points: 1500, reference: `staff-test:${randomUUID()}`, description: "Isolated self-review test balance" } })]);
  const withdrawal = await json<{ id: string }>(await request("/wallet/withdrawals", "POST", { amountCents: 100, provider: "crypto", destination: payoutDestination, requestKey: randomUUID() }, staff.cookie), 201);
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

const paymentMethod = { label: "Mobile Money test receiver", enabled: true, recipient: "0501234567", network: "Test MoMo", instructions: "TEST DATABASE ONLY: submit a simulated receipt, never send funds.", minimumCents: 100, maximumCents: 10000, reason: "Configure isolated payment tests" };

let depositId: string;
test("payment setup enforces permissions, configured recipients, limits, and idempotent requests", async () => {
  assert.equal((await request("/payments/methods", "GET", undefined, "")).status, 401);
  assert.deepEqual(await json(await request("/payments/methods")), []);
  assert.equal((await request("/admin/payments")).status, 403);
  assert.equal((await request("/admin/payments/methods/mobile_money", "PATCH", paymentMethod)).status, 403);
  assert.equal((await request("/admin/payments/methods/mobile_money", "PATCH", { ...paymentMethod, recipient: "" }, staff.cookie)).status, 400);
  const payload = { provider: "mobile_money", amountCents: 1000, requestKey: randomUUID() };
  assert.equal((await request("/payments/deposits", "POST", payload)).status, 400);
  await json(await request("/admin/payments/methods/mobile_money", "PATCH", paymentMethod, staff.cookie));
  assert.equal((await request("/payments/deposits", "POST", { ...payload, amountCents: 99 })).status, 400);
  assert.equal((await request("/payments/deposits", "POST", { ...payload, amountCents: 10001 })).status, 400);
  const responses = await Promise.all([request("/payments/deposits", "POST", payload), request("/payments/deposits", "POST", payload)]);
  const first = await json<{ id: string; status: string }>(responses[0], 201); const second = await json<{ id: string }>(responses[1], 201);
  depositId = first.id; assert.equal(first.id, second.id); assert.equal(first.status, "awaiting_payment");
  assert.equal((await request("/payments/deposits", "POST", { ...payload, amountCents: 500 })).status, 409);
  assert.equal((await json<{ depositCents: number }>(await request("/wallet"))).depositCents, 0);
  await json(await request("/admin/payments/methods/mobile_money", "PATCH", { ...paymentMethod, recipient: "0501234568" }, staff.cookie));
  assert.equal((await db.deposit.findUniqueOrThrow({ where: { id: depositId } })).recipient, paymentMethod.recipient);
});

test("deposit proof is private, unique across accounts, recoverable after rejection, and credited exactly once", async () => {
  const proof = { paymentReference: "test-receipt-001", proof: "Simulated receipt in an isolated test database.", proofImage: receiptImage };
  const balanceBefore = await db.wallet.findUniqueOrThrow({ where: { userId: user.id } });
  assert.equal((await request(`/payments/deposits/${depositId}/proof`, "POST", proof, friend.cookie)).status, 404);
  await json(await request(`/payments/deposits/${depositId}/proof`, "POST", proof), 201);
  assert.equal((await request(`/payments/deposits/${depositId}/cancel`, "POST", {})).status, 400);
  assert.equal((await db.wallet.findUniqueOrThrow({ where: { userId: user.id } })).depositCents, 0);
  const other = await json<{ id: string }>(await request("/payments/deposits", "POST", { provider: "mobile_money", amountCents: 1000, requestKey: randomUUID() }, friend.cookie), 201);
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
  const own = await json<{ id: string }>(await request("/payments/deposits", "POST", { provider: "mobile_money", amountCents: 1000, requestKey: randomUUID() }, staff.cookie), 201);
  await request(`/payments/deposits/${own.id}/proof`, "POST", { ...proof, paymentReference: "STAFF-TEST-RECEIPT" }, staff.cookie);
  assert.equal((await request(`/admin/payments/deposits/${own.id}/review`, "POST", review, staff.cookie)).status, 400);
  await json(await request(`/payments/deposits/${other.id}/cancel`, "POST", {}, friend.cookie), 201);
  assert.equal((await request(`/payments/deposits/${other.id}/proof`, "POST", { ...proof, paymentReference: "CANCELLED-RECEIPT" }, friend.cookie)).status, 400);
});

test("deposit balance cannot be withdrawn and remains available for membership", async () => {
  const before = await db.wallet.findUniqueOrThrow({ where: { userId: user.id } });
  const payload = { source: "deposit", provider: "crypto", destination: payoutDestination, amountCents: 700, requestKey: randomUUID() };
  assert.equal((await request("/wallet/withdrawals", "POST", payload)).status, 400);
  const balance = await db.wallet.findUniqueOrThrow({ where: { userId: user.id } });
  assert.equal(balance.depositCents, before.depositCents); assert.equal(balance.reservedDepositCents, 0);
  assert.equal(await db.withdrawal.count({ where: { userId: user.id, source: "deposit" } }), 0);
});

test("membership plans can be bought from deposit balance and gate task access while referral bonus is paid to the inviter", async () => {
  const sponsor = await account("membership-sponsor@example.test");
  const member = await account("membership-buyer@example.test", sponsor.referralCode);
  await db.wallet.upsert({ where: { userId: sponsor.id }, create: { userId: sponsor.id }, update: {} });
  const walletBefore = await db.wallet.findUniqueOrThrow({ where: { userId: sponsor.id } });
  const plan = await db.membershipPlan.create({ data: { key: "starter", name: "Starter", priceCents: 500, durationDays: 30, active: true } });
  assert.equal((await request("/membership/plans", "GET", undefined, member.cookie)).status, 200);
  assert.equal((await request("/membership/purchase", "POST", { planId: plan.id }, member.cookie)).status, 400);
  await json(await request("/admin/payments/methods/mobile_money", "PATCH", paymentMethod, staff.cookie));
  const deposit = await json<{ id: string }>(await request("/payments/deposits", "POST", { provider: "mobile_money", amountCents: 1000, requestKey: randomUUID() }, member.cookie), 201);
  await json(await request(`/payments/deposits/${deposit.id}/proof`, "POST", { paymentReference: "membership-test-proof-1", proofImage: receiptImage }, member.cookie), 201);
  await json(await request(`/admin/payments/deposits/${deposit.id}/review`, "POST", { decision: "approve", confirmedAmountCents: 1000, reason: "Verified deposit for membership test" }, staff.cookie), 201);
  const membership = await json<{ priceCents: number; status: string; referrerBonusCents: number }>(await request("/membership/purchase", "POST", { planId: plan.id }, member.cookie), 201);
  assert.equal(membership.status, "active");
  assert.equal(membership.priceCents, 500);
  assert.equal(membership.referrerBonusCents, 50);
  const inviterBalance = await db.wallet.findUniqueOrThrow({ where: { userId: sponsor.id } });
  assert.equal(inviterBalance.depositCents, walletBefore.depositCents + 50);
  const memberTask = await task("code", { requiresMembership: true });
  assert.equal((await request(`/tasks/${memberTask.id}/start`, "POST", {}, member.cookie)).status, 201);
  assert.equal((await request(`/tasks/${memberTask.id}/start`, "POST", {})).status, 400);
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
    if (option.asset !== "USDT") assert.equal((await request(`/payments/deposits/${deposit.id}/proof`, "POST", { paymentReference: "invalid-hash", proof: "Invalid test transaction hash" })).status, 400);
    index += 1;
    const transactionHash = option.network === "Ethereum" ? `0x${index.toString().repeat(64)}` : index.toString().repeat(64);
    await json(await request(`/payments/deposits/${deposit.id}/proof`, "POST", { ...(option.asset === "USDT" ? { proofImage: "data:image/png;base64,aGVsbG8=" } : { paymentReference: transactionHash }), proof: "Simulated crypto receipt in isolated database" }), 201);
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

test("task access, image proof, notifications and admin removal", async () => {
  const memberTask = await task("manual", { requiresMembership: true });
  const publicTask = await task("manual");
  const list = await json<Array<{id:string}>>(await request("/tasks"));
  assert.ok(!list.some(t => t.id === memberTask.id));
  assert.equal((await request('/tasks/' + memberTask.id)).status, 404);
  const run = await json<{id:string}>(await request('/tasks/' + publicTask.id + '/start', 'POST', {}), 201);
  const proofImage = 'data:image/png;base64,iVBORw0KGgo=';
  await json(await request('/tasks/' + publicTask.id + '/submit', 'POST', {proofImage}), 201);
  assert.match((await db.taskRun.findUniqueOrThrow({where:{id:run.id}})).proofImage || '', /^task-proof:[a-f0-9]{64}\.png$/);
  const savedProof = await request('/task-proofs/' + run.id);
  assert.equal(savedProof.status, 200);
  assert.match(savedProof.headers.get('content-type') || '', /image\/png/);
  assert.deepEqual(Buffer.from(await savedProof.arrayBuffer()), Buffer.from('iVBORw0KGgo=', 'base64'));
  const stranger = await account('proof-stranger@example.test');
  assert.equal((await request('/task-proofs/' + run.id, 'GET', undefined, stranger.cookie)).status, 404);
  const reviewQueue = await json<{ reviews: Array<{ id: string; proofImage: string | null }> }>(await request('/admin/rewards', 'GET', undefined, staff.cookie));
  assert.equal(reviewQueue.reviews.find(item => item.id === run.id)?.proofImage, '/api/v1/task-proofs/' + run.id);
  await json(await request('/admin/rewards/reviews/' + run.id, 'POST', {decision:'approve',reason:'Screenshot meets task requirements'}, staff.cookie),201);
  const notices = await json<Array<{id:string}>>(await request('/notifications/tasks'));
  assert.ok(notices.some(n => n.id === run.id));
  await json(await request('/tasks/' + publicTask.id + '/claim', 'POST', {}), 201);
  const payout = await json<{id:string}>(await request('/wallet/withdrawals','POST',{provider:'crypto',asset:'USDT',network:'TRON (TRC20)',address:'T' + 'A'.repeat(33),amountCents:100,requestKey:randomUUID()}),201);
  await json(await request('/admin/rewards/withdrawals/' + payout.id,'POST',{decision:'approve',reason:'Verified reward payout eligibility'},staff.cookie),201);
  await json(await request('/admin/rewards/withdrawals/' + payout.id,'POST',{decision:'paid',reason:'Payment confirmed without transaction ID'},staff.cookie),201);
  assert.equal((await request('/admin/rewards/tasks/' + publicTask.id, 'DELETE', {})).status,403);
  await json(await request('/admin/rewards/tasks/' + publicTask.id, 'DELETE', {}, staff.cookie));
  assert.equal((await request('/tasks/' + publicTask.id)).status,404);
  assert.ok(await db.taskRun.findUnique({where:{id:run.id}}));
  for(const provider of ['paypal','bank']) {
    assert.equal((await request('/payments/deposits','POST',{provider,amountCents:100,requestKey:randomUUID()})).status,400);
    assert.equal((await request('/wallet/withdrawals','POST',{provider,amountCents:100,destination:'legacy@example.test',requestKey:randomUUID()})).status,400);
  }
});


test("recurring tasks credit once after admin approval and reopen in the next round", async () => {
  const recurring = await task("manual", { repeatHours: 1, autoClaimOnApproval: true, totalLimit: 1 });
  const initial = (await db.wallet.findUnique({ where: { userId: user.id } }))?.points || 0;
  const starts = await Promise.all([request('/tasks/' + recurring.id + '/start', 'POST', {}), request('/tasks/' + recurring.id + '/start', 'POST', {})]);
  const first = await json<{ id: string; round: number }>(starts[0], 201);
  assert.equal((await json<{ id: string }>(starts[1], 201)).id, first.id);
  assert.equal(first.round, 0);
  assert.equal((await request('/tasks/' + recurring.id + '/submit', 'POST', { proof: 'A completed proof submission' })).status, 400);
  await json(await request('/tasks/' + recurring.id + '/submit', 'POST', { runId: first.id, proofImage: 'data:image/png;base64,aGVsbG8=' }), 201);
  assert.equal((await request('/tasks/' + recurring.id + '/claim', 'POST', { runId: first.id })).status, 400);
  assert.equal((await db.wallet.findUnique({ where: { userId: user.id } }))?.points || 0, initial);
  // Advance the schedule anchor in this isolated database to simulate a new round.
  await db.task.update({ where: { id: recurring.id }, data: { startsAt: new Date(Date.now() - 3660000) } });
  assert.equal((await json<{ id: string }>(await request('/tasks/' + recurring.id + '/start', 'POST', {}), 201)).id, first.id);
  const decisions = await Promise.all([1, 2].map(() => request('/admin/rewards/reviews/' + first.id, 'POST', { decision: 'approve', reason: 'Verified screenshot and completed instructions' }, staff.cookie)));
  assert.deepEqual(decisions.map(r => r.status).sort(), [201, 400]);
  assert.equal((await db.wallet.findUniqueOrThrow({ where: { userId: user.id } })).points, initial + 1500);
  assert.equal(await db.ledgerEntry.count({ where: { reference: 'task:' + first.id } }), 1);
  const notices = await json<Array<{ id: string; status: string }>>(await request('/notifications/tasks'));
  assert.ok(notices.some(n => n.id === first.id && n.status === 'completed'));
  const listed = await json<{ run: unknown; slotsRemaining: number }>(await request('/tasks/' + recurring.id));
  assert.equal(listed.run, null); assert.equal(listed.slotsRemaining, 1);
  const second = await json<{ id: string; round: number }>(await request('/tasks/' + recurring.id + '/start', 'POST', {}), 201);
  assert.notEqual(second.id, first.id); assert.equal(second.round, 1);
  await json(await request('/tasks/' + recurring.id + '/submit', 'POST', { runId: first.id, proof: 'Old request must not submit the new round' }), 201);
  assert.equal((await db.taskRun.findUniqueOrThrow({ where: { id: second.id } })).status, 'in_progress');
  await json(await request('/tasks/' + recurring.id + '/submit', 'POST', { runId: second.id, proof: 'New round completed correctly' }), 201);
  await json(await request('/admin/rewards/reviews/' + second.id, 'POST', { decision: 'reject', reason: 'Please provide an image for verification' }, staff.cookie), 201);
  assert.equal((await db.wallet.findUniqueOrThrow({ where: { userId: user.id } })).points, initial + 1500);
  assert.equal((await request('/tasks/' + recurring.id + '/submit', 'POST', { runId: second.id, proofImage: 'data:image/png;base64,aGVsbG8=' })).status, 400);
  await json(await request('/tasks/' + recurring.id + '/submit', 'POST', { runId: second.id, proofImage: 'data:image/png;base64,aGVsbG8x' }), 201);
  await db.task.update({ where: { id: recurring.id }, data: { dailyLimit: 1 } });
  assert.equal((await request('/admin/rewards/reviews/' + second.id, 'POST', { decision: 'approve', reason: 'The corrected proof meets requirements' }, staff.cookie)).status, 409);
  assert.equal((await db.taskRun.findUniqueOrThrow({ where: { id: second.id } })).status, 'pending_review');
  await db.taskRun.update({ where: { id: first.id }, data: { completedAt: new Date(Date.now() - 86400000) } });
  await json(await request('/admin/rewards/reviews/' + second.id, 'POST', { decision: 'approve', reason: 'The corrected proof meets requirements' }, staff.cookie), 201);
  assert.equal((await db.wallet.findUniqueOrThrow({ where: { userId: user.id } })).points, initial + 3000);
  const claimed = await json<{ credited: boolean }>(await request('/tasks/' + recurring.id + '/claim', 'POST', { runId: second.id }), 201);
  assert.equal(claimed.credited, false);
  assert.equal(await db.taskRun.count({ where: { taskId: recurring.id, userId: user.id } }), 2);
  assert.equal((await request('/admin/rewards/tasks/' + recurring.id, 'PATCH', { ...taskBody('manual'), repeatHours: 24, autoClaimOnApproval: true }, staff.cookie)).status, 400);
  await db.task.update({ where: { id: recurring.id }, data: { active: false } });
  assert.equal((await request('/tasks/' + recurring.id + '/start', 'POST', {})).status, 400);
});

test("automated product task waits for review and supports answer corrections", async () => {
  const products = Array.from({ length: 5 }, (_, i) => ({ name: 'Product ' + i, description: 'A product for experience research', imageUrl: null }));
  const item = await json<{ id: string; products: Array<{ id: string }> }>(await request('/admin/rewards/tasks', 'POST', { ...taskBody('manual'), taskType: 'product_experience', products, repeatHours: 24, autoClaimOnApproval: true }, staff.cookie), 201);
  const run = await json<{ id: string }>(await request('/tasks/' + item.id + '/start', 'POST', {}), 201);
  const initial = (await db.wallet.findUnique({ where: { userId: user.id } }))?.points || 0;
  const productAnswers = item.products.map(p => ({ productId: p.id, answer: true }));
  const submit = () => request('/tasks/' + item.id + '/submit', 'POST', { runId: run.id, productAnswers });
  assert.equal((await json<{ status: string }>(await submit(), 201)).status, 'pending_review');
  const overview = await json<{ reviews: Array<{ id: string; productAnswers: unknown[] }> }>(await request('/admin/rewards', 'GET', undefined, staff.cookie));
  assert.equal(overview.reviews.find(r => r.id === run.id)?.productAnswers.length, 5);
  assert.equal((await request('/admin/rewards/reviews/' + run.id, 'POST', { decision: 'approve', reason: 'Users cannot approve their own submissions' })).status, 403);
  await json(await request('/admin/rewards/reviews/' + run.id, 'POST', { decision: 'reject', reason: 'Please correct your product responses' }, staff.cookie), 201);
  productAnswers[0].answer = false;
  await json(await submit(), 201);
  assert.equal(await db.productAnswer.count({ where: { runId: run.id } }), 5);
  assert.equal((await db.wallet.findUnique({ where: { userId: user.id } }))?.points || 0, initial);
  await json(await request('/admin/rewards/reviews/' + run.id, 'POST', { decision: 'approve', reason: 'All product answers reviewed successfully' }, staff.cookie), 201);
  assert.equal((await db.wallet.findUniqueOrThrow({ where: { userId: user.id } })).points, initial + 1500);
});


test("admin creates users who can sign in before email verification and safely deletes accounts with history", async () => {
  const email = 'admin-created-user@example.test';
  const payload = { name: 'Created User', email, password, reason: 'Account created for integration verification' };
  assert.equal((await request('/admin/users', 'POST', payload)).status, 403);
  assert.equal((await request('/admin/users', 'POST', { ...payload, password: 'short' }, staff.cookie)).status, 400);
  assert.equal((await request('/admin/users', 'POST', { ...payload, role: 'super_admin' }, staff.cookie)).status, 400);
  const created = await json<{ user: { id: string; emailVerified: boolean; roles: Array<{ role: { key: string } }> }; verificationSent: boolean }>(await request('/admin/users', 'POST', payload, staff.cookie), 201);
  assert.equal(created.user.emailVerified, false); assert.equal(created.verificationSent, true);
  assert.deepEqual(created.user.roles.map(r => r.role.key), ['user']);
  assert.equal((await request('/admin/users', 'POST', payload, staff.cookie)).status, 409);
  assert.equal((await request('/me', 'GET', undefined, staff.cookie)).status, 200);
  const credential = await db.account.findFirstOrThrow({ where: { userId: created.user.id } });
  assert.ok(credential.password); assert.notEqual(credential.password, password);
  const loginBefore = await request('/auth/sign-in/email', 'POST', { email, password }, ''); assert.equal(loginBefore.status, 200);
  let verifyUrl = '';
  for (const file of await readdir(mailPath)) { const mail = JSON.parse(await readFile(resolve(mailPath, file), 'utf8')); if (mail.to === email && mail.subject.includes('Verify')) verifyUrl = mail.otp; }
  assert.ok(verifyUrl);
  const verified = await request('/auth/email-otp/verify-email', 'POST', { email, otp: verifyUrl }, ''); assert.ok([200, 302].includes(verified.status));
  const login = await request('/auth/sign-in/email', 'POST', { email, password }, ''); assert.equal(login.status, 200);
  const cookie = login.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  const id = created.user.id;
  await json(await request('/admin/users/' + id + '/adjustment', 'POST', { source: 'points', delta: 2000, requestKey: randomUUID(), reason: 'Initial testing reward balance' }, staff.cookie), 201);
  const withdrawal = await json<{ id: string }>(await request('/wallet/withdrawals', 'POST', { provider: 'crypto', asset: 'USDT', network: 'TRON (TRC20)', address: 'T' + 'A'.repeat(33), amountCents: 100, requestKey: randomUUID() }, cookie), 201);
  const deletion = { email, reason: 'Remove test account while keeping reward history' };
  assert.equal((await request('/admin/users/' + id, 'DELETE', deletion)).status, 403);
  assert.equal((await request('/admin/users/' + id, 'DELETE', { ...deletion, email: 'wrong@example.test' }, staff.cookie)).status, 400);
  assert.equal((await request('/admin/users/' + id, 'DELETE', deletion, staff.cookie)).status, 409);
  await json(await request('/admin/rewards/withdrawals/' + withdrawal.id, 'POST', { decision: 'reject', reason: 'Release pending payment before account deletion' }, staff.cookie), 201);
  const taskItem = await task('manual');
  const run = await json<{ id: string }>(await request('/tasks/' + taskItem.id + '/start', 'POST', {}, cookie), 201);
  await json(await request('/tasks/' + taskItem.id + '/submit', 'POST', { proof: 'Proof retained after account removal' }, cookie), 201);
  const ledgerCount = await db.ledgerEntry.count({ where: { userId: id } });
  await json(await request('/admin/users/' + id, 'DELETE', deletion, staff.cookie));
  await json(await request('/admin/users/' + id, 'DELETE', deletion, staff.cookie));
  assert.equal((await db.user.findUniqueOrThrow({ where: { id } })).status, 'deleted');
  assert.equal(await db.session.count({ where: { userId: id } }), 0); assert.equal(await db.account.count({ where: { userId: id } }), 0);
  assert.equal(await db.ledgerEntry.count({ where: { userId: id } }), ledgerCount);
  assert.equal((await db.wallet.findUniqueOrThrow({ where: { userId: id } })).points, 2000);
  assert.ok(await db.taskRun.findUnique({ where: { id: run.id } }));
  assert.notEqual((await request('/me', 'GET', undefined, cookie)).status, 200);
  assert.notEqual((await request('/auth/sign-in/email', 'POST', { email, password }, '')).status, 200);
  const current = await json<{ items: Array<{ id: string }> }>(await request('/admin/users?search=' + email, 'GET', undefined, staff.cookie)); assert.ok(!current.items.some(u => u.id === id));
  const deleted = await json<{ items: Array<{ id: string }> }>(await request('/admin/users?status=deleted&search=' + email, 'GET', undefined, staff.cookie)); assert.ok(deleted.items.some(u => u.id === id));
  assert.equal((await request('/admin/users/' + id + '/status', 'POST', { status: 'active', reason: 'Deleted account cannot be activated' }, staff.cookie)).status, 400);
  assert.equal((await request('/admin/users/' + id + '/profile', 'PATCH', { name: 'Changed name', email, reason: 'Deleted profile should be immutable' }, staff.cookie)).status, 400);
  assert.equal((await request('/admin/rewards/reviews/' + run.id, 'POST', { decision: 'approve', reason: 'Cannot approve deleted account tasks' }, staff.cookie)).status, 400);
  assert.equal((await request('/admin/users/' + staff.id, 'DELETE', { email: staff.email, reason: 'Staff cannot delete their own account' }, staff.cookie)).status, 400);
  assert.equal(await db.auditLog.count({ where: { targetId: id, action: 'user.deleted' } }), 1);
  const audit = await db.auditLog.findMany({ where: { targetId: id } }); assert.ok(!JSON.stringify(audit).includes(password));
});


test("account deletion protects pending deposits and other staff accounts", async () => {
  const target = await db.user.create({ data: { name: 'Deposit owner', email: 'deposit-owner-delete@example.test' } });
  const depositData = { userId: target.id, amountCents: 100, provider: 'crypto', asset: 'USDT', network: 'TRON (TRC20)', cryptoAmount: '1.000000', usdRateCents: 100, recipient: 'T' + 'A'.repeat(33), methodLabel: 'USDT', instructions: 'Send the exact crypto amount' };
  const pending = await db.deposit.create({ data: { ...depositData, requestKey: randomUUID(), status: 'pending_review', proof: 'Submitted receipt for review', proofImage: 'data:image/png;base64,aGVsbG8=' } });
  const awaiting = await db.deposit.create({ data: { ...depositData, requestKey: randomUUID() } });
  const deletion = { email: target.email, reason: 'Remove account after resolving payment review' };
  assert.equal((await request('/admin/users/' + target.id, 'DELETE', deletion, staff.cookie)).status, 409);
  assert.equal((await db.deposit.findUniqueOrThrow({ where: { id: awaiting.id } })).status, 'awaiting_payment');
  await json(await request('/admin/payments/deposits/' + pending.id + '/review', 'POST', { decision: 'reject', reason: 'Receipt does not establish received payment' }, staff.cookie), 201);
  await json(await request('/admin/users/' + target.id, 'DELETE', deletion, staff.cookie));
  assert.equal((await db.deposit.findUniqueOrThrow({ where: { id: awaiting.id } })).status, 'cancelled');
  assert.equal((await db.deposit.findUniqueOrThrow({ where: { id: pending.id } })).status, 'rejected');
  const protectedUser = await db.user.create({ data: { name: 'Protected staff', email: 'protected-staff-delete@example.test' } });
  const role = await db.role.findUniqueOrThrow({ where: { key: 'super_admin' } });
  await db.userRole.create({ data: { userId: protectedUser.id, roleId: role.id } });
  assert.equal((await request('/admin/users/' + protectedUser.id, 'DELETE', { email: protectedUser.email, reason: 'Other staff accounts must remain protected' }, staff.cookie)).status, 400);
});


test("image preference polls validate designs, review votes, credit once and repeat", async () => {
  const image = 'data:image/png;base64,aGVsbG8=';
  const products = ['Design A', 'Design B'].map(name => ({ name, description: 'A product packaging design', imageUrl: image }));
  const payload = { ...taskBody('manual'), title: 'Choose your favourite design', taskType: 'image_preference', products, rewardPoints: 50, repeatHours: 24, autoClaimOnApproval: true };
  assert.equal((await request('/admin/rewards/tasks', 'POST', { ...payload, products: products.slice(0, 1) }, staff.cookie)).status, 400);
  assert.equal((await request('/admin/rewards/tasks', 'POST', { ...payload, products: products.map(p => ({ ...p, imageUrl: null })) }, staff.cookie)).status, 400);
  const poll = await json<{ id: string; products: Array<{ id: string }> }>(await request('/admin/rewards/tasks', 'POST', payload, staff.cookie), 201);
  assert.equal((await request('/admin/rewards/image-polls')).status, 403);
  const run = await json<{ id: string }>(await request('/tasks/' + poll.id + '/start', 'POST', {}), 201);
  const initial = (await db.wallet.findUnique({ where: { userId: user.id } }))?.points || 0;
  assert.equal((await request('/tasks/' + poll.id + '/submit', 'POST', { runId: run.id })).status, 400);
  assert.equal((await request('/tasks/' + poll.id + '/submit', 'POST', { runId: run.id, selectedDesignId: randomUUID() })).status, 400);
  await Promise.all([1, 2].map(async () => json(await request('/tasks/' + poll.id + '/submit', 'POST', { runId: run.id, selectedDesignId: poll.products[0].id }), 201)));
  assert.equal(await db.productAnswer.count({ where: { runId: run.id, answer: true } }), 1);
  type PollResults = Array<{ id: string; products: Array<{ id: string; votes: number }> }>;
  const results = async () => (await json<PollResults>(await request('/admin/rewards/image-polls', 'GET', undefined, staff.cookie))).find(p => p.id === poll.id)!;
  assert.equal((await results()).products.reduce((sum, p) => sum + p.votes, 0), 0);
  assert.equal((await request('/tasks/' + poll.id + '/claim', 'POST', { runId: run.id })).status, 400);
  await json(await request('/admin/rewards/reviews/' + run.id, 'POST', { decision: 'reject', reason: 'Please review both designs before confirming' }, staff.cookie), 201);
  await json(await request('/tasks/' + poll.id + '/submit', 'POST', { runId: run.id, selectedDesignId: poll.products[1].id }), 201);
  await json(await request('/admin/rewards/reviews/' + run.id, 'POST', { decision: 'approve', reason: 'Valid preference submitted for this round' }, staff.cookie), 201);
  assert.equal((await db.wallet.findUniqueOrThrow({ where: { userId: user.id } })).points, initial + 50);
  assert.equal((await results()).products.find(p => p.id === poll.products[1].id)?.votes, 1);
  assert.equal((await request('/admin/rewards/tasks/' + poll.id, 'PATCH', { ...payload, products: products.map(p => ({ ...p, name: 'Changed design' })) }, staff.cookie)).status, 400);
  assert.equal((await json<{ id: string }>(await request('/tasks/' + poll.id + '/start', 'POST', {}), 201)).id, run.id);
  await db.task.update({ where: { id: poll.id }, data: { startsAt: new Date(Date.now() - 86460000) } });
  const next = await json<{ id: string }>(await request('/tasks/' + poll.id + '/start', 'POST', {}), 201); assert.notEqual(next.id, run.id);
  await json(await request('/tasks/' + poll.id + '/submit', 'POST', { runId: next.id, selectedDesignId: poll.products[0].id }), 201);
  await json(await request('/admin/rewards/reviews/' + next.id, 'POST', { decision: 'approve', reason: 'A new round with a valid preference' }, staff.cookie), 201);
  assert.equal((await db.wallet.findUniqueOrThrow({ where: { userId: user.id } })).points, initial + 100);
  assert.deepEqual((await results()).products.map(p => p.votes), [1, 1]);
  const instant = await json<{ id: string; products: Array<{ id: string }> }>(await request('/admin/rewards/tasks', 'POST', { ...payload, repeatHours: null, autoClaimOnApproval: false }, staff.cookie), 201);
  await json(await request('/tasks/' + instant.id + '/start', 'POST', {}), 201);
  const vote = await json<{ status: string }>(await request('/tasks/' + instant.id + '/submit', 'POST', { selectedDesignId: instant.products[0].id }), 201); assert.equal(vote.status, 'approved');
  const claims = await Promise.all([1, 2].map(async () => json<{ credited: boolean }>(await request('/tasks/' + instant.id + '/claim', 'POST', {}), 201))); assert.equal(claims.filter(c => c.credited).length, 1);
  const premium = await json<{ id: string }>(await request('/admin/rewards/tasks', 'POST', { ...payload, requiresMembership: true }, staff.cookie), 201);
  assert.equal((await request('/tasks/' + premium.id)).status, 404);
  assert.equal((await request('/tasks/' + premium.id + '/start', 'POST', {})).status, 400);
});


test("movie and music reviews validate stars, preserve feedback and credit after approval", async () => {
  for (const taskType of ['movie_review', 'music_review']) {
    await db.rateLimit.deleteMany();
    const payload = { ...taskBody('manual'), title: 'Review our approved content', taskType, destinationUrl: 'https://example.test/approved-content', products: [{ name: 'Approved content', description: 'A short sample to watch or listen to', imageUrl: null }], rewardPoints: 100, autoClaimOnApproval: true, repeatHours: 24 };
    assert.equal((await request('/admin/rewards/tasks', 'POST', { ...payload, destinationUrl: null }, staff.cookie)).status, 400);
    const item = await json<{ id: string; verification: string }>(await request('/admin/rewards/tasks', 'POST', payload, staff.cookie), 201);
    assert.equal(item.verification, 'rating_review');
    const started = await json<{ id: string }>(await request('/tasks/' + item.id + '/start', 'POST', {}), 201);
    const baseline = (await db.wallet.findUnique({ where: { userId: user.id } }))?.points || 0;
    for (const rating of [0, 6, 2.5]) assert.equal((await request('/tasks/' + item.id + '/submit', 'POST', { runId: started.id, rating, proof: 'Detailed feedback on this content' })).status, 400);
    assert.equal((await request('/tasks/' + item.id + '/submit', 'POST', { runId: started.id, rating: 4, proof: 'short' })).status, 400);
    assert.equal((await request('/tasks/' + item.id + '/submit', 'POST', { runId: started.id, proof: 'Feedback with no star rating' })).status, 400);
    const submission = await json<{ status: string; rating: number }>(await request('/tasks/' + item.id + '/submit', 'POST', { runId: started.id, rating: 1, proof: 'I did not enjoy the pacing of this content.' }), 201);
    assert.equal(submission.status, 'pending_review'); assert.equal(submission.rating, 1);
    assert.equal((await request('/tasks/' + item.id + '/claim', 'POST', { runId: started.id })).status, 400);
    assert.equal((await request('/admin/rewards/tasks/' + item.id, 'PATCH', { ...payload, destinationUrl: 'https://example.test/different-content' }, staff.cookie)).status, 400);
    await json(await request('/admin/rewards/reviews/' + started.id, 'POST', { decision: 'reject', reason: 'Please explain what could improve in more detail' }, staff.cookie), 201);
    await json(await request('/tasks/' + item.id + '/submit', 'POST', { runId: started.id, rating: 1, proof: 'The pacing feels slow and the sound quality could improve.' }), 201);
    const overview = await json<{ reviews: Array<{ id: string; rating: number; proof: string }> }>(await request('/admin/rewards', 'GET', undefined, staff.cookie));
    assert.equal(overview.reviews.find(r => r.id === started.id)?.rating, 1);
    const resultsBefore = await json<Array<{ id: string; acceptedReviews: number }>>(await request('/admin/rewards/media-reviews', 'GET', undefined, staff.cookie));
    assert.equal(resultsBefore.find(r => r.id === item.id)?.acceptedReviews, 0);
    const decisions = await Promise.all([1, 2].map(() => request('/admin/rewards/reviews/' + started.id, 'POST', { decision: 'approve', reason: 'Honest detailed review accepted regardless of star rating' }, staff.cookie)));
    assert.deepEqual(decisions.map(r => r.status).sort(), [201, 400]);
    assert.equal((await db.wallet.findUniqueOrThrow({ where: { userId: user.id } })).points, baseline + 100);
    const results = await json<Array<{ id: string; acceptedReviews: number; averageRating: number }>>(await request('/admin/rewards/media-reviews', 'GET', undefined, staff.cookie));
    assert.equal(results.find(r => r.id === item.id)?.averageRating, 1); assert.equal(results.find(r => r.id === item.id)?.acceptedReviews, 1);
    assert.equal((await request('/admin/rewards/media-reviews')).status, 403);
    await db.task.update({ where: { id: item.id }, data: { startsAt: new Date(Date.now() - 86460000) } });
    const next = await json<{ id: string; rating: number | null }>(await request('/tasks/' + item.id + '/start', 'POST', {}), 201);
    assert.notEqual(next.id, started.id); assert.equal(next.rating, null);
    assert.equal((await db.taskRun.findUniqueOrThrow({ where: { id: started.id } })).rating, 1);
  }
});


test("crypto deposits submit and approve without payment details text", async () => {
 const initial = (await db.wallet.findUnique({ where: { userId: user.id } }))?.depositCents || 0;
 for (const asset of ['USDT', 'BTC', 'ETH']) {
  const deposit = await db.deposit.create({ data: { userId: user.id, requestKey: randomUUID(), provider: 'crypto', asset, network: asset === 'USDT' ? 'TRON (TRC20)' : asset === 'BTC' ? 'Bitcoin' : 'Ethereum', cryptoAmount: '1.000000', usdRateCents: 100, amountCents: 100, methodLabel: asset, recipient: asset === 'ETH' ? '0x' + 'a'.repeat(40) : 'T' + 'A'.repeat(33), instructions: 'Send the exact requested amount' } });
  assert.equal((await request('/payments/deposits/' + deposit.id + '/proof', 'POST', {})).status, 400);
  const evidence = asset === 'USDT' ? { proofImage: 'data:image/png;base64,aGVsbG8=' } : { paymentReference: (asset === 'ETH' ? '0x' : '') + 'a'.repeat(64) };
  const sent = await json<{ proof: string | null; status: string }>(await request('/payments/deposits/' + deposit.id + '/proof', 'POST', evidence), 201);
  assert.equal(sent.proof, null); assert.equal(sent.status, 'pending_review');
  await json(await request('/admin/payments/deposits/' + deposit.id + '/review', 'POST', { decision: 'approve', confirmedAmountCents: 100, reason: 'Verified payment evidence without additional text' }, staff.cookie), 201);
 }
 assert.equal((await db.wallet.findUniqueOrThrow({ where: { userId: user.id } })).depositCents, initial + 300);
});

test("survey questions validate answers and credit only after admin approval", async () => {
 const participant = await account("survey-check@example.test");
 const questions = [{id:randomUUID(),prompt:"What should improve?",type:"text",options:[]},{id:randomUUID(),prompt:"Have you used it?",type:"yes_no",options:[]},{id:randomUUID(),prompt:"Choose a colour",type:"single_choice",options:["Blue","Green"]}];
 const payload={...taskBody("manual"),taskType:"survey",surveyQuestions:questions,autoClaimOnApproval:true,rewardPoints:125};
 assert.equal((await request("/admin/rewards/tasks","POST",{...payload,surveyQuestions:[]},staff.cookie)).status,400);
 const created=await json<{id:string}>(await request("/admin/rewards/tasks","POST",payload,staff.cookie),201);
 const run=await json<{id:string}>(await request('/tasks/'+created.id+'/start','POST',{},participant.cookie),201);
 const answers=questions.map((q,i)=>({questionId:q.id,answer:["Better packaging","No","Blue"][i]}));
 for(const invalid of [answers.slice(1),[answers[0],answers[0],answers[2]],[answers[0],answers[1],{...answers[2],answer:"Red"}]]) assert.equal((await request('/tasks/'+created.id+'/submit','POST',{surveyAnswers:invalid},participant.cookie)).status,400);
 const submitted=await json<{status:string}>(await request('/tasks/'+created.id+'/submit','POST',{surveyAnswers:answers},participant.cookie),201);assert.equal(submitted.status,'pending_review');
 assert.equal((await request('/tasks/'+created.id+'/claim','POST',{},participant.cookie)).status,400);
 assert.deepEqual((await db.taskRun.findUniqueOrThrow({where:{id:run.id}})).surveyAnswers,answers);
 await json(await request('/admin/rewards/tasks/'+created.id,'PATCH',payload,staff.cookie));
 assert.equal((await request('/admin/rewards/tasks/'+created.id,'PATCH',{...payload,surveyQuestions:questions.map(q=>({...q,prompt:q.prompt+' changed'}))},staff.cookie)).status,400);
 await json(await request('/admin/rewards/reviews/'+run.id,'POST',{decision:'approve',reason:'All survey answers reviewed'},staff.cookie),201);
 assert.equal((await db.wallet.findUniqueOrThrow({where:{userId:participant.id}})).points,125);
 await request('/tasks/'+created.id+'/claim','POST',{},participant.cookie);
 assert.equal((await db.wallet.findUniqueOrThrow({where:{userId:participant.id}})).points,125);
});
test("withdrawal referral threshold gates submission and admin approval", async()=>{
 const participant=await account('referral-gate@example.test');
 await rules({minWithdrawalReferrals:1,minWithdrawalCents:100,referralsEnabled:true,referralRequiredTasks:1,referralRewardPoints:0});
 await json(await request('/admin/users/'+participant.id+'/adjustment','POST',{source:'points',delta:3000,requestKey:randomUUID(),reason:'Reward balance for referral gate test'},staff.cookie),201);
 const payout={provider:'crypto',asset:'USDT',network:'TRON (TRC20)',address:'T'+'A'.repeat(33),amountCents:100,requestKey:randomUUID()};
 const blocked=await json<{code:string}>(await request('/wallet/withdrawals','POST',payout,participant.cookie),400);assert.equal(blocked.code,'WITHDRAWAL_REFERRALS_REQUIRED');
 assert.equal(await db.withdrawal.count({where:{userId:participant.id}}),0);
 const invitee=await account('referral-gate-friend@example.test',participant.referralCode);
 assert.equal((await request('/wallet/withdrawals','POST',payout,participant.cookie)).status,400);
 const qualifying=await task();await complete(qualifying.id,invitee.cookie);
 const wallet=await json<{referralRequirement:{met:boolean;qualified:number}}>(await request('/wallet','GET',undefined,participant.cookie));assert.equal(wallet.referralRequirement.met,true);assert.equal(wallet.referralRequirement.qualified,1);
 const withdrawal=await json<{id:string}>(await request('/wallet/withdrawals','POST',payout,participant.cookie),201);
 await rules({minWithdrawalReferrals:2});
 assert.equal((await request('/admin/rewards/withdrawals/'+withdrawal.id,'POST',{decision:'approve',reason:'Testing changed referral requirement'},staff.cookie)).status,400);
 await rules({minWithdrawalReferrals:0});
 await json(await request('/admin/rewards/withdrawals/'+withdrawal.id,'POST',{decision:'approve',reason:'Referral requirement disabled by administrator'},staff.cookie),201);
});

test("completed task cleanup preserves rewards and scheduled reposting", async()=>{
 const participant=await account('cleanup-test@example.test');
 const once=await task('code',{completedVisibleHours:1}); await complete(once.id,participant.cookie);
 let list=await json<Array<{id:string}>>(await request('/tasks?summary=1','GET',undefined,participant.cookie));assert.ok(list.some(t=>t.id===once.id));
 await db.taskRun.updateMany({where:{taskId:once.id,userId:participant.id},data:{completedAt:new Date(Date.now()-2*3600000)}});
 list=await json<Array<{id:string}>>(await request('/tasks?summary=1','GET',undefined,participant.cookie));assert.ok(!list.some(t=>t.id===once.id));
 assert.equal((await db.wallet.findUniqueOrThrow({where:{userId:participant.id}})).points,1500);assert.equal(await db.taskRun.count({where:{taskId:once.id,userId:participant.id}}),1);
 const repeated=await task('code',{repeatHours:1,completedVisibleHours:0});
 const run=await json<{id:string}>(await request('/tasks/'+repeated.id+'/start','POST',{},participant.cookie),201);
 await json(await request('/tasks/'+repeated.id+'/submit','POST',{runId:run.id,code:await code(repeated.id)},participant.cookie),201);
 await json(await request('/tasks/'+repeated.id+'/claim','POST',{runId:run.id},participant.cookie),201);
 list=await json<Array<{id:string}>>(await request('/tasks?summary=1','GET',undefined,participant.cookie));assert.ok(!list.some(t=>t.id===repeated.id));
 await db.task.update({where:{id:repeated.id},data:{startsAt:new Date(Date.now()-2*3600000)}});
 const reopened=await json<{run:unknown;round:number}>(await request('/tasks/'+repeated.id,'GET',undefined,participant.cookie));assert.equal(reopened.run,null);assert.equal(reopened.round,2);
 const next=await json<{id:string}>(await request('/tasks/'+repeated.id+'/start','POST',{},participant.cookie),201);assert.notEqual(next.id,run.id);
 assert.equal((await db.wallet.findUniqueOrThrow({where:{userId:participant.id}})).points,3000);
});

test("instant verification credits once without admin review and preserves started terms", async()=>{
 const participant=await account('instant-reward@example.test');
 assert.equal((await request('/admin/rewards/tasks','POST',{...taskBody('manual'),autoClaimOnVerification:true},staff.cookie)).status,400);
 assert.equal((await request('/admin/rewards/tasks','POST',{...taskBody('code'),autoClaimOnVerification:true,autoClaimOnApproval:true},staff.cookie)).status,400);
 const created=await task('code',{autoClaimOnVerification:true});
 const run=await json<{id:string}>(await request('/tasks/'+created.id+'/start','POST',{},participant.cookie),201);
 assert.equal((await request('/tasks/'+created.id+'/submit','POST',{code:'invalid',runId:run.id},participant.cookie)).status,400);
 await json(await request('/admin/rewards/tasks/'+created.id,'PATCH',{...taskBody('code'),autoClaimOnVerification:false},staff.cookie));
 const valid=await code(created.id);
 const responses=await Promise.all([request('/tasks/'+created.id+'/submit','POST',{code:valid,runId:run.id},participant.cookie),request('/tasks/'+created.id+'/submit','POST',{code:valid,runId:run.id},participant.cookie)]);
 for(const response of responses)assert.equal((await json<{status:string}>(response,201)).status,'completed');
 assert.equal(await db.ledgerEntry.count({where:{reference:'task:'+run.id}}),1);
 assert.equal((await db.wallet.findUniqueOrThrow({where:{userId:participant.id}})).points,1500);
 const claim=await json<{credited:boolean}>(await request('/tasks/'+created.id+'/claim','POST',{runId:run.id},participant.cookie),201);assert.equal(claim.credited,false);
 const questions=[{id:randomUUID(),prompt:'Do you know this product?',type:'yes_no',options:[]}];
 const survey=await task('manual',{taskType:'survey',surveyQuestions:questions,autoClaimOnVerification:true,rewardPoints:100});
 await json(await request('/tasks/'+survey.id+'/start','POST',{},participant.cookie),201);
 assert.equal((await request('/tasks/'+survey.id+'/submit','POST',{surveyAnswers:[{questionId:questions[0].id,answer:'invalid'}]},participant.cookie)).status,400);
 const result=await json<{status:string}>(await request('/tasks/'+survey.id+'/submit','POST',{surveyAnswers:[{questionId:questions[0].id,answer:'No'}]},participant.cookie),201);assert.equal(result.status,'completed');
 assert.equal((await db.wallet.findUniqueOrThrow({where:{userId:participant.id}})).points,1600);
});

test("bulk task controls are atomic, idempotent and permission protected",async()=>{
 const first=await task();const second=await task();const payload={ids:[first.id,second.id],action:'pause',reason:'Pause these selected test campaigns',requestKey:randomUUID()};
 assert.equal((await request('/admin/rewards/tasks/bulk','POST',payload)).status,403);
 await json(await request('/admin/rewards/tasks/bulk','POST',payload,staff.cookie),201);
 assert.equal(await db.task.count({where:{id:{in:payload.ids},active:false}}),2);
 await json(await request('/admin/rewards/tasks/bulk','POST',payload,staff.cookie),201);
 assert.equal(await db.auditLog.count({where:{id:payload.requestKey}}),1);
 const copy={...payload,action:'duplicate',requestKey:randomUUID()};const result=await json<{createdIds:string[]}>(await request('/admin/rewards/tasks/bulk','POST',copy,staff.cookie),201);assert.equal(result.createdIds.length,2);
 const retry=await json<{createdIds:string[]}>(await request('/admin/rewards/tasks/bulk','POST',copy,staff.cookie),201);assert.deepEqual(retry.createdIds,result.createdIds);
 const scheduled={...payload,action:'reschedule',startsAt:new Date(Date.now()+3600000).toISOString(),repeatHours:24,requestKey:randomUUID()};await json(await request('/admin/rewards/tasks/bulk','POST',scheduled,staff.cookie),201);
 assert.equal((await db.task.findUniqueOrThrow({where:{id:first.id}})).repeatHours,24);
 const started=await task();await json(await request('/tasks/'+started.id+'/start','POST',{}),201);
 assert.equal((await request('/admin/rewards/tasks/bulk','POST',{...scheduled,ids:[first.id,started.id],requestKey:randomUUID()},staff.cookie)).status,400);
 assert.equal((await db.task.findUniqueOrThrow({where:{id:started.id}})).repeatHours,null);
 await json(await request('/admin/rewards/tasks/bulk','POST',{...payload,action:'archive',requestKey:randomUUID()},staff.cookie),201);assert.equal(await db.task.count({where:{id:{in:payload.ids},removedAt:{not:null}}}),2);
});
test("notification inbox shows queues, isolates users and saves read state",async()=>{
 const participant=await account('notification-user@example.test');const other=await account('notification-other@example.test');
 assert.equal((await request('/notifications','GET',undefined,'')).status,401);
 const manual=await task('manual');const run=await json<{id:string}>(await request('/tasks/'+manual.id+'/start','POST',{},participant.cookie),201);
 await json(await request('/tasks/'+manual.id+'/submit','POST',{proof:'A valid submission for the notification review queue'},participant.cookie),201);
 type Inbox={items:Array<{key:string;read:boolean;title:string}>;unread:number};
 let adminFeed=await json<Inbox>(await request('/notifications','GET',undefined,staff.cookie));const alert=adminFeed.items.find(i=>i.key.startsWith('review:'+run.id));assert.ok(alert);assert.equal(alert.read,false);
 await json(await request('/notifications/read','POST',{keys:[alert.key]},staff.cookie),201);
 adminFeed=await json<Inbox>(await request('/notifications','GET',undefined,staff.cookie));assert.equal(adminFeed.items.find(i=>i.key===alert.key)?.read,true);
 await json(await request('/admin/rewards/reviews/'+run.id,'POST',{decision:'approve',reason:'Verified test submission and reward'},staff.cookie),201);
 const userFeed=await json<Inbox>(await request('/notifications','GET',undefined,participant.cookie));const approved=userFeed.items.find(i=>i.key.startsWith('task:'+run.id));assert.ok(approved);
 await json(await request('/notifications/read','POST',{keys:[approved.key]},other.cookie),201);assert.equal(await db.notificationRead.count({where:{userId:other.id,key:approved.key}}),0);
 assert.ok(!(await json<Inbox>(await request('/notifications','GET',undefined,other.cookie))).items.some(i=>i.key===approved.key));
 assert.ok(!(await json<Inbox>(await request('/notifications','GET',undefined,staff.cookie))).items.some(i=>i.key===alert.key));
 await json(await request('/tasks/'+manual.id+'/claim','POST',{},participant.cookie),201);
 await rules({minWithdrawalReferrals:0,minWithdrawalCents:100});
 const payout=await json<{id:string}>(await request('/wallet/withdrawals','POST',{provider:'crypto',asset:'USDT',network:'TRON (TRC20)',address:'T'+'A'.repeat(33),amountCents:100,requestKey:randomUUID()},participant.cookie),201);
 const pendingKey='withdrawal:'+payout.id+':pending';
 assert.ok((await json<Inbox>(await request('/notifications','GET',undefined,staff.cookie))).items.some(i=>i.key===pendingKey));
 await json(await request('/notifications/read','POST',{keys:[pendingKey]},staff.cookie),201);
 await json(await request('/admin/rewards/withdrawals/'+payout.id,'POST',{decision:'approve',reason:'Approved payout for inbox workflow test'},staff.cookie),201);
 const changed=await json<Inbox>(await request('/notifications','GET',undefined,staff.cookie));assert.ok(!changed.items.some(i=>i.key===pendingKey));assert.equal(changed.items.find(i=>i.key==='withdrawal:'+payout.id+':approved')?.read,false);

 const failure=await db.auditLog.create({data:{action:'email.delivery_failed',reason:'SMTP connection test failure'}});
 assert.ok((await json<Inbox>(await request('/notifications','GET',undefined,staff.cookie))).items.some(i=>i.key==='email:'+failure.id));
 assert.ok(!(await json<Inbox>(await request('/notifications','GET',undefined,participant.cookie))).items.some(i=>i.key==='email:'+failure.id));
});
test("SMTP failure creates a safe admin alert without sending mail",async()=>{
 const {env}=await import('../apps/api/src/config.js');const {default:nodemailer}=await import('nodemailer');const {sendAccountEmail}=await import('../apps/api/src/modules/auth/mail.js');
 const original=nodemailer.createTransport;const mode=env.MAIL_MODE;let closed=false;
 try{env.MAIL_MODE='smtp';nodemailer.createTransport=(()=>({sendMail:async()=>{throw Object.assign(new Error('secret token should never be logged'),{code:'EAUTH'});},close:()=>{closed=true;}})) as typeof nodemailer.createTransport;
 await assert.rejects(sendAccountEmail('fake@example.test','Verify test','https://example.test/secret-token'));
 const log=await db.auditLog.findFirstOrThrow({where:{action:'email.delivery_failed'},orderBy:{createdAt:'desc'}});assert.match(log.reason||'',/EAUTH/);assert.ok(!JSON.stringify(log).includes('secret-token'));assert.ok(!JSON.stringify(log).includes('secret token'));assert.equal(closed,true);
 }finally{nodemailer.createTransport=original;env.MAIL_MODE=mode;}
});

test("support chat is private, idempotent and delivers unread notifications",async()=>{
 const owner=await account('chat-owner@example.test');const stranger=await account('chat-stranger@example.test');
 assert.equal((await request('/chat/conversations','GET',undefined,'')).status,401);
 const thread=await json<{id:string}>(await request('/chat/conversations','POST',{},owner.cookie),201);
 const duplicate=await json<{id:string}>(await request('/chat/conversations','POST',{},owner.cookie),201);assert.equal(thread.id,duplicate.id);
 assert.equal((await request('/chat/conversations/'+thread.id+'/messages','GET',undefined,stranger.cookie)).status,404);
 assert.equal((await request('/chat/conversations','POST',{email:owner.email},stranger.cookie)).status,403);
 const payload={body:'Please help with my reward withdrawal.',requestKey:randomUUID()};
 const responses=await Promise.all([request('/chat/conversations/'+thread.id+'/messages','POST',payload,owner.cookie),request('/chat/conversations/'+thread.id+'/messages','POST',payload,owner.cookie)]);
 const messages=await Promise.all(responses.map(r=>json<{id:number}>(r,201)));assert.equal(messages[0].id,messages[1].id);assert.equal(await db.chatMessage.count({where:{conversationId:thread.id}}),1);
 assert.equal((await request('/chat/conversations/'+thread.id+'/messages','POST',{...payload,body:'Changed message'},owner.cookie)).status,409);
 assert.equal((await request('/chat/conversations/'+thread.id+'/messages','POST',{body:' ',requestKey:randomUUID()},owner.cookie)).status,400);
 const staffList=await json<{items:Array<{id:string;unread:number}>}>(await request('/chat/conversations','GET',undefined,staff.cookie));assert.equal(staffList.items.find(t=>t.id===thread.id)?.unread,1);
 const alerts=await json<{items:Array<{key:string}>}>(await request('/notifications','GET',undefined,staff.cookie));assert.ok(alerts.items.some(n=>n.key==='chat:'+messages[0].id));
 await json(await request('/chat/conversations/'+thread.id+'/read','POST',{lastReadId:messages[0].id},staff.cookie),201);
 const receipt=await json<{readThrough:number}>(await request('/chat/conversations/'+thread.id+'/messages','GET',undefined,owner.cookie));assert.equal(receipt.readThrough,messages[0].id);
 const reply=await json<{id:number;fromStaff:boolean}>(await request('/chat/conversations/'+thread.id+'/messages','POST',{body:'We are checking your request now.',requestKey:randomUUID()},staff.cookie),201);assert.equal(reply.fromStaff,true);
 const userAlerts=await json<{items:Array<{key:string}>}>(await request('/notifications','GET',undefined,owner.cookie));assert.ok(userAlerts.items.some(n=>n.key==='chat:'+reply.id));
 const otherThread=await json<{id:string}>(await request('/chat/conversations','POST',{},stranger.cookie),201);
 assert.equal((await request('/chat/conversations/'+otherThread.id+'/read','POST',{lastReadId:reply.id},stranger.cookie)).status,400);
 await json(await request('/chat/conversations/'+thread.id+'/read','POST',{lastReadId:reply.id},owner.cookie),201);
 await json(await request('/chat/conversations/'+thread.id+'/read','POST',{lastReadId:messages[0].id},owner.cookie),201);
 assert.equal((await db.chatRead.findUniqueOrThrow({where:{conversationId_userId:{conversationId:thread.id,userId:owner.id}}})).lastReadId,reply.id);
 const cleared=await json<{items:Array<{key:string}>}>(await request('/notifications','GET',undefined,owner.cookie));assert.ok(!cleared.items.some(n=>n.key==='chat:'+reply.id));
});

test("task covers and promotions keep feeds lightweight and enforce access",async()=>{
 const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
 const created=await task('code',{coverImage:image,featured:true});
 const feed=await json<Array<{id:string;coverImage?:string;coverImageUrl:string;featured:boolean}>>(await request('/tasks?summary=1'));const card=feed.find(t=>t.id===created.id)!;assert.equal(card.coverImage,undefined);assert.equal(card.featured,true);assert.ok(card.coverImageUrl.includes('/cover'));
 const cover=await request('/tasks/'+created.id+'/cover');assert.equal(cover.status,200);assert.ok((cover.headers.get('content-type')||'').includes('image/png'));
 const premium=await task('code',{coverImage:image,requiresMembership:true});assert.equal((await request('/tasks/'+premium.id+'/cover')).status,404);assert.equal((await request('/tasks/'+created.id+'/cover','GET',undefined,'')).status,401);
 const payload={title:'Test banner campaign',description:'A promotion for our membership plans.',image,destination:'/membership',placement:'banner',active:true,startsAt:new Date(Date.now()-60000).toISOString(),endsAt:null};
 assert.equal((await request('/admin/promotions','POST',payload)).status,403);
 assert.equal((await request('/admin/promotions','POST',{...payload,destination:'javascript:alert(1)'},staff.cookie)).status,400);
 const promo=await json<{id:string}>(await request('/admin/promotions','POST',payload,staff.cookie),201);
 let publicFeed=await json<Array<{id:string;image?:string;imageUrl:string}>>(await request('/promotions'));assert.ok(publicFeed.some(p=>p.id===promo.id));assert.equal(publicFeed.find(p=>p.id===promo.id)?.image,undefined);
 assert.equal((await request('/promotions/'+promo.id+'/image')).status,200);
 await json(await request('/admin/promotions/'+promo.id,'PUT',{...payload,active:false},staff.cookie));
 publicFeed=await json<Array<{id:string;imageUrl:string}>>(await request('/promotions'));assert.ok(!publicFeed.some(p=>p.id===promo.id));assert.equal((await request('/promotions/'+promo.id+'/image')).status,404);
 await json(await request('/admin/promotions/'+promo.id,'DELETE',undefined,staff.cookie));assert.equal(await db.promotion.count({where:{id:promo.id}}),0);
});

test("payment mobile numbers persist, validate and protect retries", async () => {
 await db.paymentMethod.update({where:{provider:"crypto_usdt"},data:{enabled:true,recipient:"T"+"A".repeat(33),instructions:"Send exact USDT amount",network:"TRON (TRC20)",usdRateCents:100,minimumCents:100,maximumCents:100000}});
 await db.wallet.upsert({where:{userId:user.id},create:{userId:user.id,points:100000},update:{points:100000,reservedPoints:0}});
 await rules({minWithdrawalCents:100,minWithdrawalReferrals:0});
 const common={provider:"crypto",asset:"USDT",amountCents:100,mobileNumber:"+971 (50) 123-4567"};
 for(const [route,extra] of [["/payments/deposits",{}],["/wallet/withdrawals",{network:"TRON (TRC20)",address:"T"+"A".repeat(33)}]] as const){
  const payload={...common,...extra,requestKey:randomUUID()};
  assert.equal((await request(route,"POST",{...payload,mobileNumber:"abc"})).status,400);
  const saved=await json<{id:string;mobileNumber:string}>(await request(route,"POST",payload),201);
  assert.equal(saved.mobileNumber,"+971501234567");
  const retry=await json<{id:string}>(await request(route,"POST",payload),201);assert.equal(retry.id,saved.id);
  assert.equal((await request(route,"POST",{...payload,mobileNumber:"+971501234568"})).status,409);
  const stored=route.includes("deposits")?await db.deposit.findUniqueOrThrow({where:{id:saved.id}}):await db.withdrawal.findUniqueOrThrow({where:{id:saved.id}});
  assert.equal(stored.mobileNumber,"+971501234567");
 }
});

test("Mobile Money admin setup and local-number deposit approval", async () => {
 const priorBalance = (await db.wallet.findUniqueOrThrow({where:{userId:user.id}})).depositCents;
 const config={label:"Mobile Money",enabled:true,recipient:"0501234567",network:"MTN MoMo",instructions:"Pay in USD to Test Account and upload your receipt.",minimumCents:100,maximumCents:100000,reason:"Configure mobile money for deposit testing"};
 assert.equal((await request('/admin/payments/methods/mobile_money','PATCH',config)).status,403);
 await json(await request('/admin/payments/methods/mobile_money','PATCH',config,staff.cookie));
 const methods=await json<Array<{provider:string}>>(await request('/payments/methods'));assert.ok(methods.some(m=>m.provider==='mobile_money'));
 const saved=await json<{id:string;recipient:string;network:string;mobileNumber:string}>(await request('/payments/deposits','POST',{provider:'mobile_money',amountCents:100,mobileNumber:'071 234 5678',requestKey:randomUUID()}),201);
 assert.equal(saved.recipient,'0501234567');assert.equal(saved.network,'MTN MoMo');assert.equal(saved.mobileNumber,'0712345678');
 assert.equal((await request('/payments/deposits/'+saved.id+'/proof','POST',{paymentReference:'MOMO-001'})).status,400);
 await json(await request('/payments/deposits/'+saved.id+'/proof','POST',{paymentReference:'MOMO-001',proofImage:'data:image/png;base64,iVBORw0KGgo='}),201);
 await json(await request('/admin/payments/deposits/'+saved.id+'/review','POST',{decision:'approve',confirmedAmountCents:100,reason:'Confirmed payment in mobile money account'},staff.cookie),201);
 assert.equal((await db.deposit.findUniqueOrThrow({where:{id:saved.id}})).status,'completed');
 assert.equal((await db.wallet.findUniqueOrThrow({where:{userId:user.id}})).depositCents,priorBalance+100);
 const control=await json<{items:Array<{id:string}>}>(await request('/admin/payments?channel=mobile_money&status=all','GET',undefined,staff.cookie));assert.ok(control.items.some(d=>d.id===saved.id));
});

test("admin switches stop new deposits and withdrawals while preserving records", async () => {
  const method = { label:"USDT", enabled:true, recipient:"T"+"A".repeat(33), network:"TRON (TRC20)", usdRateCents:100, instructions:"Send the exact amount on TRC20", minimumCents:100, maximumCents:100000, reason:"Enable USDT for availability test" };
  await json(await request('/admin/payments/methods/crypto_usdt','PATCH',method,staff.cookie));
  await json(await request('/admin/users/'+user.id+'/adjustment','POST',{source:'points',delta:3000,requestKey:randomUUID(),reason:'Provide reward funds for availability test'},staff.cookie),201);
  const deposit={provider:'crypto',asset:'USDT',amountCents:100,mobileNumber:'0501234567',requestKey:randomUUID()};
  const withdrawal={provider:'crypto',asset:'USDT',network:'TRON (TRC20)',address:'T'+'A'.repeat(33),amountCents:100,requestKey:randomUUID()};
  assert.equal((await request('/admin/payments/availability','PATCH',{depositsEnabled:false,reason:'Unauthorized attempt to disable deposits'})).status,403);
  await json(await request('/admin/payments/availability','PATCH',{depositsEnabled:false,withdrawalsEnabled:false,reason:'Pause new payment requests for testing'},staff.cookie));
  assert.deepEqual(await json(await request('/payments/methods')),[]);
  assert.equal((await request('/payments/deposits','POST',deposit)).status,400);
  const wallet=await json<{eligible:boolean;eligibilityReason:string}>(await request('/wallet'));
  assert.equal(wallet.eligible,false);assert.match(wallet.eligibilityReason,/disabled/);
  assert.equal((await request('/wallet/withdrawals','POST',withdrawal)).status,400);
  const admin=await json<{availability:{depositsEnabled:boolean;withdrawalsEnabled:boolean}}>(await request('/admin/payments?status=all','GET',undefined,staff.cookie));
  assert.equal(admin.availability.depositsEnabled,false);assert.equal(admin.availability.withdrawalsEnabled,false);
  await json(await request('/admin/payments/availability','PATCH',{depositsEnabled:true,withdrawalsEnabled:true,reason:'Resume new payment requests after testing'},staff.cookie));
  assert.ok((await json<Array<unknown>>(await request('/payments/methods'))).length);
  await json(await request('/payments/deposits','POST',deposit),201);
  await json(await request('/wallet/withdrawals','POST',withdrawal),201);
});

test("new members can complete tasks before verifying email but cannot withdraw yet", async () => {
  const email = "unverified-worker@example.test";
  await json(await request("/auth/sign-up/email", "POST", { name: "Unverified Worker", email, password }, ""));
  const login = await request("/auth/sign-in/email", "POST", { email, password }, "");
  assert.equal(login.status, 200, await login.clone().text());
  const memberCookie = login.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  const item = await task("code");
  await complete(item.id, memberCookie);
  const balance = await json<{ points: number; eligible: boolean; eligibilityReason: string }>(await request("/wallet", "GET", undefined, memberCookie));
  assert.equal(balance.points, 1500);
  assert.equal(balance.eligible, false);
  assert.match(balance.eligibilityReason, /verify your email/i);
  const payout = { provider: "crypto", asset: "USDT", network: "TRON (TRC20)", address: "T" + "A".repeat(33), amountCents: 100, requestKey: randomUUID() };
  assert.equal((await request("/wallet/withdrawals", "POST", payout, memberCookie)).status, 400);
  await json(await request("/auth/send-verification-email", "POST", { email }, memberCookie));
  let otp = "";
  for (const name of (await readdir(mailPath)).sort().reverse()) {
    const item = JSON.parse(await readFile(resolve(mailPath, name), "utf8"));
    if (item.to === email && item.subject.includes("Verify")) { otp = item.otp; break; }
  }
  assert.match(otp, /^[0-9]{6}$/);
  await json(await request("/auth/email-otp/verify-email", "POST", { email, otp }, memberCookie));
  assert.equal((await json<{ eligible: boolean }>(await request("/wallet", "GET", undefined, memberCookie))).eligible, true);
  await json(await request("/wallet/withdrawals", "POST", payout, memberCookie), 201);
});
test("a referred member who finishes tasks before email confirmation qualifies on verification", async () => {
  await rules({ referralRequiredTasks: 1, referralRewardPoints: 700 });
  const email = "verify-later-referral@example.test";
  await json(await request("/auth/sign-up/email", "POST", { name: "Verify Later", email, password, signupReferralCode: user.referralCode }, ""));
  const login = await request("/auth/sign-in/email", "POST", { email, password }, "");
  const memberCookie = login.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  assert.equal(login.status, 200);
  await complete((await task("code")).id, memberCookie);
  const member = await db.user.findUniqueOrThrow({ where: { email } });
  assert.equal((await db.referral.findUniqueOrThrow({ where: { inviteeId: member.id } })).qualifiedAt, null);
  await json(await request("/auth/send-verification-email", "POST", { email }, ""));
  const otp = JSON.parse(await readFile(resolve(mailPath, (await readdir(mailPath)).sort().reverse()[0]), "utf8")).otp;
  await json(await request("/auth/email-otp/verify-email", "POST", { email, otp }, ""));
  assert.ok((await db.referral.findUniqueOrThrow({ where: { inviteeId: member.id } })).qualifiedAt);
});
test("shared task screenshots are flagged for admin review without exposing the image", async () => {
  const first = await account("shared-proof-first@example.test");
  const second = await account("shared-proof-second@example.test");
  const item = await task("manual");
  const image = "data:image/png;base64,iVBORw0KGgo=";
  for (const participant of [first, second]) {
    const run = await json<{ id: string }>(await request(`/tasks/${item.id}/start`, "POST", {}, participant.cookie), 201);
    await json(await request(`/tasks/${item.id}/submit`, "POST", { runId: run.id, proofImage: image }, participant.cookie), 201);
  }
  const flags = await db.auditLog.findMany({ where: { action: "task.shared_proof_flagged" } });
  assert.ok(flags.length > 0);
  const alerts = await json<{ items: Array<{ key: string }> }>(await request("/notifications", "GET", undefined, staff.cookie));
  assert.ok(alerts.items.some(item => item.key.startsWith("task-risk:")));
});
