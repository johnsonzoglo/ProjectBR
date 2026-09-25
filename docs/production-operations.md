# Production operations

## Health and monitoring

- `GET /api/v1/health` is a lightweight liveness probe.
- `GET /api/v1/ready` checks PostgreSQL and reports failed background jobs.
- `GET /api/v1/metrics` returns Prometheus metrics and requires `Authorization: Bearer <HEALTH_TOKEN>`.
- Every API response includes `X-Request-Id`; request logs are structured JSON with status and duration.

Alert when readiness fails, HTTP 5xx grows, a job reaches `failed`, or pending jobs keep increasing.

## Background email delivery

SMTP email is inserted into `background_jobs` before the request succeeds. The API worker claims jobs atomically, retries with exponential backoff, recovers locks older than five minutes, and records permanent failures in the audit log. Keep `JOB_WORKER_ENABLED=true` on at least one API instance. Multiple workers are safe.

## Email domain checklist

Before production, verify the `MAIL_FROM` domain with the provider and publish its SPF and DKIM records. Add DMARC in monitoring mode, review reports, then strengthen the policy. Configure provider bounce and complaint notifications, and rotate SMTP credentials after any exposure.

## Deployment checklist

Run `npm ci`, `npm run db:generate`, `npm run db:migrate`, `npm run typecheck`, `npm test`, and `npm run build`. Store `DATABASE_URL`, `BETTER_AUTH_SECRET`, SMTP credentials, and `HEALTH_TOKEN` in the deployment secret manager. Use HTTPS for `APP_ORIGIN` and back up PostgreSQL before applying migrations.
