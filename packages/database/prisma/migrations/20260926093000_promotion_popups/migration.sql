ALTER TABLE "promotions" DROP CONSTRAINT IF EXISTS "promotions_placement_check";
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_placement_check" CHECK ("placement" IN ('banner', 'ad', 'popup'));
