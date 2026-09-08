# Rewardly — Reward Task Platform

Module 1: account foundation, authentication, permissions, and dashboard interface.

## Run locally (Windows)

Requires Node.js 22.13+ and PostgreSQL 18. The project includes an isolated local PostgreSQL setup script; it does not change existing database services.

```powershell
npm.cmd ci
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/local-db.ps1
npm.cmd run db:generate
npm.cmd run db:migrate
npm.cmd run db:seed
```

Start the API and frontend in separate terminals from this directory:

```powershell
npm.cmd run dev:api
```

```powershell
npm.cmd run dev
```

Open http://localhost:3000. The homepage is a clearly marked sample-data dashboard preview. Register at `/register`; the authenticated dashboard is `/dashboard`.

## Local verification and password reset

Development emails are JSON files in `.local/mail`. Open the latest file addressed to your registered email, then open its `url` in the browser. These files are private development fixtures, excluded from Git, and are never exposed over HTTP. No real email is sent in file mode.

After verifying your email, sign in. Recovery works through `/forgot-password` in the same way. Resetting a password revokes all previous sessions.

For real email, configure the SMTP values in `.env.example`, set `MAIL_MODE=smtp`, and use your verified sender. Production startup rejects file email mode and non-HTTPS origins.

## First administrator

Create and verify a normal account first. Then run the explicit operator command:

```powershell
npx.cmd tsx scripts/promote-admin.ts your-email@example.com
```

The account gains Super Admin access and the assignment is audited. There is no default admin account or password. Sign in and open `/admin` to manage user status and view audit logs.

## Validation

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

Integration tests create a new temporary `reward_test_<random>` PostgreSQL database, apply all migrations, exercise real HTTP endpoints, and remove only that temporary database. Your application data is untouched. The test database owner requires CREATE DATABASE permission.

## Deployment boundaries

The Sites build produces the web frontend only. It needs a separately deployed Node API, PostgreSQL, HTTPS reverse proxy, and SMTP to enable accounts remotely. The proxy fails clearly with HTTP 503 if API_ORIGIN is absent. Never point a hosted preview to your local loopback backend.

Local environment keys are documented in `.env.example`. Frontend local runtime reads API_ORIGIN from ignored `.dev.vars`, created by the local setup script. On Sites, configure API_ORIGIN through hosted runtime settings. API APP_ORIGIN must exactly match the frontend URL.

Build the API with `npm.cmd run build:api`; from the root, run `node apps/api/dist/apps/api/src/main.js`. Production environment values must be supplied by the host. The API currently listens on loopback for use behind a reverse proxy on the same host.

The web frontend remains at the root to preserve the Sites starter; backend code lives under `apps/api`, schema/migrations under `packages/database`. See `docs/architecture.md` and `docs/api.md` for boundaries, implemented endpoints and remaining production work.

## Scope

Implemented: register, verify, login/logout, recovery, profile, password changes, session revocation, configurable permissions, account status management, audit trail and responsive dashboard design.

Upcoming: points ledger, tasks and verification, memberships, referrals, financial operations and provider adapters. Preview balances and activity are examples, not real rewards. Staff MFA, durable email retry, production edge rate limits and operational hardening remain required before a public financial launch.

Stop only this project's database with:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/local-db.ps1 stop
```
