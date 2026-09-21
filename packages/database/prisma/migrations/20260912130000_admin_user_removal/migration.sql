ALTER TABLE users ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE users DROP CONSTRAINT users_status_check;
ALTER TABLE users ADD CONSTRAINT users_status_check CHECK (status IN ('active', 'suspended', 'deleted'));
