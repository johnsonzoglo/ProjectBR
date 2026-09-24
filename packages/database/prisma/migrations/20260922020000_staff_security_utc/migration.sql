CREATE OR REPLACE FUNCTION mark_staff_two_factor_enabled() RETURNS TRIGGER AS $$
BEGIN
  IF NEW."twoFactorEnabled" = true AND OLD."twoFactorEnabled" = false THEN
    NEW."twoFactorEnabledAt" := timezone('UTC', now());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
