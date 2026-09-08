# Rewardly — module 1

The foundation implements identity and account administration. Reward processing is intentionally deferred to the next module.

## Repository layout

The Sites frontend stays at the repository root (`app`, `components`, `lib`, `worker`, `build`) to preserve its existing build conventions. The Node API lives in `apps/api`; PostgreSQL models and migrations live in `packages/database`. This is the one layout change from the proposed all-apps monorepo. The API, worker, and database are not deployed by the frontend Sites build.

## Implemented

- Better Auth 1.7 email/password identity, scrypt password hashing, email verification, recovery, secure session cookies in production, password changes and logout.
- PostgreSQL-backed rate limits, hashed recovery identifiers, session revocation, server-side account-status checks.
- Configurable roles and permission joins, seeded User/Admin/Super Admin. No default staff password.
- Profile editing, own-session listing and revocation, admin user pagination, suspension/activation with a reason, recent audit events.
- Database triggers atomically assign User role at registration and prohibit updating or deleting audit entries.
- Responsive dashboard design preview; account dashboard with explicitly unavailable reward balances. Preview numbers are not financial data.

## Authentication boundary

The frontend forwards an allowlist of request headers through `/api/v1/*` to the private Node backend. Cookies are HttpOnly, SameSite=Lax and Secure in production. Unsafe requests must carry the exact configured APP_ORIGIN. Better Auth's own trusted-origin validation remains enabled. The API binds to loopback by default and overwrites untrusted client IP headers.

Better Auth owns the session token representation in PostgreSQL; session rows contain library-managed tokens, not custom token hashes. Recovery identifiers are hashed. Session cookies are signed. Email verification uses the library's expiring signed verification tokens. Do not expose database backups or local email fixtures.

## Production work still required

- Deploy Node/PostgreSQL with a least-privilege runtime database role separate from the migration owner, backups, tested recovery, and monitoring.
- Configure HTTPS APP_ORIGIN, frontend API_ORIGIN, SMTP credentials and a verified sender. File mail is refused in production.
- Configure the trusted reverse proxy and a shared, accurate client-IP rate-limiting policy; loopback development currently shares an IP bucket. Add general API request limits at that edge.
- Add staff MFA before enabling financial administration. Role assignment is operator-only in this phase; a general staff-role management interface is deferred.
- Add a durable email outbox/worker with retry and delivery monitoring. Current SMTP is awaited; email-provider latency and failures affect account requests.
- Add password breach screening and account-level abuse signals before public launch.
- Implement ledger, tasks, memberships, referrals and payment adapters in separate modules. No real-money processing exists in this release.

## Module order

1. Identity foundation (this release)
2. Immutable balanced points/USD ledger and conversion
3. Tasks, capacity, unique claims, verification
4. Memberships
5. Referrals
6. Withdrawals and manual bank reconciliation
7. Provider adapters
8. Analytics, risk operations and production readiness
