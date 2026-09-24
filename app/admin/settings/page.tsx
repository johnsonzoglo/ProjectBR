"use client";

import { useState } from "react";
import { CircleDollarSign, ShieldCheck, Users } from "lucide-react";
import { AccountGate } from "../../../components/account-gate";
import { AdminShell } from "../../../components/admin-shell";
import { RefreshButton, ResourceFeedback, useResource } from "../../../components/rewards/resource";
import { api, type Profile } from "../../../lib/api";
import { amountToCents, money, points, type Rules } from "../../../lib/rewards";

function Settings({ profile }: { profile: Profile }) {
  const resource = useResource<Rules>("/admin/rewards/settings");
  const rules = resource.data;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function saveRules(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const values = new FormData(event.currentTarget);
    const minWithdrawalCents = amountToCents(String(values.get("minWithdrawalUsd") || ""));
    const maxWithdrawalCents = amountToCents(String(values.get("maxWithdrawalUsd") || ""));
    if (!minWithdrawalCents || !maxWithdrawalCents || maxWithdrawalCents < minWithdrawalCents) { setError("Enter valid USD limits. The maximum must be at least the minimum."); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      await api("/admin/rewards/settings", { method: "PATCH", body: JSON.stringify({
        pointsPerUsd: Number(values.get("pointsPerUsd")), minWithdrawalCents, maxWithdrawalCents,
        referralRewardPoints: Number(values.get("referralRewardPoints")), referralRequiredTasks: Number(values.get("referralRequiredTasks")),
        minWithdrawalReferrals: Number(values.get("minWithdrawalReferrals")), referralsEnabled: values.get("referralsEnabled") === "on",
        reason: String(values.get("reason") || "").trim(),
      }) });
      await resource.refresh(); setMessage("Reward rules saved and recorded in the audit log.");
    } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  }

  async function saveEligibility(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget; const values = new FormData(form);
    setBusy(true); setError(""); setMessage("");
    try {
      await api("/admin/rewards/eligibility", { method: "PATCH", body: JSON.stringify({ email: values.get("email"), eligible: values.get("eligible") === "yes", reason: values.get("reason") }) });
      form.reset(); setMessage("Withdrawal eligibility updated and recorded in the audit log.");
    } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  }

  return <AdminShell name={profile.user.name} roles={profile.roles} permissions={profile.permissions}>
    <div className="ad-page-title"><div><span className="eyebrow">PLATFORM CONFIGURATION</span><h1>Rules & settings</h1><p>Set reward and withdrawal rules. Every change is recorded in the audit log.</p></div><RefreshButton onClick={resource.refresh} busy={resource.loading}/></div>
    <ResourceFeedback {...resource} retry={resource.refresh} initial={!rules}/>
    {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-success" role="status">{message}</p>}
    {rules && <div className="ad-settings-grid"><section className="panel ad-settings-primary"><div className="ad-settings-section-head"><span className="ad-settings-icon"><CircleDollarSign size={22}/></span><div><h2>Reward rules</h2><p>These values apply to new activity. Existing withdrawals and referrals keep the terms recorded when they began.</p></div></div><form className="profile-form ad-settings-form" key={JSON.stringify(rules)} onSubmit={saveRules}>
      <div className="ad-settings-form-group"><h3>Points and withdrawals</h3><div className="ad-settings-fields"><label>Points per $1 USD<input name="pointsPerUsd" type="number" defaultValue={rules.pointsPerUsd} min={1} max={1000000} step={1} required disabled={busy}/><small>Current rate: {points(rules.pointsPerUsd)} points = $1.00</small></label><label>Minimum withdrawal (USD)<input name="minWithdrawalUsd" type="number" defaultValue={(rules.minWithdrawalCents / 100).toFixed(2)} min="0.01" max="10000" step="0.01" required disabled={busy}/><small>Currently {money(rules.minWithdrawalCents)}</small></label><label>Maximum withdrawal (USD)<input name="maxWithdrawalUsd" type="number" defaultValue={(rules.maxWithdrawalCents / 100).toFixed(2)} min="0.01" max="10000" step="0.01" required disabled={busy}/><small>Currently {money(rules.maxWithdrawalCents)}</small></label></div></div>
      <div className="ad-settings-form-group"><h3>Referral rewards</h3><div className="ad-settings-fields"><label>Points per qualified referral<input name="referralRewardPoints" type="number" defaultValue={rules.referralRewardPoints} min={0} max={1000000} step={1} required disabled={busy}/></label><label>Claimed tasks to qualify<input name="referralRequiredTasks" type="number" defaultValue={rules.referralRequiredTasks} min={1} max={1000} step={1} required disabled={busy}/></label><label>Qualified referrals needed to withdraw<input name="minWithdrawalReferrals" type="number" defaultValue={rules.minWithdrawalReferrals || 0} min={0} max={1000000} step={1} required disabled={busy}/><small>Set to 0 to disable this requirement.</small></label></div><label className="rw-check-field"><input name="referralsEnabled" type="checkbox" defaultChecked={rules.referralsEnabled} disabled={busy}/>Accept new referrals</label></div>
      <label>Reason for changes<input name="reason" minLength={10} maxLength={500} placeholder="Explain why these rules are changing" required disabled={busy}/></label><button className="rw-button rw-button-primary" disabled={busy}>{busy ? "Saving…" : "Save reward rules"}</button>
    </form></section><aside className="ad-settings-aside"><section className="panel"><div className="ad-settings-section-head"><span className="ad-settings-icon"><ShieldCheck size={22}/></span><div><h2>Withdrawal eligibility</h2><p>Allow or hold withdrawals for one account. The reason is recorded.</p></div></div><form className="profile-form ad-settings-form" onSubmit={saveEligibility}><label>User email<input type="email" name="email" placeholder="member@example.com" required disabled={busy}/></label><label>Eligibility<select name="eligible" disabled={busy}><option value="yes">Allow withdrawals</option><option value="no">Hold withdrawals</option></select></label><label>Reason<input name="reason" minLength={10} maxLength={500} placeholder="Explain this account decision" required disabled={busy}/></label><button className="rw-button rw-button-secondary" disabled={busy}>{busy ? "Saving…" : "Update eligibility"}</button></form></section><section className="panel ad-settings-note"><Users size={19}/><p>For account balances and status, use <a href="/admin/users">Users</a>. For payout decisions, use <a href="/admin/withdrawals">Withdrawals</a>.</p></section></aside></div>}
  </AdminShell>;
}

export default function Page() { return <AccountGate>{profile => profile.permissions.includes("rewards.manage") ? <Settings profile={profile}/> : <AdminShell name={profile.user.name} roles={profile.roles} permissions={profile.permissions}><p>Admin access required.</p></AdminShell>}</AccountGate>; }
