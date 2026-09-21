BEGIN;
ALTER TABLE payment_methods DROP CONSTRAINT payment_method_valid;
ALTER TABLE payment_methods ADD CONSTRAINT payment_method_valid CHECK (provider IN ('paypal','crypto','bank','crypto_usdt','crypto_btc','crypto_eth','mobile_money') AND "minimumCents">0 AND "maximumCents">="minimumCents" AND "usdRateCents">=0 AND (NOT enabled OR (provider <> 'crypto' AND length(recipient)>=5 AND length(instructions)>=10 AND (provider NOT LIKE 'crypto_%' OR (length(network)>0 AND "usdRateCents">0)))));
ALTER TABLE deposits DROP CONSTRAINT deposit_valid;
ALTER TABLE deposits ADD CONSTRAINT deposit_valid CHECK (
  "amountCents" > 0 AND provider IN ('paypal','crypto','bank','mobile_money')
  AND status IN ('awaiting_payment','pending_review','completed','rejected','cancelled')
  AND (status NOT IN ('pending_review','completed') OR ("paymentReference" IS NOT NULL OR (asset = 'USDT' AND "proofImage" IS NOT NULL)))
);

INSERT INTO payment_methods(provider,label,"updatedAt") VALUES ('mobile_money','Mobile Money',now()) ON CONFLICT (provider) DO NOTHING;
COMMIT;
