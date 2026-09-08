import { db } from "../apps/api/src/database.js";

const email = process.argv[2]?.trim().toLowerCase();
if (!email) throw new Error("Usage: npx tsx scripts/promote-admin.ts user@example.com");
const user = await db.user.findUniqueOrThrow({ where: { email } });
if (!user.emailVerified || user.status !== "active") throw new Error("The account must be active and email verified.");
const role = await db.role.findUniqueOrThrow({ where: { key: "super_admin" } });
await db.$transaction([
  db.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: role.id } }, create: { userId: user.id, roleId: role.id }, update: {} }),
  db.auditLog.create({ data: { action: "role.bootstrap_super_admin", targetId: user.id, reason: "Explicit operator bootstrap command" } }),
]);
console.log("Super Admin role assigned to the verified account.");
await db.$disconnect();
