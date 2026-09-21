ALTER TABLE withdrawals DROP CONSTRAINT withdrawal_rules;
ALTER TABLE withdrawals ADD CONSTRAINT withdrawal_rules CHECK ("amountCents" > 0 AND "pointsPerUsd" > 0 AND status IN ('pending', 'approved', 'paid', 'rejected', 'cancelled') AND ((source = 'points' AND points > 0) OR (source = 'deposit' AND points = 0)));
CREATE UNIQUE INDEX "withdrawals_paymentReference_key" ON withdrawals("paymentReference");
