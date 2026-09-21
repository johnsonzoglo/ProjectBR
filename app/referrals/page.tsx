"use client";
import { useState } from "react";
import { Check, Copy, Gift, Share2, Users } from "lucide-react";
import { AccountGate } from "../../components/account-gate";
import { Shell } from "../../components/shell";
import { Pagination, RefreshButton, ResourceFeedback, useResource } from "../../components/rewards/resource";
import type { Profile } from "../../lib/api";
import { date, points, type Referrals } from "../../lib/rewards";

function ReferralPage({ profile }: { profile: Profile }) {
  const [page, setPage] = useState(1);
  const resource = useResource<Referrals>(`/referrals?page=${page}`);
  const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const data = resource.data;
  async function copy(text: string, label: string) {
    setMessage(""); setError("");
    try { await navigator.clipboard.writeText(text); setMessage(`${label} copied. Ready to share!`); }
    catch { setError("Copy is unavailable in this browser. Select the code or link below and copy it manually."); }
  }
  async function share() {
    if (!data) return; setError(""); setMessage("");
    if (!navigator.share) return copy(data.link, "Referral link");
    try { await navigator.share({ title: "Join me on Rewardly", text: "A little time. A little progress. Join me on Rewardly.", url: data.link }); setMessage("Referral link shared."); }
    catch (e) { if ((e as Error).name !== "AbortError") setError("Sharing could not open. Use Copy link instead."); }
  }
  return <Shell name={profile.user.name} admin={profile.permissions.includes("users.read")}>
    <div className="page-heading"><div><span className="eyebrow">GOOD THINGS ARE BETTER SHARED</span><h1>Bring your people.</h1><p>Invite friends, celebrate their progress, and earn qualifying rewards.</p></div><RefreshButton onClick={resource.refresh} busy={resource.loading} /></div>
    <ResourceFeedback {...resource} retry={resource.refresh} initial={!data} />
    {data && <><section className="rw-referral-hero"><div className="rw-referral-hero-top"><span className="rw-tag"><Users size={15} />REFER & EARN</span><span className="rw-reward-pill">+{points(data.rules.referralRewardPoints)} pts / qualified friend</span></div><div className="rw-referral-copy"><h2>Invite friends.<br />Share the rewards.</h2><p>{data.rules.referralsEnabled ? `Earn ${points(data.rules.referralRewardPoints)} points when a new friend verifies their email and claims ${data.rules.referralRequiredTasks} approved task${data.rules.referralRequiredTasks === 1 ? "" : "s"}.` : "New referral registrations are paused. Your existing referral progress is still tracked."}</p></div><div className="rw-referral-share"><div className="rw-code-card"><label>Your referral code<textarea readOnly rows={2} value={data.code} onFocus={e => e.target.select()} /></label><button className="rw-icon-button" aria-label="Copy referral code" onClick={() => copy(data.code, "Referral code")}><Copy size={23} /></button><button className="rw-icon-button" aria-label="Share referral link" onClick={share}><Share2 size={24} /></button></div><label className="rw-referral-link-label">Your personal link<input readOnly value={data.link} onFocus={e => e.target.select()} /></label><div className="rw-inline-actions"><button className="rw-button rw-button-primary" onClick={() => copy(data.link, "Referral link")}><Copy size={16} />Copy link</button><button className="rw-button rw-button-secondary" onClick={share}><Share2 size={16} />Share invitation</button></div></div></section>
      {message && <div className="form-success" role="status">{message}</div>}{error && <div className="form-error" role="alert">{error}</div>}
      <div className="rw-module-stats rw-three-stats"><div className="panel"><span>Invited registrations</span><strong>{points(data.total)}</strong></div><div className="panel"><span>Verified referrals</span><strong>{points(data.verified)}</strong></div><div className="panel"><span>Qualified friends</span><strong>{points(data.qualified)}</strong></div></div>
      <section className="panel"><div className="section-top"><div><span className="rw-panel-kicker">GROW TOGETHER</span><h2>Your referral milestones</h2></div><Gift size={23} /></div><div className="rw-milestones">{[1, 5, 10].map(target => <div key={target} className={data.qualified >= target ? "is-complete" : ""}><span>{data.qualified >= target ? <Check size={22} /> : <Users size={22} />}</span><h3>{target} qualified {target === 1 ? "friend" : "friends"}</h3><progress value={Math.min(data.qualified, target)} max={target} aria-label={`${target} qualified referral milestone`} /><small>{Math.min(data.qualified, target)} / {target}</small></div>)}</div><p className="rw-fine-print">Milestones celebrate your progress. Rewards are awarded once per qualified friend; milestones do not add a separate bonus.</p></section>
      <section className="panel rw-history-panel"><div className="section-top"><div><span className="rw-panel-kicker">EVERY FRIEND HAS A START</span><h2>Referral activity</h2></div><span className="pill">{data.total} registrations</span></div>{data.items.map(item => <article key={item.id} className="rw-referral-row"><div><span className="rw-referral-initial">{item.name.slice(0, 1).toUpperCase()}</span><div><strong>{item.name}</strong><small>Joined {date(item.createdAt)}</small></div><span className={`rw-state-badge ${item.qualifiedAt ? "completed" : item.verifiedAt ? "available" : "pending_review"}`}>{item.qualifiedAt ? "Qualified" : item.verifiedAt ? "Email verified" : "Awaiting verification"}</span></div><div className="rw-referral-progress"><span>{item.emailVerified ? "Email verified" : "Awaiting email verification"}</span><span>{Math.min(item.completedTasks, item.requiredTasks)} / {item.requiredTasks} claimed tasks</span></div><progress value={Math.min(item.completedTasks, item.requiredTasks)} max={item.requiredTasks} aria-label={`${item.name}'s task qualification progress`} /><small>{item.qualifiedAt ? `+${points(item.rewardPoints)} points credited` : item.verifiedAt ? `${points(item.rewardPoints)} points after required tasks` : "Referral will count after email verification"}</small></article>)}{data.total === 0 && <div className="rw-empty"><Users size={30} /><h3>Your circle starts with one.</h3><p>Share your link. Friends appear here after they register through it.</p></div>}<Pagination page={page} total={data.total} busy={resource.loading} onPage={setPage} /></section>
      <div className="rw-notice"><p>Referrals must be attached when a new account is created. Existing accounts, self-referrals, and repeated registrations do not earn another referral reward. Each friend keeps the reward terms that applied when they joined.</p></div>
    </>}
  </Shell>;
}
export default function Page() { return <AccountGate>{profile => <ReferralPage profile={profile} />}</AccountGate>; }
