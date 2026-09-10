import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import type { Prisma } from "../../../../../packages/database/generated/client.js";
import { db } from "../../database.js";
import { requireUser } from "../permissions/access.js";
import { activeUser, postDepositLedger, rewardTransaction, throttle } from "./service.js";
import { validate } from "./rewards.controller.js";
import { cryptoAssets, quoteCrypto, validateCryptoMethod } from "./crypto.js";

const providerSchema = z.enum(["paypal", "crypto", "bank"]);
const reasonSchema = z.string().trim().min(10).max(500);
const getPage = (page = "1") => Math.max(1, Math.min(10000, Math.floor(Number(page) || 1)));

@Controller("api/v1")
export class PaymentsController {
  @Get("payments/methods")
  async methods(@Req() req: Request) {
    await requireUser(req);
    return db.paymentMethod.findMany({ where: { enabled: true }, orderBy: { provider: "asc" } });
  }

  @Get("payments/deposits")
  async deposits(@Req() req: Request, @Query("page") input?: string) {
    const { user } = await requireUser(req); const page = getPage(input);
    const [items, total, deposited] = await db.$transaction([
      db.deposit.findMany({ where: { userId: user.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 20, take: 20 }),
      db.deposit.count({ where: { userId: user.id } }),
      db.deposit.aggregate({ where: { userId: user.id, status: "completed" }, _sum: { amountCents: true } }),
    ]);
    return { items, total, page, pageSize: 20, totalDepositedCents: deposited._sum.amountCents || 0 };
  }

  @Post("payments/deposits")
  async create(@Req() req: Request, @Body() body: unknown) {
    const { user } = await requireUser(req); await throttle(user.id, "deposit_create", 10);
    const data = validate(z.object({ provider: providerSchema, asset: z.enum(cryptoAssets).optional(), amountCents: z.number().int().min(1).max(1000000), requestKey: z.string().uuid() }).strict().refine(v => v.provider === "crypto" ? !!v.asset : !v.asset, "Select USDT, BTC, or ETH for crypto deposits only"), body);
    return rewardTransaction(async tx => {
      await activeUser(tx, user.id);
      const existing = await tx.deposit.findUnique({ where: { userId_requestKey: { userId: user.id, requestKey: data.requestKey } } });
      if (existing) {
        if (existing.provider !== data.provider || existing.amountCents !== data.amountCents || existing.asset !== (data.asset || null)) throw new ConflictException("This request key belongs to a different deposit.");
        return existing;
      }
      const method = await tx.paymentMethod.findUnique({ where: { provider: data.asset ? `crypto_${data.asset.toLowerCase()}` : data.provider } });
      if (!method?.enabled || !method.recipient || !method.instructions) throw new BadRequestException("This deposit method is not currently available.");
      if (data.amountCents < method.minimumCents || data.amountCents > method.maximumCents) throw new BadRequestException("The amount is outside this payment method's deposit limits.");
      if (data.asset) validateCryptoMethod(method.provider, method.network, method.recipient, method.usdRateCents);
      const deposit = await tx.deposit.create({ data: { userId: user.id, ...data, ...(data.asset ? { network: method.network, usdRateCents: method.usdRateCents, cryptoAmount: quoteCrypto(data.amountCents, method.usdRateCents, data.asset) } : {}), methodLabel: method.label, recipient: method.recipient, instructions: method.instructions } });
      await tx.auditLog.create({ data: { actorId: user.id, targetId: deposit.id, action: "deposit.created", detail: { amountCents: data.amountCents, provider: data.provider } } });
      return deposit;
    });
  }

  @Post("payments/deposits/:id/proof")
  async proof(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) {
    const { user } = await requireUser(req); await throttle(user.id, "deposit_proof", 10);
    const data = validate(z.object({ paymentReference: z.string().trim().min(5).max(160), proof: z.string().trim().min(10).max(4000) }).strict(), body);
    return rewardTransaction(async tx => {
      await activeUser(tx, user.id);
      const deposit = await tx.deposit.findUnique({ where: { id } });
      if (!deposit || deposit.userId !== user.id) throw new NotFoundException("Deposit not found.");
      if (deposit.asset && !/^(0x)?[a-f0-9]{64}$/i.test(data.paymentReference)) throw new BadRequestException("Enter the full transaction hash for this crypto payment.");
      // PayPal/bank references are case-insensitive; preserve case for non-hex crypto IDs.
      data.paymentReference = deposit.provider === "crypto"
        ? (/^(0x)?[a-f0-9]{64}$/i.test(data.paymentReference) ? data.paymentReference.replace(/^0x/i, "").toLowerCase() : data.paymentReference)
        : data.paymentReference.toUpperCase();
      if (deposit.paymentReference && deposit.paymentReference !== data.paymentReference) throw new BadRequestException("The payment reference stays attached to this request. Resubmit proof for the original payment.");
      if (["pending_review", "completed"].includes(deposit.status)) return deposit;
      if (!["awaiting_payment", "rejected"].includes(deposit.status)) throw new BadRequestException("This deposit no longer accepts proof.");
      // Retain receipt ownership even after rejection so it cannot fund a second account.
      const used = await tx.deposit.findUnique({ where: { provider_paymentReference: { provider: deposit.provider, paymentReference: data.paymentReference } } });
      if (used && used.id !== id) throw new ConflictException("This payment reference has already been submitted.");
      const updated = await tx.deposit.update({ where: { id }, data: { ...data, status: "pending_review", submittedAt: new Date(), reviewReason: null, reviewedAt: null } });
      await tx.auditLog.create({ data: { actorId: user.id, targetId: id, action: "deposit.proof_submitted" } });
      return updated;
    });
  }

  @Post("payments/deposits/:id/cancel")
  async cancel(@Req() req: Request, @Param("id") id: string) {
    const { user } = await requireUser(req); await throttle(user.id, "deposit_cancel", 10);
    return rewardTransaction(async tx => {
      await activeUser(tx, user.id);
      const deposit = await tx.deposit.findUnique({ where: { id } });
      if (!deposit || deposit.userId !== user.id) throw new NotFoundException("Deposit not found.");
      if (deposit.status === "cancelled") return deposit;
      if (deposit.status !== "awaiting_payment") throw new BadRequestException("Only an unpaid request without submitted proof can be cancelled.");
      const updated = await tx.deposit.update({ where: { id }, data: { status: "cancelled" } });
      await tx.auditLog.create({ data: { actorId: user.id, targetId: id, action: "deposit.cancelled" } });
      return updated;
    });
  }

  @Get("admin/payments")
  async admin(@Req() req: Request, @Query("page") input?: string, @Query("status") status?: string, @Query("search") search = "", @Query("channel") channel = "all") {
    await requireUser(req, "rewards.manage"); const page = getPage(input);
    const filter = validate(z.enum(["all", "awaiting_payment", "pending_review", "completed", "rejected", "cancelled"]).default("pending_review"), status);
    const paymentChannel = validate(z.enum(["all", "USDT", "BTC", "ETH", "bank", "paypal"]), channel);
    const term = search.trim().slice(0, 100);
    const where: Prisma.DepositWhereInput = {
      ...(filter === "all" ? {} : { status: filter }),
      ...(paymentChannel === "all" ? {} : ["USDT", "BTC", "ETH"].includes(paymentChannel) ? { asset: paymentChannel } : { provider: paymentChannel }),
      ...(term ? { OR: [{ id: { contains: term, mode: "insensitive" } }, { paymentReference: { contains: term, mode: "insensitive" } }, { user: { is: { OR: [{ name: { contains: term, mode: "insensitive" } }, { email: { contains: term, mode: "insensitive" } }] } } }] } : {}),
    };
    const [methods, items, total, completed, pending, awaiting, rejected, pendingAmount, openWithdrawals, openWithdrawalAmount, paidWithdrawals, balances] = await db.$transaction([
      db.paymentMethod.findMany({ where: { provider: { not: "crypto" } }, orderBy: { provider: "asc" } }),
      db.deposit.findMany({ where, include: { user: { select: { name: true, email: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 20, take: 20 }),
      db.deposit.count({ where }),
      db.deposit.aggregate({ where: { status: "completed" }, _sum: { amountCents: true } }),
      db.deposit.count({ where: { status: "pending_review" } }),
      db.deposit.count({ where: { status: "awaiting_payment" } }),
      db.deposit.count({ where: { status: "rejected" } }),
      db.deposit.aggregate({ where: { status: "pending_review" }, _sum: { amountCents: true } }),
      db.withdrawal.count({ where: { status: { in: ["pending", "approved"] } } }),
      db.withdrawal.aggregate({ where: { status: { in: ["pending", "approved"] } }, _sum: { amountCents: true } }),
      db.withdrawal.aggregate({ where: { status: "paid" }, _sum: { amountCents: true } }),
      db.wallet.aggregate({ _sum: { depositCents: true, reservedDepositCents: true } }),
    ]);
    return { methods, items, total, page, pageSize: 20, completedCents: completed._sum.amountCents || 0, pending, metrics: { pendingDepositCount: pending, pendingDepositCents: pendingAmount._sum.amountCents || 0, awaitingPaymentCount: awaiting, rejectedDepositCount: rejected, openWithdrawalCount: openWithdrawals, openWithdrawalCents: openWithdrawalAmount._sum.amountCents || 0, paidWithdrawalCents: paidWithdrawals._sum.amountCents || 0, userDepositCents: balances._sum.depositCents || 0, reservedDepositCents: balances._sum.reservedDepositCents || 0, enabledMethodCount: methods.filter(m => m.enabled).length } };
  }

  @Get("admin/payments/withdrawals")
  async withdrawalHistory(@Req() req: Request, @Query("page") input = "1", @Query("status") status = "all", @Query("search") search = "") {
    await requireUser(req, "rewards.manage"); const page = getPage(input);
    const filter = validate(z.enum(["all", "pending", "approved", "paid", "rejected"]), status);
    const term = search.trim().slice(0, 100);
    const where: Prisma.WithdrawalWhereInput = { ...(filter === "all" ? {} : { status: filter }), ...(term ? { OR: [{ id: { contains: term, mode: "insensitive" } }, { paymentReference: { contains: term, mode: "insensitive" } }, { user: { is: { OR: [{ name: { contains: term, mode: "insensitive" } }, { email: { contains: term, mode: "insensitive" } }] } } }] } : {}) };
    const [items, total] = await db.$transaction([db.withdrawal.findMany({ where, include: { user: { select: { id: true, name: true, email: true, withdrawalEligible: true, status: true, emailVerified: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 20, take: 20 }), db.withdrawal.count({ where })]);
    return { items, total, page, pageSize: 20 };
  }

  @Patch("admin/payments/methods/:provider")
  async method(@Req() req: Request, @Param("provider") provider: string, @Body() body: unknown) {
    const { user } = await requireUser(req, "rewards.manage");
    const key = validate(z.enum(["paypal", "bank", "crypto_usdt", "crypto_btc", "crypto_eth"]), provider);
    const { reason, ...data } = validate(z.object({ network: z.string().trim().max(80).default(""), usdRateCents: z.number().int().min(0).max(2147483647).default(0), label: z.string().trim().min(3).max(80), enabled: z.boolean(), recipient: z.string().trim().max(1000), instructions: z.string().trim().max(4000), minimumCents: z.number().int().min(1).max(1000000), maximumCents: z.number().int().min(1).max(1000000), reason: reasonSchema }).strict().refine(v => v.maximumCents >= v.minimumCents, "Maximum must be at least the minimum").refine(v => !v.enabled || (v.recipient.length >= 5 && v.instructions.length >= 10), "Configure receiving details and instructions before enabling deposits"), body);
    return rewardTransaction(async tx => {
      if (key.startsWith("crypto_") && data.enabled) validateCryptoMethod(key, data.network, data.recipient, data.usdRateCents);
      const previous = await tx.paymentMethod.findUnique({ where: { provider: key } });
      const updated = await tx.paymentMethod.upsert({ where: { provider: key }, create: { provider: key, ...data }, update: data });
      await tx.auditLog.create({ data: { actorId: user.id, action: "payment.method_changed", targetId: key, reason, detail: { recipient: data.recipient, previousRecipient: previous?.recipient || null, network: data.network, usdRateCents: data.usdRateCents, enabled: data.enabled, label: data.label, minimumCents: data.minimumCents, maximumCents: data.maximumCents } } });
      return updated;
    });
  }

  @Post("admin/payments/deposits/:id/review")
  async review(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) {
    const { user } = await requireUser(req, "rewards.manage");
    const data = validate(z.object({ decision: z.enum(["approve", "reject"]), reason: reasonSchema, confirmedAmountCents: z.number().int().min(1).max(1000000).optional() }).strict(), body);
    return rewardTransaction(async tx => {
      const deposit = await tx.deposit.findUnique({ where: { id } });
      if (!deposit) throw new NotFoundException("Deposit not found.");
      if (deposit.userId === user.id) throw new BadRequestException("Another administrator must review your deposit.");
      if (deposit.status === "completed" && data.decision === "approve") return { deposit, credited: false };
      if (deposit.status !== "pending_review") throw new BadRequestException("This deposit is not awaiting review.");
      if (data.decision === "approve") {
        if (data.confirmedAmountCents !== deposit.amountCents) throw new BadRequestException("Confirm the exact requested USD amount was received. Reject mismatched or unverified payments.");
        await postDepositLedger(tx, deposit.userId, "deposit_credit", deposit.amountCents, 0, `deposit:${id}`, `Confirmed ${deposit.methodLabel} deposit`);
      }
      const updated = await tx.deposit.update({ where: { id }, data: { status: data.decision === "approve" ? "completed" : "rejected", reviewReason: data.reason, reviewedAt: new Date() } });
      await tx.auditLog.create({ data: { actorId: user.id, targetId: id, action: `deposit.${updated.status}`, reason: data.reason, detail: { amountCents: deposit.amountCents, provider: deposit.provider } } });
      return { deposit: updated, credited: data.decision === "approve" };
    });
  }
}
