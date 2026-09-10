-- AlterTable
ALTER TABLE "wallets" ADD COLUMN     "depositCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reservedDepositCents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ledger_entries" ADD COLUMN     "depositCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reservedDepositCents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "withdrawals" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'points';

-- CreateTable
CREATE TABLE "payment_methods" (
    "provider" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "recipient" TEXT NOT NULL DEFAULT '',
    "instructions" TEXT NOT NULL DEFAULT '',
    "minimumCents" INTEGER NOT NULL DEFAULT 100,
    "maximumCents" INTEGER NOT NULL DEFAULT 100000,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("provider")
);

-- CreateTable
CREATE TABLE "deposits" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "methodLabel" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'awaiting_payment',
    "paymentReference" TEXT,
    "proof" TEXT,
    "reviewReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "deposits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deposits_userId_createdAt_idx" ON "deposits"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "deposits_status_idx" ON "deposits"("status");

-- CreateIndex
CREATE UNIQUE INDEX "deposits_userId_requestKey_key" ON "deposits"("userId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "deposits_provider_paymentReference_key" ON "deposits"("provider", "paymentReference");

-- AddForeignKey
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE wallets ADD CONSTRAINT deposit_balance_nonnegative CHECK ("depositCents" >= 0 AND "reservedDepositCents" >= 0 AND "reservedDepositCents" <= "depositCents");
ALTER TABLE withdrawals DROP CONSTRAINT withdrawal_rules;
ALTER TABLE withdrawals ADD CONSTRAINT withdrawal_rules CHECK ("amountCents" > 0 AND "pointsPerUsd" > 0 AND status IN ('pending', 'approved', 'paid', 'rejected') AND ((source = 'points' AND points > 0) OR (source = 'deposit' AND points = 0)));
ALTER TABLE deposits ADD CONSTRAINT deposit_valid CHECK ("amountCents" > 0 AND provider IN ('paypal','crypto','bank') AND status IN ('awaiting_payment','pending_review','completed','rejected','cancelled') AND (status NOT IN ('pending_review','completed') OR ("paymentReference" IS NOT NULL AND proof IS NOT NULL)));
ALTER TABLE payment_methods ADD CONSTRAINT payment_method_valid CHECK (provider IN ('paypal','crypto','bank') AND "minimumCents" > 0 AND "maximumCents" >= "minimumCents" AND (NOT enabled OR (length(recipient) >= 5 AND length(instructions) >= 10)));
INSERT INTO payment_methods (provider,label,"updatedAt") VALUES ('paypal','PayPal',now()),('bank','Bank transfer',now()),('crypto','Crypto',now());
