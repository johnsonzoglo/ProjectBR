# Deposits and payments

This module supports manual PayPal, bank, and crypto deposit confirmation. It does not call providers or move money automatically. Receiving details are configured by the operator; no credentials or fake destinations are seeded.

## Local setup and test flow

The admin payment control at `http://localhost:3000/admin/payments` combines payment totals, incoming deposit review, outgoing withdrawal approval and settlement, searchable history, and receiving-method configuration. `/admin/withdrawals` opens the same control center directly on withdrawals. Operators can filter deposits by status and USDT/BTC/ETH/bank/PayPal, and search either flow by user, request ID, destination, or provider reference.

The overview reports submitted deposit value, open withdrawal value, user deposit liabilities, reserved deposit funds, recorded paid withdrawals, and enabled receiving methods. Opening a deposit shows its snapshotted address, asset, network, rate, exact crypto amount, transaction reference, proof, and review timeline. Opening a withdrawal shows its source balance, user eligibility, payout destination, approval state, and settlement reference.

The deposit page is `http://localhost:3000/payments`, accessible from the Wallet Deposit button. Choose the Crypto or Bank Transfer card, enter a USD amount, and create a request to receive the configured instructions. Crypto submissions use a transaction hash plus coin/network details; bank submissions use a transfer reference and receipt details. Methods that have not been enabled remain visible with a setup notice.

1. Keep PostgreSQL, the API, and frontend running using the local setup in README. After pulling changes, run `npm.cmd run db:generate` and `npm.cmd run db:migrate`.
2. Sign in as an admin and open `http://localhost:3000/admin/payments`. Under **Payment methods**, set the receiving details, instructions, minimum/maximum USD amount, and a recorded reason. Enable the method and save. All methods start disabled.
3. Sign in as a user. Open `http://localhost:3000/wallet`, choose **Deposit**, select a method and amount, and create the request. The dialog shows the receiving instructions and request ID. For an actual payment, follow those instructions, then submit the provider transaction reference and receipt details/link.
4. Open the admin deposit queue. Independently verify that the payment arrived; enter the exact USD amount received and review reason, confirm the checkbox, and approve. The user deposit balance updates after refresh. Rejecting credits nothing and lets the user correct proof for the same payment.
5. Back in Wallet, choose **Withdraw**, select **Deposit balance** or **Earned rewards**, enter the amount and destination, and submit. Minimum/maximum withdrawal rules and user eligibility apply to both sources.
6. In `/admin/rewards`, open **Withdrawals**. Approval does not send money. Make the external payment once, then record its provider reference as paid. Rejection releases the reservation.

For testing without sending money, use `npm.cmd test`. Payment fixtures exist only in the temporary test database. Do not approve a fabricated receipt in an account holding real funds. Browser interaction testing was unavailable in this environment; the HTTP/database tests cover the flows above.

## Balances and states

### Crypto wallets

In `/admin/payments` → **Payment methods & crypto wallets**, configure USDT, BTC, and ETH separately. Each has a receiving wallet address, network, USD value per coin, instructions, deposit limits, and enable switch. USDT supports TRON (TRC20) or Ethereum (ERC20); BTC uses Bitcoin and ETH uses Ethereum. One active network per coin is configurable in this module. Wallet fields hold public receiving addresses only.

Users choose a coin on `/payments`. The server computes the exact amount using the operator-set rate, rounded up to the supported coin precision. This is a manual fixed quote, not a live market feed. Requests snapshot the asset, network, wallet address, rate, and crypto amount. Admin changes apply to every user's new requests; existing requests and their payment proofs retain the original details. Verify the actual asset, network, recipient and received amount before confirming the USD credit.

Use PATCH `/api/v1/admin/payments/methods/crypto_usdt`, `/crypto_btc`, or `/crypto_eth` with the existing method fields plus `network` and integer `usdRateCents` (USD cents for one coin). POST `/api/v1/payments/deposits` now requires `asset: "USDT" | "BTC" | "ETH"` when `provider` is `crypto`. Crypto proof requires a full transaction hash. Receipts cannot be reused across coin selections. Address changes and their prior values are recorded in the audit log.

The old generic crypto configuration is disabled by migration; its existing deposits remain reviewable. New coin wallets start disabled with empty addresses. Admins must configure their own receiving wallets and rates before accepting deposits. Address validation checks format, not wallet ownership or blockchain confirmation.

- Earned points and their USD equivalent remain separate from deposits. Deposits award no task or referral points.
- `depositCents` is total confirmed USD still held; `reservedDepositCents` is the portion held for open withdrawals. Available deposit funds are their difference, subject to eligibility.
- Deposit: `awaiting_payment` → `pending_review` → `completed` or `rejected`. A rejected request may resubmit proof using its original reference. An unpaid request can be `cancelled`.
- Withdrawal: `pending` → `approved` → `paid`, or `rejected` from either open status.
- Money uses integer USD cents. Crypto instructions must identify coin, network, fees, and the operator's USD valuation process. Mismatched received amounts cannot be approved as the requested amount.

Requests use user-scoped idempotency keys. Provider receipt references are unique and remain attached after rejection; PayPal/bank reference casing and hexadecimal crypto transaction IDs are normalized. Database transactions serialize all balance changes; unique ledger references make deposit approval credit exactly once. The immutable ledger includes points and deposit-cash deltas. Administrators cannot approve their own deposit or withdrawal.

## API

All paths below are prefixed `/api/v1`. User endpoints require a verified active account. Admin endpoints require `rewards.manage`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/payments/methods` | Enabled deposit methods and instructions |
| GET | `/payments/deposits?page=1` | Own deposit history and lifetime confirmed total |
| POST | `/payments/deposits` | Create request with `provider`, `amountCents`, UUID `requestKey` |
| POST | `/payments/deposits/:id/proof` | Submit `paymentReference` and textual `proof` |
| POST | `/payments/deposits/:id/cancel` | Cancel unpaid request |
| GET | `/admin/payments?page=1&status=pending_review` | Methods, deposit queue/history, totals |
| GET | `/admin/payments/withdrawals?page=1&status=all` | Searchable withdrawal queue and completed history |
| PATCH | `/admin/payments/methods/:provider` | Receiving details, limits, enabled state, reason |
| POST | `/admin/payments/deposits/:id/review` | Approve/reject with reason; approval requires matching `confirmedAmountCents` |

Existing `/wallet` and `/wallet/transactions` now include cash counters/deltas. Existing POST `/wallet/withdrawals` accepts `source: "points" | "deposit"`, defaulting to points for existing callers. Cash withdrawals have `points: 0`. Existing `/admin/rewards/withdrawals/:id` handles both sources.

New files: `app/payments/page.tsx`, `app/admin/payments/page.tsx`, `apps/api/src/modules/rewards/payments.controller.ts`, and `packages/database/prisma/migrations/20260909150000_deposits/migration.sql`. Shared wallet/service/types/styles/navigation were extended. Payment integration coverage lives in `tests/rewards.integration.test.ts`.

Automatic checkout, webhooks, refunds, file upload storage, and provider payout adapters remain future modules. When added, provider secrets must come from environment variables; the public receiving-details fields are never a secret store.
