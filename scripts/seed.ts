import { db } from "../apps/api/src/database.js";

const definitions: Record<string, { name: string; permissions: string[] }> = {
  user: { name: "User", permissions: ["profile.manage"] },
  admin: { name: "Admin", permissions: ["profile.manage", "users.read", "users.manage", "audit.read", "rewards.manage"] },
  super_admin: { name: "Super Admin", permissions: ["profile.manage", "users.read", "users.manage", "audit.read", "rewards.manage", "roles.manage", "settings.finance.manage"] },
};
for (const [key, definition] of Object.entries(definitions)) {
  const role = await db.role.upsert({ where: { key }, create: { key, name: definition.name }, update: {} });
  for (const key of definition.permissions) {
    const permission = await db.permission.upsert({ where: { key }, create: { key }, update: {} });
    await db.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } }, create: { roleId: role.id, permissionId: permission.id }, update: {} });
  }
}
console.log("Seeded roles and permissions. No staff credentials were created.");
await db.$disconnect();
