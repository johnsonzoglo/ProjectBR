import { mobileNumberSchema } from "./mobile-number.js";
import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import type { Prisma } from "../../../../../packages/database/generated/client.js";
import { db } from "../../database.js";
import { requireRecentStaffAuth, requireUser } from "../permissions/access.js";
import { activeUser, postDepositLedger, rewardTransaction, throttle } from "./service.js";
import { validate } from "./rewards.controller.js";
import { sendUserUpdateEmail } from "../auth/mail.js";
import { env } from "../../config.js";
import { cryptoAssets, quoteCrypto, validateCryptoMethod, validateCryptoTransaction } from "./crypto.js";

const providerSchema = z.enum(["crypto", "mobile_money"]);
const reasonSchema = z.string().trim().min(10).max(500);
const proofImageSchema = z.string().max(2800000).regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, "Upload a JPG, PNG, or WebP receipt under 2 MB");
const getPage = (page = "1") => Math.max(1, Math.min(10000, Math.floor(Number(page) || 1)));

@Controller("api/v1")
export class PaymentsController {
  @Get("payments/methods")
  async methods(@Req() req: Request) {
    await requireUser(req);
    const availability = await db.rewardSettings.findUnique({ where: { id: "default" }, select: { depositsEnabled: true } });
    if (availability?.depositsEnabled === false) return [];
    return db.paymentMethod.findMany({ where: { enabled: true, provider: { in: ["crypto_usdt", "crypto_btc", "crypto_eth", "mobile_money"] } }, orderBy: { provider: "asc" } });
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
    const data = validate(z.object({ provider: providerSchema, asset: z.enum(cryptoAssets).optional(), mobileNumber: mobileNumberSchema, amountCents: z.number().int().min(1).max(1000000), requestKey: z.string().uuid() }).strict().refine(v => v.provider === "crypto" ? !!v.asset : !v.asset, "Select USDT, BTC, or ETH for crypto deposits only"), body);
    return rewardTransaction(async tx => {
      await activeUser(tx, user.id);
      const availability = await tx.rewardSettings.findUnique({ where: { id: "default" }, select: { depositsEnabled: true } });
      if (availability?.depositsEnabled === false) throw new BadRequestException("New deposits are temporarily disabled.");
      const existing = await tx.deposit.findUnique({ where: { userId_requestKey: { userId: user.id, requestKey: data.requestKey } } });
      if (existing) {
        if (existing.mobileNumber !== (data.mobileNumber || null) || existing.provider !== data.provider || existing.amountCents !== data.amountCents || existing.asset !== (data.asset || null)) throw new ConflictException("This request key belongs to a different deposit.");
        return existing;
      }
      const method = await tx.paymentMethod.findUnique({ where: { provider: data.asset ? `crypto_${data.asset.toLowerCase()}` : data.provider } });
      if (!method?.enabled || !method.recipient || !method.instructions) throw new BadRequestException("This deposit method is not currently available.");
      if (data.amountCents < method.minimumCents || data.amountCents > method.maximumCents) throw new BadRequestException("The amount is outside this payment method's deposit limits.");
      if (data.asset) validateCryptoMethod(method.provider, method.network, method.recipient, method.usdRateCents);
      const deposit = await tx.deposit.create({ data: { userId: user.id, ...data, ...(data.asset ? { network: method.network, usdRateCents: method.usdRateCents, cryptoAmount: quoteCrypto(data.amountCents, method.usdRateCents, data.asset) } : data.provider === "mobile_money" ? { network: method.network } : {}), methodLabel: method.label, recipient: method.recipient, instructions: method.instructions } });
      await tx.auditLog.create({ data: { actorId: user.id, targetId: deposit.id, action: "deposit.created", detail: { amountCents: data.amountCents, provider: data.provider } } });
      return deposit;
    });
  }

  @Post("payments/deposits/:id/proof")
  async proof(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) {
    const { user } = await requireUser(req); await throttle(user.id, "deposit_proof", 10);
    const data = validate(z.object({ paymentReference: z.string().trim().min(5).max(160).optional(), proof: z.string().trim().min(10).max(4000).optional(), proofImage: proofImageSchema.optional() }).strict(), body);
    return rewardTransaction(async tx => {
      await activeUser(tx, user.id);
      const deposit = await tx.deposit.findUnique({ where: { id } });
      if (!deposit || deposit.userId !== user.id) throw new NotFoundException("Deposit not found.");
      if (deposit.asset === "USDT" && !deposit.proofImage && !data.proofImage) throw new BadRequestException("Upload your USDT payment receipt.");
      if (deposit.provider === "mobile_money" && !deposit.proofImage && !data.proofImage) throw new BadRequestException("Upload your Mobile Money payment receipt.");
      const referenceRequired = deposit.asset !== "USDT";
      if (referenceRequired && !data.paymentReference) throw new BadRequestException("Enter the payment reference or transaction hash.");
      if (deposit.asset && referenceRequired) data.paymentReference = validateCryptoTransaction(deposit.network || "", data.paymentReference!);
      if (deposit.asset === "USDT") data.paymentReference = undefined;
      // PayPal/bank references are case-insensitive; crypto hashes use their network's canonical form.
      if (data.paymentReference) data.paymentReference = deposit.provider === "crypto" ? data.paymentReference : data.paymentReference.toUpperCase();
      if (deposit.paymentReference && deposit.paymentReference !== data.paymentReference) throw new BadRequestException("The payment reference stays attached to this request. Resubmit proof for the original payment.");
      if (["pending_review", "completed"].includes(deposit.status)) return deposit;
      if (!["awaiting_payment", "rejected"].includes(deposit.status)) throw new BadRequestException("This deposit no longer accepts proof.");
      // Retain receipt ownership even after rejection so it cannot fund a second account.
      const used = data.paymentReference ? await tx.deposit.findUnique({ where: { provider_paymentReference: { provider: deposit.provider, paymentReference: data.paymentReference } } }) : null;
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
    const paymentChannel = validate(z.enum(["all", "USDT", "BTC", "ETH", "bank", "paypal", "mobile_money"]), channel);
    const term = search.trim().slice(0, 100);
    const where: Prisma.DepositWhereInput = {
      ...(filter === "all" ? {} : { status: filter }),
      ...(paymentChannel === "all" ? {} : ["USDT", "BTC", "ETH"].includes(paymentChannel) ? { asset: paymentChannel } : { provider: paymentChannel }),
      ...(term ? { OR: [{ id: { contains: term, mode: "insensitive" } }, { paymentReference: { contains: term, mode: "insensitive" } }, { user: { is: { OR: [{ name: { contains: term, mode: "insensitive" } }, { email: { contains: term, mode: "insensitive" } }] } } }] } : {}),
    };
    const [methods, items, total, completed, pending, awaiting, rejected, pendingAmount, openWithdrawals, openWithdrawalAmount, paidWithdrawals, balances] = await db.$transaction([
      db.paymentMethod.findMany({ where: { provider: { in: ["crypto_usdt", "crypto_btc", "crypto_eth", "mobile_money"] } }, orderBy: { provider: "asc" } }),
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
    const availability = await db.rewardSettings.findUnique({ where: { id: "default" }, select: { depositsEnabled: true, withdrawalsEnabled: true } });
    return { availability, methods, items, total, page, pageSize: 20, completedCents: completed._sum.amountCents || 0, pending, metrics: { pendingDepositCount: pending, pendingDepositCents: pendingAmount._sum.amountCents || 0, awaitingPaymentCount: awaiting, rejectedDepositCount: rejected, openWithdrawalCount: openWithdrawals, openWithdrawalCents: openWithdrawalAmount._sum.amountCents || 0, paidWithdrawalCents: paidWithdrawals._sum.amountCents || 0, userDepositCents: balances._sum.depositCents || 0, reservedDepositCents: balances._sum.reservedDepositCents || 0, enabledMethodCount: methods.filter(m => m.enabled).length } };
  }

  @Patch("admin/payments/availability")
  async availability(@Req() req: Request, @Body() body: unknown) {
    const { user } = await requireUser(req, "rewards.manage");
    const change = validate(z.object({ depositsEnabled: z.boolean().optional(), withdrawalsEnabled: z.boolean().optional(), reason: reasonSchema }).strict().refine(value => value.depositsEnabled !== undefined || value.withdrawalsEnabled !== undefined, "Choose a payment control"), body);
    return rewardTransaction(async tx => {
      const previous = await tx.rewardSettings.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} });
      const updated = await tx.rewardSettings.update({ where: { id: "default" }, data: { ...(change.depositsEnabled === undefined ? {} : { depositsEnabled: change.depositsEnabled }), ...(change.withdrawalsEnabled === undefined ? {} : { withdrawalsEnabled: change.withdrawalsEnabled }) } });
      await tx.auditLog.create({ data: { actorId: user.id, action: "payment.availability_changed", reason: change.reason, detail: { before: { depositsEnabled: previous.depositsEnabled, withdrawalsEnabled: previous.withdrawalsEnabled }, after: { depositsEnabled: updated.depositsEnabled, withdrawalsEnabled: updated.withdrawalsEnabled } } } });
      return { depositsEnabled: updated.depositsEnabled, withdrawalsEnabled: updated.withdrawalsEnabled };
    });
  }

  @Get("admin/payments/withdrawals")
  async withdrawalHistory(@Req() req: Request, @Query("page") input = "1", @Query("status") status = "all", @Query("search") search = "") {
    await requireUser(req, "rewards.manage"); const page = getPage(input);
    const filter = validate(z.enum(["all", "pending", "approved", "paid", "rejected", "cancelled"]), status);
    const term = search.trim().slice(0, 100);
    const where: Prisma.WithdrawalWhereInput = { ...(filter === "all" ? {} : { status: filter }), ...(term ? { OR: [{ id: { contains: term, mode: "insensitive" } }, { paymentReference: { contains: term, mode: "insensitive" } }, { user: { is: { OR: [{ name: { contains: term, mode: "insensitive" } }, { email: { contains: term, mode: "insensitive" } }] } } }] } : {}) };
    const [items, total] = await db.$transaction([db.withdrawal.findMany({ where, omit: { payoutProofImage: true }, include: { user: { select: { id: true, name: true, email: true, withdrawalEligible: true, status: true, emailVerified: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 20, take: 20 }), db.withdrawal.count({ where })]);
    return { items, total, page, pageSize: 20 };
  }

  @Patch("admin/payments/methods/:provider")
  async method(@Req() req: Request, @Param("provider") provider: string, @Body() body: unknown) {
    const { user, sessionId } = await requireUser(req, "rewards.manage");
    await requireRecentStaffAuth(sessionId);
    const key = validate(z.enum(["crypto_usdt", "crypto_btc", "crypto_eth", "mobile_money"]), provider);
    const { reason, ...data } = validate(z.object({ network: z.string().trim().max(80).default(""), usdRateCents: z.number().int().min(0).max(2147483647).default(0), label: z.string().trim().min(3).max(80), enabled: z.boolean(), recipient: z.string().trim().max(1000), instructions: z.string().trim().max(4000), minimumCents: z.number().int().min(1).max(1000000), maximumCents: z.number().int().min(1).max(1000000), reason: reasonSchema }).strict().refine(v => v.maximumCents >= v.minimumCents, "Maximum must be at least the minimum").refine(v => !v.enabled || (v.recipient.length >= 5 && v.instructions.length >= 10), "Configure receiving details and instructions before enabling deposits"), body);
    return rewardTransaction(async tx => {
      if (key.startsWith("crypto_") && data.enabled) validateCryptoMethod(key, data.network, data.recipient, data.usdRateCents);
      if (key === "mobile_money" && data.enabled) { data.recipient = validate(mobileNumberSchema, data.recipient)!; if (!data.network) throw new BadRequestException("Enter the Mobile Money operator name."); }
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
    const result = await rewardTransaction(async tx => {
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
    const notice = await db.deposit.findUnique({ where: { id }, include: { user: { select: { email: true } } } });
    if (notice) await sendUserUpdateEmail(notice.user.email, data.decision === "approve" ? "Your deposit was confirmed" : "Your deposit needs attention", data.decision === "approve" ? `Your $${(notice.amountCents / 100).toFixed(2)} deposit was confirmed and added to your deposit balance.` : "Your deposit proof was not approved. Open the payment page to review the decision and submit a corrected request if needed.", env.APP_ORIGIN + "/payments", "View payments").catch(() => undefined);
    return result;
  }
}
