ALTER TABLE users ADD CONSTRAINT users_status_check CHECK (status IN ('active', 'suspended'));
ALTER TABLE users ADD CONSTRAINT users_email_normalized CHECK (email = lower(btrim(email)));
ALTER TABLE users ADD CONSTRAINT users_name_length CHECK (char_length(btrim(name)) BETWEEN 2 AND 80);

CREATE FUNCTION reject_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Audit events are append-only';
END;
$$;
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();
