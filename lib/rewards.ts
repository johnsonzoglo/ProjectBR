export type Rules = { pointsPerUsd: number; minWithdrawalCents: number; maxWithdrawalCents: number; referralRewardPoints: number; referralRequiredTasks: number; referralsEnabled: boolean };
export type TaskRun = { id: string; status: "in_progress" | "pending_review" | "approved" | "completed"; rewardPoints: number; verification: "code" | "manual"; proof: string | null; reviewReason: string | null; completedAt: string | null };
export type Task = { id: string; title: string; description: string; instructions: string; category: string; rewardPoints: number; verification: "code" | "manual"; destinationUrl: string | null; active: boolean; startsAt: string; endsAt: string | null; dailyLimit: number; totalLimit: number; run: TaskRun | null; slotsRemaining: number };
export type Wallet = { points: number; reservedPoints: number; depositCents: number; reservedDepositCents: number; withdrawableDepositCents: number; usdCents: number; withdrawablePoints: number; withdrawableCents: number; eligible: boolean; eligibilityReason: string | null; todayPoints: number; rules: Rules };
export type Transaction = { id: string; kind: string; points: number; reservedPoints: number; depositCents: number; reservedDepositCents: number; description: string; createdAt: string };
export type Withdrawal = { id: string; source: "points" | "deposit"; amountCents: number; points: number; pointsPerUsd: number; provider: string; destination: string; status: string; reason: string | null; paymentReference: string | null; createdAt: string };
export type PaymentMethod = { provider: "paypal" | "bank" | "crypto_usdt" | "crypto_btc" | "crypto_eth"; network: string; usdRateCents: number; label: string; enabled: boolean; recipient: string; instructions: string; minimumCents: number; maximumCents: number };
export type Deposit = { asset: "USDT" | "BTC" | "ETH" | null; network: string | null; cryptoAmount: string | null; usdRateCents: number | null; id: string; amountCents: number; provider: string; methodLabel: string; recipient: string; instructions: string; status: "awaiting_payment" | "pending_review" | "completed" | "rejected" | "cancelled"; paymentReference: string | null; proof: string | null; reviewReason: string | null; createdAt: string; submittedAt: string | null; reviewedAt: string | null };
export const paymentStatus = (status: string) => ({ awaiting_payment: "Awaiting payment", pending_review: "Under review", pending: "Under review", approved: "Approved · awaiting payout", paid: "Paid", completed: "Completed", rejected: "Rejected", cancelled: "Cancelled" })[status] || status;
export function amountToCents(amount: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(amount)) return 0;
  const cents = Number(amount.split(".")[0]) * 100 + Number((amount.split(".")[1] || "").padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : 0;
}
export type Paged<T> = { items: T[]; total: number; page: number; pageSize: number };
export type ReferralItem = { id: string; name: string; emailVerified: boolean; completedTasks: number; requiredTasks: number; rewardPoints: number; qualifiedAt: string | null; createdAt: string };
export type Referrals = Paged<ReferralItem> & { code: string; link: string; qualified: number; earningsPoints: number; rules: Rules };
export const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
export const points = (value: number) => value.toLocaleString("en-US");
export const date = (value: string) => new Date(value).toLocaleString();
export const taskStatus = (task: Task) => !task.run ? "Available" : task.run.status === "completed" ? "Completed" : task.run.status === "pending_review" ? "Pending Review" : "In Progress";
