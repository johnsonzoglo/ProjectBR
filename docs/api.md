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
