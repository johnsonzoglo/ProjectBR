ALTER TABLE "users" ADD COLUMN "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "twoFactorEnabledAt" TIMESTAMP(3);
ALTER TABLE "sessions" ADD COLUMN "lastActivityAt" TIMESTAMP(3), ADD COLUMN "staffReauthenticatedAt" TIMESTAMP(3);
CREATE TABLE "two_factors" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "secret" TEXT NOT NULL,
  "backupCodes" TEXT NOT NULL,
  "verified" BOOLEAN NOT NULL DEFAULT true,
  "failedVerificationCount" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil" TIMESTAMP(3),
  CONSTRAINT "two_factors_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "two_factors_userId_idx" ON "two_factors"("userId");
CREATE INDEX "two_factors_secret_idx" ON "two_factors"("secret");
ALTER TABLE "two_factors" ADD CONSTRAINT "two_factors_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE FUNCTION mark_staff_two_factor_enabled() RETURNS TRIGGER AS $$
BEGIN
  IF NEW."twoFactorEnabled" = true AND OLD."twoFactorEnabled" = false THEN
    NEW."twoFactorEnabledAt" := CURRENT_TIMESTAMP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER mark_staff_two_factor_enabled_trigger BEFORE UPDATE ON "users" FOR EACH ROW EXECUTE FUNCTION mark_staff_two_factor_enabled();
