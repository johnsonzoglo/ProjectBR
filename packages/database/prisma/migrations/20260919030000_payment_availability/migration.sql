ALTER TABLE reward_settings ADD COLUMN "depositsEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE reward_settings ADD COLUMN "withdrawalsEnabled" BOOLEAN NOT NULL DEFAULT true;
