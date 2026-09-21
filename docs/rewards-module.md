# Tasks, rewards, and referrals

These modules replace the three placeholder screens. They use the existing Nest API, Better Auth sessions, PostgreSQL database, role permissions, and Rewardly design tokens. The signed-in dashboard reads the same live data. The public Home route is a dedicated landing page.

## Local test guide

The app is at http://localhost:3000. Use the existing `demo.user@example.test` and `demo.admin@example.test` accounts and their previously supplied passwords. Their passwords were not changed by this implementation. Use separate browser profiles or a private window to keep user and admin sessions separate.

1. **Tasks:** sign in as the demo user and open `/tasks`. Open **Share your first impression**, start it, and submit feedback. As the demo admin, open `/admin/rewards` → **Proof review**. Approve the proof with a reason. Return to the user’s task and claim 1,500 development points. Refresh the page to confirm it remains Completed. A repeat claim never adds points again. Rejecting proof instead returns the task to In Progress with the reviewer’s feedback so the user can resubmit.
2. **Unique codes:** open **Try a unique completion code** as the user and start it. Under the admin’s **Tasks** tab, issue a completion code for that task. Submit that code as the user and claim 1,200 development points. Codes are displayed once to the administrator, stored as SHA-256 hashes, and consumed once. Another account cannot reuse that code.
3. **Rewards:** open `/wallet`. After the feedback task, the default balance is 1,500 points / $1.50. The default rate is 1,000 points per USD and minimum withdrawal is $1.00. Request $1.00 using a test PayPal email. The total points remain unchanged while 1,000 points are reserved; the remaining $0.50 is withdrawable. The transaction and withdrawal histories show the request. Reject it as admin to release the reserved points. Settings and per-user eligibility are editable under `/admin/rewards` → **Settings**. The API enforces these settings even if a client bypasses the form.
4. **Referrals:** open `/referrals`, copy the link, and open it in a signed-out/private browser. The code is prefilled on `/register`. Register a new email, then open its verification URL from the matching JSON file in `.local/mail`. Sign in as that friend, finish a task, and claim its points. By default, one claimed task and a verified email qualify the referral, crediting 500 points to the inviter. The inviter’s referral page, wallet, and ledger update. The friend’s own task credit is separate. Reusing an existing account does not create another referral. Qualification rules and reward amounts are captured at registration, so edits apply to new referrals.

The two demo tasks are explicitly labeled local demonstrations; they do not involve external work or automatic cash payments. They are created by `npm.cmd run db:seed:demo-tasks`, which only runs against a local development database and preserves existing task edits. No user balances are preloaded or reset.

**Payments:** withdrawals currently use an audited manual workflow: Pending → Approved → Paid, or Pending/Approved → Rejected. Approval does not send money. The operator must perform the actual provider payment separately and then record its reference. Do not mark development requests paid as though an actual payment happened. No PayPal, crypto, or bank API credentials or automated payout adapters were added.

## Rules and data integrity

- One task run per `(userId, taskId)`; no daily repeat farming of the same task.
- Starting reserves a lifetime slot and a daily start slot. Daily start and completion counts reset at 00:00 UTC. Claims also enforce the task’s daily completion cap; approved claims that reach the cap remain available for the next day. The total task limit cannot be edited below existing reservations.
- Start and end dates and active status control new participation. Already-started tasks can finish after the closing date or a pause, with the points and verification method agreed at start.
- Manual review approves evidence; the user explicitly claims the points afterward. Admins cannot review their own proof.
- Points and USD cents are integers. USD equivalents round down to cents; a withdrawal reserves the rounded-up integer point cost. Each request keeps the conversion rate used at creation.
- Withdrawals reserve points atomically. Approval retains the reservation; rejection releases it; recording payment deducts both points and the reservation. Retries with the same request key return the original request. Reusing that key with a different payload is rejected.
- Eligibility and account status are rechecked before withdrawals and payouts. Administrators cannot alter their own eligibility or review their own withdrawals.
- Each ledger reference is unique. Ledger rows are immutable in PostgreSQL. Wallet mutations and ledger entries commit together. Task claims, withdrawal updates, reward-rule changes, and account suspension use a transaction-scoped advisory lock to serialize conflicting writes. This favors correctness over throughput for the current application; future scale can replace it with ordered per-account locks.
- A referral is attached atomically during signup, has a unique invitee, cannot refer to itself, and cannot be reassigned afterward. The inviter must be active and verified at signup. A later inviter suspension does not erase earned referral credits, but the suspended account cannot access or withdraw them.
- Referral credits require an active, verified invitee and the snapshotted number of completed, claimed tasks. No bonus is credited merely for sharing a link or registering. Milestones are progress indicators, not extra payment promises.
- Referral activity shows only the friend’s first name and qualification progress, not their email or payment details.
- Verification attempts, starts, claims, withdrawal requests, and code issuance are rate limited. Existing signup throttling and email verification still apply. These are basic abuse controls, not identity verification or a complete fraud detection service.

## API endpoints

All paths below have prefix `/api/v1`. User routes require an active, verified session. Admin routes require `rewards.manage`, assigned to the existing Admin and Super Admin roles by migration and seed.

| Method | Route | Purpose |
|---|---|---|
| GET | `/tasks` | Tasks, current-user run state, and available slots |
| GET | `/tasks/:id` | Current-user task details |
| POST | `/tasks/:id/start` | Create or return the user’s task run |
| POST | `/tasks/:id/submit` | Verify `{code}` or submit `{proof}` for review |
| POST | `/tasks/:id/claim` | Credit an approved run exactly once |
| GET | `/wallet` | Points, reserved/withdrawable balance, USD values, rules |
| GET | `/wallet/transactions?page=1` | Paginated immutable ledger |
| GET | `/wallet/withdrawals?page=1` | Paginated user withdrawal history |
| POST | `/wallet/withdrawals` | Request with `amountCents`, `provider`, `destination`, UUID `requestKey` |
| GET | `/referrals?page=1` | Code/link, registrations, qualification progress, earnings |
| GET | `/admin/rewards?page=1` | Task list, review queues, and current rules |
| POST | `/admin/rewards/tasks` | Create task |
| PATCH | `/admin/rewards/tasks/:id` | Edit/pause/schedule task |
| POST | `/admin/rewards/tasks/:id/codes` | Issue one unique completion code |
| POST | `/admin/rewards/reviews/:id` | Approve or reject proof with a reason |
| PATCH | `/admin/rewards/settings` | Update conversion, limits, and referral rules with a reason |
| PATCH | `/admin/rewards/eligibility` | Update a user’s eligibility by email with a reason |
| POST | `/admin/rewards/withdrawals/:id` | Approve, reject, or record paid with a reason/reference |

The existing signup endpoint now accepts optional `signupReferralCode`. Task methods are `manual` and `code`; external verification webhooks and file upload storage are not part of this module. Manual proof accepts text or a link supplied by the user.

## New implementation files

Deposit balances, receiving-method configuration, proof review, and withdrawals from deposited USD are now implemented as a separate payment module. See [payments.md](payments.md) for setup, endpoints, states, and balance semantics. The points workflow described here remains supported.

- `apps/api/src/modules/rewards/service.ts`: transactions, ledger, claims, reservations, referrals, throttling.
- `apps/api/src/modules/rewards/rewards.controller.ts`: user endpoints.
- `apps/api/src/modules/rewards/admin-rewards.controller.ts`: administrative endpoints.
- `packages/database/prisma/migrations/20260909120000_reward_modules/migration.sql`: tables, constraints, signup attribution, immutable ledger, and permissions.
- `app/admin/rewards/page.tsx`: task and reward operations UI.
- `components/rewards/resource.tsx`: refresh, loading/retry feedback, pagination; refreshes on window focus and every 30 seconds while visible.
- `components/rewards/live-dashboard.tsx`: real account balances and module navigation.
- `lib/rewards.ts`, `app/modules.css`: shared frontend types, formatting, responsive layouts, focus/touch states, and reduced-motion support.
- `scripts/seed-demo-tasks.ts`: optional local examples.
- `tests/rewards.integration.test.ts`: real HTTP/database tests in an isolated temporary database.

The three existing page files were replaced, signup was extended for referral attribution, and existing admin navigation links to reward operations. Existing authentication and profile behavior is retained.

## Task proof images

New task screenshots are saved as content-addressed files in `TASK_PROOF_DIR`, not as base64 values in PostgreSQL. The database keeps a short reference. Owners and staff with reward-management permission can view a proof through the authenticated `/api/v1/task-proofs/:runId` endpoint. Exact screenshot reuse in another round of the same task is rejected; reuse across accounts and unusually fast repeat submissions generate admin alerts without imposing a task timer.

Set `TASK_PROOF_DIR` to a persistent, backed-up directory on the API host before deploying. Do not put it under a public web directory. After configuring it, migrate existing database images with `npx.cmd tsx --tsconfig apps/api/tsconfig.json scripts/migrate-task-proofs.ts`. Keep this directory when moving or restoring the API server. Old base64 proofs remain readable until migrated.

## Automated checks

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

The test suite creates and deletes only its own `reward_test_<random>` PostgreSQL database. It tests authentication, role boundaries, code reuse, simultaneous claims, manual corrections and approval, referral qualification and duplication, task dates and capacity, money rounding/balances, eligibility, idempotent withdrawal requests, concurrent overspending, rejection releases, manual settlement, immutable ledger records, rate limits, and self-review restrictions. Real payout providers are not contacted. Browser visual and interaction testing was unavailable in the current environment; use the local guide above to verify the presentation on your devices.
