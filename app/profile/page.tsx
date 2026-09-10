"use client";
import Link from "next/link";
import { CheckCircle2, Coins, Copy, ShieldCheck, Users, Wallet as WalletIcon } from "lucide-react";
import { ResourceFeedback, useResource } from "../../components/rewards/resource";
import { points, type Task, type Wallet, type Referrals } from "../../lib/rewards";
import { useEffect, useState } from "react";
import { AccountGate } from "../../components/account-gate";
import { Shell } from "../../components/shell";
import { api, type Profile } from "../../lib/api";
type Session = { id: string; createdAt: string; expiresAt: string; userAgent: string | null; current: boolean };
function ProfileContent({ profile }: { profile: Profile }) {
  const tasks = useResource<Task[]>("/tasks");
  const wallet = useResource<Wallet>("/wallet");
  const referrals = useResource<Referrals>("/referrals");
  const completed = tasks.data?.filter(t => t.run?.status === "completed") || [];
  const taskEarnings = completed.reduce((sum, t) => sum + (t.run?.rewardPoints || 0), 0);
  const [name, setName] = useState(profile.user.name);
  const [savedName, setSavedName] = useState(profile.user.name);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<Session[]>("/me/sessions").then(setSessions).catch(e => setError(e.message)); }, []);
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try { await api("/me", { method: "PATCH", body: JSON.stringify({ name }) }); setSavedName(name.trim()); setMessage("Your profile has been updated."); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function revoke(id: string, current: boolean) {
    setError("");
    try { await api(`/me/sessions/${id}`, { method: "DELETE" }); if (current) window.location.assign("/login"); else setSessions(sessions.filter(s => s.id !== id)); }
    catch (e) { setError((e as Error).message); }
  }
  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); setBusy(true); setError(""); setMessage("");
    try {
      await api("/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword: data.get("currentPassword"), newPassword: data.get("newPassword"), revokeOtherSessions: true }) });
      form.reset(); setMessage("Password updated. Other sessions have been signed out."); setSessions(await api<Session[]>("/me/sessions"));
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <Shell name={savedName} admin={profile.permissions.includes("users.read")}>
    <div className="page-heading"><div><div className="eyebrow">MAKE IT YOURS</div><h1>Your account.</h1><p>Your details, security, and sessions. All in your hands.</p></div><span className="status-badge">Verified account</span></div>
    <section className="rw-profile-hero"><div className="rw-profile-avatar">{savedName.slice(0, 1).toUpperCase()}</div><div className="rw-profile-identity"><h2>{savedName}</h2><span className="status-badge"><ShieldCheck size={15} />Verified member</span><p>{profile.user.email}</p></div><div className="rw-profile-status"><small>MEMBER SINCE</small><strong>{new Date(profile.user.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}</strong></div><div className="rw-profile-progress"><span>Your task progress</span><strong>{tasks.data ? `${completed.length} / ${tasks.data.length}` : "—"} tasks</strong><progress value={completed.length} max={tasks.data?.length || 1} aria-label="Completed tasks out of available task history" /></div></section>
    <div className="rw-account-active"><ShieldCheck size={24} /><div><strong>Your account is active</strong><p>Complete tasks, track your points, and share your referral link.</p></div></div>
    <h2 className="rw-profile-section-title">Your progress</h2>
    <ResourceFeedback loading={tasks.loading || wallet.loading || referrals.loading} error={tasks.error || wallet.error || referrals.error} retry={() => { void tasks.refresh(); void wallet.refresh(); void referrals.refresh(); }} />
    <div className="rw-profile-stat-grid">{[{ title: "Tasks completed", value: tasks.data ? String(completed.length) : "—", note: "Approved and claimed", icon: CheckCircle2 }, { title: "Task earnings", value: tasks.data ? `${points(taskEarnings)} pts` : "—", note: "Your completed task rewards", icon: Coins }, { title: "Referral earnings", value: referrals.data ? `${points(referrals.data.earningsPoints)} pts` : "—", note: "Qualified friend rewards", icon: Users }, { title: "Points balance", value: wallet.data ? `${points(wallet.data.points)} pts` : "—", note: "Current verified balance", icon: WalletIcon }].map(({ title, value, note, icon: Icon }) => <section className="panel" key={title}><div><span>{title}</span><span className="rw-module-icon"><Icon size={19} /></span></div><strong>{value}</strong><small>{note}</small></section>)}</div>
    <section className="panel rw-profile-referral"><h2>Account & referrals</h2><div><label>Your referral code<textarea readOnly rows={2} value={profile.user.referralCode} onFocus={e => e.target.select()} /></label><button className="rw-button rw-button-secondary" onClick={async () => { try { await navigator.clipboard.writeText(profile.user.referralCode); setMessage("Referral code copied."); setError(""); } catch { setError("Select the referral code to copy it manually."); } }}><Copy size={17} />Copy code</button></div><div className="rw-inline-actions"><Link className="rw-button rw-button-primary rw-withdraw-button" href="/wallet"><WalletIcon size={18} />My rewards</Link><Link className="rw-button rw-button-primary" href="/referrals"><Users size={18} />Invite friends</Link>{profile.permissions.includes("users.read") && <Link className="rw-button rw-button-secondary" href="/admin">Admin portal</Link>}</div></section>
    {error && <div className="form-error" role="alert">{error}</div>}{message && <div className="form-success" role="status">{message}</div>}
    <div className="profile-grid">
      <section className="panel"><div className="rw-panel-kicker">PERSONALIZE</div><h2>Personal details</h2><p>A name that feels like you.</p><form className="profile-form" onSubmit={save}><label>Display name<input value={name} onChange={e => setName(e.target.value)} required minLength={2} maxLength={80} autoComplete="name" /></label><label>Email address<input value={profile.user.email} readOnly /></label><button className="button dark" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button></form><div className="account-detail"><span>Member since</span><strong>{new Date(profile.user.createdAt).toLocaleDateString()}</strong></div></section>
      <section className="panel"><div className="rw-panel-kicker">STAY SECURE</div><h2>Change password</h2><p>Use a unique password. Updating it signs out your other sessions.</p><form className="profile-form" onSubmit={changePassword}><label>Current password<input type="password" name="currentPassword" autoComplete="current-password" required /></label><label>New password<input type="password" name="newPassword" autoComplete="new-password" required minLength={12} maxLength={128} /></label><button className="button dark" disabled={busy}>{busy ? "Updating…" : "Update password"}</button></form></section>
      <section className="panel"><div className="rw-panel-kicker">YOUR DEVICES</div><h2>Active sessions</h2><p>Sign out any session you no longer recognize.</p>{sessions.map(s => <div className="session-row" key={s.id}><span className={`rw-session-dot ${s.current ? "current" : ""}`} /><div><strong>{s.current ? "This session" : "Another session"}</strong><p>{s.userAgent?.slice(0, 65) || "Unknown browser"}</p><p>Started {new Date(s.createdAt).toLocaleDateString()}</p></div><button onClick={() => revoke(s.id, s.current)}>Sign out</button></div>)}</section>
      <section className="panel rw-profile-next"><span className="rw-tag">KEEP GOING</span><h2>Your next little win.</h2><p>Your task activity, rewards, and referrals are ready to explore.</p><div className="rw-inline-actions"><Link href="/tasks" className="rw-button rw-button-primary">Explore tasks</Link><Link href="/dashboard" className="rw-button rw-button-secondary">Back to dashboard</Link></div></section>
    </div>
  </Shell>;
}
export default function Page() { return <AccountGate>{profile => <ProfileContent profile={profile} />}</AccountGate>; }
