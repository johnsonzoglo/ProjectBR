CREATE FUNCTION assign_registration_defaults() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE default_role text;
BEGIN
  SELECT id INTO STRICT default_role FROM roles WHERE key = 'user';
  INSERT INTO user_roles ("userId", "roleId") VALUES (NEW.id, default_role);
  INSERT INTO audit_logs (id, "actorId", "targetId", action)
  VALUES (gen_random_uuid()::text, NEW.id, NEW.id, 'auth.registered');
  RETURN NEW;
END;
$$;
CREATE TRIGGER user_registration_defaults AFTER INSERT ON users
FOR EACH ROW EXECUTE FUNCTION assign_registration_defaults();
