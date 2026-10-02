"use client";
import Link from "next/link";
import { ArrowRight, Camera, CheckCircle2, Coins, Copy, KeyRound, LogOut, MonitorSmartphone, Phone, ShieldCheck, UserRound, Users, Wallet as WalletIcon } from "lucide-react";
import { ResourceFeedback, useResource } from "../../components/rewards/resource";
import { points, type Task, type Wallet, type Referrals } from "../../lib/rewards";
import { useEffect, useState } from "react";
import { AccountGate } from "../../components/account-gate";
import { Shell } from "../../components/shell";
import { api, type Profile } from "../../lib/api";
import { designImageData } from "../../lib/image-upload";
import { AccountTools } from "../../components/account-tools";
import { Modal } from "../../components/rewards/primitives";
type Session = { id: string; createdAt: string; expiresAt: string; userAgent: string | null; ipAddress?: string | null; current: boolean };
function ProfileContent({ profile }: { profile: Profile }) {
  const tasks = useResource<Task[]>("/tasks");
  const wallet = useResource<Wallet>("/wallet");
  const referrals = useResource<Referrals>("/referrals");
  const completed = tasks.data?.filter(t => t.run?.status === "completed") || [];
  const taskEarnings = completed.reduce((sum, t) => sum + (t.run?.rewardPoints || 0), 0);
  const [name, setName] = useState(profile.user.name);
  const [savedName, setSavedName] = useState(profile.user.name);
  const [phone, setPhone] = useState(profile.user.phone || ""); const [avatar, setAvatar] = useState(profile.user.image || "");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [newPassword, setNewPassword] = useState("");
  const [sessionToRevoke, setSessionToRevoke] = useState<Session | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<Session[]>("/me/sessions").then(setSessions).catch(e => setError(e.message)); }, []);
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try { await api("/me", { method: "PATCH", body: JSON.stringify({ name, phone: phone.trim() || null, image: avatar || null }) }); setSavedName(name.trim()); setMessage("Your profile has been updated."); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function revoke(id: string, current: boolean) {
    setBusy(true); setError("");
    try { await api(`/me/sessions/${id}`, { method: "DELETE" }); setSessionToRevoke(null); if (current) window.location.assign("/login"); else setSessions(sessions.filter(s => s.id !== id)); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); setBusy(true); setError(""); setMessage("");
    try {
      await api("/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword: data.get("currentPassword"), newPassword: data.get("newPassword"), revokeOtherSessions: true }) });
      form.reset(); setNewPassword(""); setMessage("Password updated. Other sessions have been signed out."); setSessions(await api<Session[]>("/me/sessions"));
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const completionItems = [
    { label: "Email verified", complete: profile.user.emailVerified, icon: ShieldCheck },
    { label: "Mobile added", complete: !!phone.trim(), icon: Phone },
    { label: "Profile photo", complete: !!avatar, icon: Camera },
    { label: "Authenticator", complete: !!profile.security?.twoFactorEnabled, icon: KeyRound },
  ];
  const completion = Math.round(completionItems.filter(item => item.complete).length / completionItems.length * 100);
  const passwordChecks = [[newPassword.length >= 12, "12+ characters"], [/[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword), "Upper and lowercase"], [/\d/.test(newPassword), "Includes a number"]] as const;
  return <Shell name={savedName} admin={profile.permissions.includes("users.read")}>
    <div className="page-heading rw-profile-heading"><div><div className="eyebrow">ACCOUNT CENTER</div><h1>Your profile.</h1><p>Manage your identity, security, rewards, and signed-in devices.</p></div><Link href="/profile/security" className="rw-button rw-button-secondary"><KeyRound size={17}/>Security setup<ArrowRight size={15}/></Link></div>
    <section className="rw-profile-hero"><div className="rw-profile-avatar">{avatar ? <img src={avatar} alt="Your profile" /> : savedName.slice(0, 1).toUpperCase()}</div><div className="rw-profile-identity"><span className="eyebrow">REWARDLY MEMBER</span><h2>{savedName}</h2><p>{profile.user.email}</p><div className="rw-profile-badges"><span className={`status-badge ${profile.user.emailVerified ? "is-complete" : ""}`}><ShieldCheck size={15} />{profile.user.emailVerified ? "Email verified" : "Verification needed"}</span>{profile.security?.twoFactorEnabled && <span className="status-badge is-complete"><KeyRound size={14}/>2FA protected</span>}</div></div><div className="rw-profile-status"><small>MEMBER SINCE</small><strong>{new Date(profile.user.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}</strong></div><div className="rw-profile-progress"><span>Account setup</span><strong>{completion}% complete</strong><progress value={completion} max={100} aria-label="Account setup completion" /></div></section>
    <nav className="rw-profile-quick-nav" aria-label="Profile sections"><a href="#personal-details"><UserRound size={16}/>Personal details</a><a href="#account-security"><KeyRound size={16}/>Password</a><a href="#active-sessions"><MonitorSmartphone size={16}/>Devices</a><a href="#preferences"><ShieldCheck size={16}/>Preferences</a></nav>
    <section className="rw-profile-completion" aria-labelledby="profile-completion-title"><div><span className="rw-panel-kicker">ACCOUNT READINESS</span><h2 id="profile-completion-title">Complete your account</h2><p>Finishing these steps improves account recovery and payout readiness.</p></div><div>{completionItems.map(({label,complete,icon:Icon})=><span className={complete ? "is-complete" : ""} key={label}><Icon size={16}/>{label}{complete && <CheckCircle2 size={14}/>}</span>)}</div></section>
    {!profile.user.emailVerified && <section className="panel"><h2>Confirm your email when you are ready</h2><p>You can use tasks and deposits now. Email confirmation is needed before reward withdrawals and referral rewards can qualify. We will send a six-digit code that expires in 10 minutes.</p><Link className="rw-button rw-button-primary" href={`/verify-email?email=${encodeURIComponent(profile.user.email)}&send=1`}>Email me a verification code</Link></section>}
    <div className="rw-account-active"><ShieldCheck size={24} /><div><strong>Your account is active</strong><p>Complete tasks, track your points, and share your referral link.</p></div></div>
    <h2 className="rw-profile-section-title">Your progress</h2>
    <ResourceFeedback loading={tasks.loading || wallet.loading || referrals.loading} error={tasks.error || wallet.error || referrals.error} retry={() => { void tasks.refresh(); void wallet.refresh(); void referrals.refresh(); }} />
    <div className="rw-profile-stat-grid">{[{ title: "Tasks completed", value: tasks.data ? String(completed.length) : "—", note: "Approved and claimed", icon: CheckCircle2 }, { title: "Task earnings", value: tasks.data ? `${points(taskEarnings)} pts` : "—", note: "Your completed task rewards", icon: Coins }, { title: "Referral earnings", value: referrals.data ? `${points(referrals.data.earningsPoints)} pts` : "—", note: "Qualified friend rewards", icon: Users }, { title: "Points balance", value: wallet.data ? `${points(wallet.data.points)} pts` : "—", note: "Current verified balance", icon: WalletIcon }].map(({ title, value, note, icon: Icon }) => <section className="panel" key={title}><div><span>{title}</span><span className="rw-module-icon"><Icon size={19} /></span></div><strong>{value}</strong><small>{note}</small></section>)}</div>
    <section className="panel rw-profile-referral"><h2>Account & referrals</h2><div><label>Your referral code<textarea readOnly rows={2} value={profile.user.referralCode} onFocus={e => e.target.select()} /></label><button className="rw-button rw-button-secondary" onClick={async () => { try { await navigator.clipboard.writeText(profile.user.referralCode); setMessage("Referral code copied."); setError(""); } catch { setError("Select the referral code to copy it manually."); } }}><Copy size={17} />Copy code</button></div><div className="rw-inline-actions"><Link className="rw-button rw-button-primary rw-withdraw-button" href="/wallet"><WalletIcon size={18} />My rewards</Link><Link className="rw-button rw-button-primary" href="/referrals"><Users size={18} />Invite friends</Link>{profile.permissions.includes("users.read") && <Link className="rw-button rw-button-secondary" href="/admin">Admin portal</Link>}</div></section>
    {error && <div className="form-error" role="alert">{error}</div>}{message && <div className="form-success" role="status">{message}</div>}
    <div className="profile-grid">
      <section id="personal-details" className="panel rw-profile-details-card"><div className="rw-panel-kicker">PERSONALIZE</div><h2>Personal details</h2><p>Keep your contact and display information current.</p><form className="profile-form" onSubmit={save}><div className="rw-avatar-editor"><div className="rw-profile-avatar">{avatar ? <img src={avatar} alt="Profile preview" /> : savedName.slice(0,1).toUpperCase()}</div><div><strong>Profile photo</strong><small>JPG, PNG or WebP. Compressed before upload.</small><label className="rw-button rw-button-secondary"><Camera size={16}/>Choose photo<input className="rw-file-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={async e => { const file=e.target.files?.[0]; if(file) try { setAvatar(await designImageData(file,320)); setError(""); } catch(f) { setError((f as Error).message); } }} /></label>{avatar && <button type="button" className="rw-profile-remove-photo" onClick={() => setAvatar("")}>Remove photo</button>}</div></div><label>Display name<input value={name} onChange={e => setName(e.target.value)} required minLength={2} maxLength={80} autoComplete="name" /></label><label>Email address<input value={profile.user.email} readOnly aria-describedby="profile-email-note" /><small id="profile-email-note">Contact support if this address needs to change.</small></label><label>Mobile number (optional)<input type="tel" value={phone} onChange={e => setPhone(e.target.value)} maxLength={32} autoComplete="tel" placeholder="+971 50 123 4567" /><small>Used only for account or payment support when needed.</small></label><button className="button dark" disabled={busy}>{busy ? "Saving…" : "Save profile changes"}</button></form></section>
      <section id="account-security" className="panel rw-profile-security-card"><div className="rw-panel-kicker">STAY SECURE</div><h2>Change password</h2><p>Use a unique password. Updating it signs out your other sessions.</p><form className="profile-form" onSubmit={changePassword}><label>Current password<input type="password" name="currentPassword" autoComplete="current-password" required /></label><label>New password<input type="password" name="newPassword" value={newPassword} onChange={event => setNewPassword(event.target.value)} autoComplete="new-password" required minLength={12} maxLength={128} aria-describedby="profile-password-help" /></label><ul id="profile-password-help" className="rw-password-checks">{passwordChecks.map(([met,label])=><li className={met ? "is-met" : ""} key={label}><CheckCircle2 size={14}/>{label}</li>)}</ul><button className="button dark" disabled={busy}>{busy ? "Updating…" : "Update password"}</button></form><Link href="/profile/security" className="rw-security-link"><KeyRound size={18}/><span><strong>Authenticator protection</strong><small>{profile.security?.twoFactorEnabled ? "Enabled on your account" : "Add a second verification step"}</small></span><ArrowRight size={16}/></Link></section>
      <section id="active-sessions" className="panel rw-profile-sessions-card"><div className="rw-panel-kicker">YOUR DEVICES</div><h2>Active sessions <span>{sessions.length}</span></h2><p>Review devices with access to your account and sign out anything you do not recognize.</p>{sessions.map(s => <div className="session-row" key={s.id}><span className={`rw-session-icon ${s.current ? "current" : ""}`}><MonitorSmartphone size={18}/></span><div><strong>{s.current ? "This device" : "Signed-in device"}{s.current && <small>Current</small>}</strong><p>{s.userAgent?.slice(0, 75) || "Unknown browser"}</p><p>Started {new Date(s.createdAt).toLocaleDateString()} · {s.ipAddress || "IP unavailable"}</p></div><button type="button" onClick={() => setSessionToRevoke(s)}><LogOut size={15}/>Sign out</button></div>)}{sessions.length === 0 && <div className="rw-empty"><MonitorSmartphone size={26}/><p>No active sessions could be loaded.</p></div>}</section>
      <section className="panel rw-profile-next"><span className="rw-tag">KEEP GOING</span><h2>Your next little win.</h2><p>Your task activity, rewards, and referrals are ready to explore.</p><div className="rw-inline-actions"><Link href="/tasks" className="rw-button rw-button-primary">Explore tasks</Link><Link href="/dashboard" className="rw-button rw-button-secondary">Back to dashboard</Link></div></section>
    </div><div id="preferences"><AccountTools profile={profile}/></div>
    {sessionToRevoke && <Modal title="Sign out device" onClose={() => { if (!busy) setSessionToRevoke(null); }}><span className="rw-tag">ACCOUNT SECURITY</span><h2>{sessionToRevoke.current ? "Sign out this device?" : "Sign out this device session?"}</h2><p>{sessionToRevoke.current ? "You will return to the sign-in page." : "That device will need your credentials before it can access the account again."}</p><div className="rw-inline-actions"><button className="rw-button rw-button-danger" disabled={busy} onClick={() => void revoke(sessionToRevoke.id, sessionToRevoke.current)}><LogOut size={16}/>Sign out</button><button className="rw-button rw-button-secondary" disabled={busy} onClick={() => setSessionToRevoke(null)}>Keep session</button></div></Modal>}
  </Shell>;
}
export default function Page() { return <AccountGate>{profile => <ProfileContent profile={profile} />}</AccountGate>; }
