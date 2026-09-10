# Identity API

All application endpoints are under `/api/v1`. Responses containing account data are `Cache-Control: no-store`. Financial APIs do not exist yet.

| Method | Path | Access |
| --- | --- | --- |
| POST | /auth/sign-up/email | Public, same-origin, rate limited |
| POST | /auth/sign-in/email | Verified active user credentials |
| POST | /auth/sign-out | Current session |
| GET | /auth/verify-email | Signed email verification token |
| POST | /auth/send-verification-email | Public, rate limited |
| POST | /auth/request-password-reset | Public, rate limited |
| GET | /auth/reset-password/:token | Recovery redirect |
| POST | /auth/reset-password | Valid single-use recovery token |
| POST | /auth/change-password | Session and current password |
| GET | /me | Verified active user |
| PATCH | /me | Verified active user; accepts only name |
| GET | /me/sessions | Own sessions; tokens excluded |
| DELETE | /me/sessions/:id | Own sessions only |
| GET | /admin/users?page=1 | users.read; 20 rows per page |
| POST | /admin/users/:id/status | users.manage; status and reason required |
| GET | /admin/audit-logs | audit.read; latest 50 entries |
| GET | /health | Database readiness |

Better Auth endpoint names are kept intact rather than adding redundant aliases around the library. Users cannot supply privileges at registration, edit profile permissions, manage staff status, or suspend themselves. Every business endpoint re-reads current permissions and account status from PostgreSQL.

Task, wallet, withdrawal, referral, and reward-administration endpoints are documented in [the rewards module API reference](rewards-module.md#api-endpoints). Registration additionally accepts an optional `signupReferralCode`; it cannot grant roles or permissions.
# Admin control center endpoints

All endpoints require their corresponding staff permission. User and balance mutations are serialized with reward transactions and recorded in the audit log.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/admin/overview` | Platform users, balances, tasks, queues, referrals, and payout totals |
| GET | `/api/v1/admin/users?page=1&search=&status=all` | Searchable user directory with balances and access state |
| GET | `/api/v1/admin/users/:id` | Complete user control record |
| GET | `/api/v1/admin/users/:id/activity?kind=transactions` | Paginated transactions, tasks, deposits, withdrawals, or referrals |
| PATCH | `/api/v1/admin/users/:id/profile` | Change a regular user name/email with a reason |
| POST | `/api/v1/admin/users/:id/status` | Suspend/activate a regular user with a reason |
| POST | `/api/v1/admin/users/:id/adjustment` | Idempotent points or deposited-USD adjustment with a reason |
| GET | `/api/v1/admin/referrals` | Searchable platform referral records |
| GET | `/api/v1/admin/audit` | Searchable, paginated audit history |

Changing an email revokes the user's sessions and requires verification of the new address. Balance deductions cannot consume reserved funds or make a balance negative. Staff accounts cannot modify themselves through these user controls, and ordinary admins cannot change staff accounts.
