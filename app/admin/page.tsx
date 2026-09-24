"use client";

import Link from "next/link";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, CircleDollarSign, ClipboardCheck, ClipboardList, GitCompareArrows, ShieldCheck, Sparkles, Users, Wallet } from "lucide-react";
import { AccountGate } from "../../components/account-gate";
import { AdminShell } from "../../components/admin-shell";
import { RefreshButton, ResourceFeedback, useResource } from "../../components/rewards/resource";
import { type Profile } from "../../lib/api";
import { money, points } from "../../lib/rewards";

type OverviewData = { users: number; suspended: number; unverified: number; tasks: number; reviews: number; withdrawals: number; deposits: number; referrals: number; paidCents: number; balances: { points: number | null; depositCents: number | null; reservedPoints: number | null; reservedDepositCents: number | null } };

function Overview({ profile }: { profile: Profile }) {
  const resource = useResource<OverviewData>("/admin/overview");
  const data = resource.data;
  const pending = data ? data.reviews + data.deposits + data.withdrawals : 0;
  return <AdminShell name={profile.user.name} roles={profile.roles} permissions={profile.permissions}>
    <div className="ad-overview">
      <div className="ad-overview-hero"><div className="ad-overview-hero-copy"><span className="ad-hero-kicker"><Sparkles size={15}/>OPERATIONS OVERVIEW</span><h1>Good to see you, {profile.user.name.split(" ")[0]}.</h1><p>Your workspace for reviewing activity, protecting balances, and keeping the platform moving.</p><div className="ad-hero-actions"><Link href="/admin/reviews" className="rw-button rw-button-primary">Review tasks <ArrowRight size={17}/></Link><Link href="/admin/payments" className="rw-button rw-button-secondary">Open payments <ArrowRight size={17}/></Link></div></div><div className="ad-hero-focus"><span className="ad-hero-focus-icon"><ShieldCheck size={26}/></span><small>NEEDS YOUR ATTENTION</small><strong>{data ? pending : "—"}</strong><span>open requests across tasks and payments</span></div></div>
      <div className="ad-overview-title"><div><span className="eyebrow">CONTROL CENTER</span><h2>Platform at a glance</h2><p>Live figures from your accounts and reward system.</p></div><RefreshButton onClick={resource.refresh} busy={resource.loading}/></div>
      <ResourceFeedback {...resource} retry={resource.refresh} initial={!data}/>
      {data && <><div className="ad-stats ad-overview-stats">{[
        { label: "Registered users", value: points(data.users), note: `${data.suspended} suspended · ${data.unverified} unverified`, icon: Users, tone: "blue" },
        { label: "Reward points held", value: points(data.balances.points || 0), note: `${points(data.balances.reservedPoints || 0)} reserved for payouts`, icon: CircleDollarSign, tone: "violet" },
        { label: "Deposit balances", value: money(data.balances.depositCents || 0), note: `${money(data.balances.reservedDepositCents || 0)} reserved`, icon: Wallet, tone: "mint" },
        { label: "Active tasks", value: points(data.tasks), note: `${points(data.referrals)} referral registrations`, icon: ClipboardList, tone: "amber" },
      ].map(({ label, value, note, icon: Icon, tone }) => <section className={`panel ad-metric ad-metric-${tone}`} key={label}><div><span>{label}</span><span className="ad-metric-icon"><Icon size={21}/></span></div><strong>{value}</strong><small>{note}</small></section>)}</div>
      <section className="panel ad-priority"><div className="section-top"><div><span className="eyebrow">ACTION REQUIRED</span><h2>Review queue</h2><p>Work through the items that need an admin decision.</p></div><span className="ad-count">{pending} open</span></div><div className="ad-queue-grid">{[
        { title: "Task submissions", count: data.reviews, description: "Check proof and approve earned points.", href: "/admin/reviews", icon: ClipboardCheck, tone: "violet" },
        { title: "Deposit confirmations", count: data.deposits, description: "Verify funds before crediting balances.", href: "/admin/payments", icon: ArrowDownLeft, tone: "mint" },
        { title: "Withdrawal requests", count: data.withdrawals, description: "Approve rewards and record payouts.", href: "/admin/withdrawals", icon: ArrowUpRight, tone: "amber" },
      ].map(({ title, count, description, href, icon: Icon, tone }) => <Link href={href} key={href} className={`ad-queue-${tone}`}><div className="ad-queue-top"><span><Icon size={21}/></span><strong>{count}</strong></div><h3>{title}</h3><p>{description}</p><span className="ad-queue-link">Open queue <ArrowRight size={17}/></span></Link>)}</div></section>
      <div className="ad-overview-links"><Link href="/admin/users"><span><Users size={20}/></span><div><strong>User accounts</strong><small>Search, manage access, and adjust balances.</small></div><ArrowRight size={18}/></Link><Link href="/admin/reconciliation"><span><GitCompareArrows size={20}/></span><div><strong>Payment reconciliation</strong><small>Trace payment evidence to ledger entries.</small></div><ArrowRight size={18}/></Link><Link href="/admin/tasks"><span><ClipboardList size={20}/></span><div><strong>Task workspace</strong><small>Create, schedule, and manage every task.</small></div><ArrowRight size={18}/></Link></div>
      <div className="ad-overview-footnote"><span>Completed payouts</span><strong>{money(data.paidCents)}</strong><Link href="/admin/withdrawals">View history <ArrowRight size={15}/></Link></div>
      </>}
    </div>
  </AdminShell>;
}

export default function Page() { return <AccountGate>{profile => profile.permissions.includes("users.read") && profile.permissions.includes("rewards.manage") ? <Overview profile={profile}/> : <AdminShell name={profile.user.name} roles={profile.roles} permissions={profile.permissions}><h1>Admin access required</h1><p>Your account does not have permission to manage this platform.</p></AdminShell>}</AccountGate>; }
