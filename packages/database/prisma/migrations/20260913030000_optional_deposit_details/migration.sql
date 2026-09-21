ALTER TABLE deposits DROP CONSTRAINT deposit_valid;
ALTER TABLE deposits ADD CONSTRAINT deposit_valid CHECK (
  "amountCents" > 0 AND provider IN ('paypal','crypto','bank')
  AND status IN ('awaiting_payment','pending_review','completed','rejected','cancelled')
  AND (status NOT IN ('pending_review','completed') OR ("paymentReference" IS NOT NULL OR (asset = 'USDT' AND "proofImage" IS NOT NULL)))
);
