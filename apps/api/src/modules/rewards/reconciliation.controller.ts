import { Controller, Get, NotFoundException, Param, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { db } from "../../database.js";
import { requireUser } from "../permissions/access.js";
import { validate } from "./rewards.controller.js";

const pageNumber = (input = "1") => Math.max(1, Math.min(10000, Math.floor(Number(input) || 1)));
const kindSchema = z.enum(["deposits", "withdrawals"]);
type Expected = { reference: string; kind: string; points: number; reservedPoints: number; depositCents: number; reservedDepositCents: number };

function expectations(item: { id: string; status: string; amountCents: number; userId: string; source?: string; points?: number }, kind: "deposits" | "withdrawals"): Expected[] {
  if (kind === "deposits") return item.status === "completed" ? [{ reference: `deposit:${item.id}`, kind: "deposit_credit", points: 0, reservedPoints: 0, depositCents: item.amountCents, reservedDepositCents: 0 }] : [];
  const fromPoints = item.source !== "deposit";
  const points = item.points || 0;
  const result: Expected[] = [{ reference: `hold:${item.id}`, kind: "withdrawal_hold", points: 0, reservedPoints: fromPoints ? points : 0, depositCents: 0, reservedDepositCents: fromPoints ? 0 : item.amountCents }];
  if (["rejected", "cancelled"].includes(item.status)) result.push({ reference: `release:${item.id}`, kind: "withdrawal_release", points: 0, reservedPoints: fromPoints ? -points : 0, depositCents: 0, reservedDepositCents: fromPoints ? 0 : -item.amountCents });
  if (item.status === "paid") result.push({ reference: `paid:${item.id}`, kind: "withdrawal_paid", points: fromPoints ? -points : 0, reservedPoints: fromPoints ? -points : 0, depositCents: fromPoints ? 0 : -item.amountCents, reservedDepositCents: fromPoints ? 0 : -item.amountCents });
  return result;
}

function check(item: { id: string; userId: string; status: string; amountCents: number; source?: string; points?: number }, kind: "deposits" | "withdrawals", entries: { reference: string; userId: string; kind: string; points: number; reservedPoints: number; depositCents: number; reservedDepositCents: number }[]) {
  const expected = expectations(item, kind);
  const actual = entries.filter(entry => ["deposit:", "hold:", "release:", "paid:"].some(prefix => entry.reference === `${prefix}${item.id}`));
  const issues = expected.flatMap(row => {
    const found = actual.find(entry => entry.reference === row.reference);
    if (!found) return [`Missing ledger entry ${row.reference}`];
    return found.userId === item.userId && found.kind === row.kind && found.points === row.points && found.reservedPoints === row.reservedPoints && found.depositCents === row.depositCents && found.reservedDepositCents === row.reservedDepositCents ? [] : [`Ledger amount or owner differs for ${row.reference}`];
  });
  for (const entry of actual) if (!expected.some(row => row.reference === entry.reference)) issues.push(`Unexpected ledger entry ${entry.reference}`);
  return { matched: issues.length === 0, issues, expectedReferences: expected.map(row => row.reference), ledger: actual };
}

@Controller("api/v1/admin/reconciliation")
export class ReconciliationController {
  @Get()
  async list(@Req() req: Request, @Query("kind") rawKind = "deposits", @Query("page") input = "1", @Query("search") search = "") {
    await requireUser(req, "rewards.manage");
    const kind = validate(kindSchema, rawKind);
    const page = pageNumber(input);
    const term = search.trim().slice(0, 100);
    const filter = term ? { OR: [{ id: { contains: term, mode: "insensitive" as const } }, { user: { is: { OR: [{ name: { contains: term, mode: "insensitive" as const } }, { email: { contains: term, mode: "insensitive" as const } }] } } }] } : {};
    if (kind === "deposits") {
      const [items, total] = await db.$transaction([
        db.deposit.findMany({ where: filter, select: { id: true, userId: true, status: true, amountCents: true, provider: true, asset: true, paymentReference: true, submittedAt: true, reviewedAt: true, createdAt: true, proof: true, reviewReason: true, user: { select: { name: true, email: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * 20, take: 20 }),
        db.deposit.count({ where: filter }),
      ]);
      const ledger = await db.ledgerEntry.findMany({ where: { reference: { in: items.flatMap(item => ["deposit:", "hold:", "release:", "paid:"].map(prefix => `${prefix}${item.id}`)) } }, select: { reference: true, userId: true, kind: true, points: true, reservedPoints: true, depositCents: true, reservedDepositCents: true, createdAt: true } });
      return { items: items.map(item => ({ ...item, ...check(item, kind, ledger) })), total, page, pageSize: 20 };
    }
    const [items, total] = await db.$transaction([
      db.withdrawal.findMany({ where: filter, select: { id: true, userId: true, status: true, amountCents: true, source: true, points: true, provider: true, destination: true, paymentReference: true, reason: true, createdAt: true, user: { select: { name: true, email: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * 20, take: 20 }),
      db.withdrawal.count({ where: filter }),
    ]);
    const ledger = await db.ledgerEntry.findMany({ where: { reference: { in: items.flatMap(item => ["deposit:", "hold:", "release:", "paid:"].map(prefix => `${prefix}${item.id}`)) } }, select: { reference: true, userId: true, kind: true, points: true, reservedPoints: true, depositCents: true, reservedDepositCents: true, createdAt: true } });
    return { items: items.map(item => ({ ...item, ...check(item, kind, ledger) })), total, page, pageSize: 20 };
  }

  @Get(":kind/:id")
  async detail(@Req() req: Request, @Param("kind") rawKind: string, @Param("id") id: string) {
    await requireUser(req, "rewards.manage");
    const kind = validate(kindSchema, rawKind);
    const item = kind === "deposits" ? await db.deposit.findUnique({ where: { id }, include: { user: { select: { name: true, email: true } } } }) : await db.withdrawal.findUnique({ where: { id }, include: { user: { select: { name: true, email: true } } } });
    if (!item) throw new NotFoundException("Payment record not found.");
    const [ledger, audit] = await db.$transaction([
      db.ledgerEntry.findMany({ where: { reference: { in: ["deposit:", "hold:", "release:", "paid:"].map(prefix => `${prefix}${id}`) } }, orderBy: { createdAt: "asc" } }),
      db.auditLog.findMany({ where: { targetId: id }, select: { id: true, action: true, actorId: true, reason: true, createdAt: true }, orderBy: { createdAt: "asc" } }),
    ]);
    return { item, ...check(item, kind, ledger), audit };
  }
}
