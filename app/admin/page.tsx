"use client";
import Link from "next/link";
import { ArrowRight, Users, Wallet, ClipboardList, CircleDollarSign } from "lucide-react";
import { AccountGate } from "../../components/account-gate";
import { AdminShell } from "../../components/admin-shell";
import { RefreshButton, ResourceFeedback, useResource } from "../../components/rewards/resource";
import { type Profile } from "../../lib/api";
import { money, points } from "../../lib/rewards";

type OverviewData = { users: number; suspended: number; unverified: number; tasks: number; reviews: number; withdrawals: number; deposits: number; referrals: number; paidCents: number; balances: { points: number | null; depositCents: number | null; reservedPoints: number | null; reservedDepositCents: number | null } };

function Overview({ profile }: { profile: Profile }) {
  const resource = useResource<OverviewData>("/admin/overview"); const d = resource.data;
  return <AdminShell name={profile.user.name}>
    <div className="ad-page-title"><div><span className="eyebrow">YOUR PLATFORM, AT A GLANCE</span><h1>Control center</h1><p>Manage accounts, review payments, and keep operations moving.</p></div><RefreshButton onClick={resource.refresh} busy={resource.loading} /></div>
    <ResourceFeedback {...resource} retry={resource.refresh} initial={!d} />
    {d && <><div className="ad-stats">{[
      { label: "Registered users", value: points(d.users), note: `${d.suspended} suspended · ${d.unverified} unverified`, icon: Users },
      { label: "User points held", value: points(d.balances.points || 0), note: `${points(d.balances.reservedPoints || 0)} reserved`, icon: CircleDollarSign },
      { label: "Deposit balances", value: money(d.balances.depositCents || 0), note: `${money(d.balances.reservedDepositCents || 0)} reserved`, icon: Wallet },
      { label: "Active task listings", value: points(d.tasks), note: `${points(d.referrals)} referral registrations`, icon: ClipboardList },
    ].map(({ label, value, note, icon: Icon }) => <section className="panel" key={label}><div><span>{label}</span><Icon size={21} /></div><strong>{value}</strong><small>{note}</small></section>)}</div>
      <section className="panel ad-priority"><div className="section-top"><div><span className="eyebrow">ACTION REQUIRED</span><h2>Review queue</h2></div><span className="ad-count">{d.reviews + d.deposits + d.withdrawals} open</span></div><div className="ad-queue-grid">{[
        { title: "Task submissions", count: d.reviews, description: "Check proof and approve earned points.", href: "/admin/reviews" },
        { title: "Deposit confirmations", count: d.deposits, description: "Verify funds and credit user balances.", href: "/admin/payments" },
        { title: "Withdrawal requests", count: d.withdrawals, description: "Approve requests and record payouts.", href: "/admin/withdrawals" },
      ].map(item => <Link href={item.href} key={item.href}><strong>{item.count}</strong><h3>{item.title}</h3><p>{item.description}</p><span>Open queue <ArrowRight size={17} /></span></Link>)}</div></section>
      <div className="ad-two-columns"><section className="panel"><span className="eyebrow">USER OPERATIONS</span><h2>Open a user account</h2><p>Search users, view complete activity, edit details, adjust balances, or hold withdrawals.</p><Link href="/admin/users" className="rw-button rw-button-primary">Manage users<ArrowRight size={17} /></Link></section><section className="panel"><span className="eyebrow">PAYMENT CONFIGURATION</span><h2>Wallets & receiving details</h2><p>Control USDT, BTC, and ETH wallets, bank details, rates, and deposit limits.</p><Link href="/admin/payments" className="rw-button rw-button-secondary">Manage payment methods<ArrowRight size={17} /></Link><small className="ad-total-paid">Total recorded payouts: {money(d.paidCents)}</small></section></div>
    </>}
  </AdminShell>;
}

export default function Page() { return <AccountGate>{p => p.permissions.includes("users.read") && p.permissions.includes("rewards.manage") ? <Overview profile={p} /> : <AdminShell name={p.user.name}><h1>Admin access required</h1><p>Your account does not have permission to manage this platform.</p></AdminShell>}</AccountGate>; }
