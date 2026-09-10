ALTER TABLE payment_methods ADD COLUMN network TEXT NOT NULL DEFAULT '', ADD COLUMN "usdRateCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE deposits ADD COLUMN asset TEXT, ADD COLUMN network TEXT, ADD COLUMN "cryptoAmount" TEXT, ADD COLUMN "usdRateCents" INTEGER;
ALTER TABLE payment_methods DROP CONSTRAINT payment_method_valid;
UPDATE payment_methods SET enabled=false WHERE provider='crypto';
ALTER TABLE payment_methods ADD CONSTRAINT payment_method_valid CHECK (provider IN ('paypal','crypto','bank','crypto_usdt','crypto_btc','crypto_eth') AND "minimumCents">0 AND "maximumCents">="minimumCents" AND "usdRateCents">=0 AND (NOT enabled OR (provider <> 'crypto' AND length(recipient)>=5 AND length(instructions)>=10 AND (provider NOT LIKE 'crypto_%' OR (length(network)>0 AND "usdRateCents">0)))));
INSERT INTO payment_methods(provider,label,network,"usdRateCents","updatedAt") VALUES ('crypto_usdt','USDT','TRON (TRC20)',100,now()),('crypto_btc','BTC','Bitcoin',0,now()),('crypto_eth','ETH','Ethereum',0,now());
ALTER TABLE deposits ADD CONSTRAINT crypto_snapshot_valid CHECK (asset IS NULL OR (provider='crypto' AND asset IN ('USDT','BTC','ETH') AND network IS NOT NULL AND "cryptoAmount" IS NOT NULL AND "usdRateCents">0));
