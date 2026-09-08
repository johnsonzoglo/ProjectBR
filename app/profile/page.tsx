"use client";
import { useEffect, useState } from "react";
import { AccountGate } from "../../components/account-gate";
import { Shell } from "../../components/shell";
import { api, type Profile } from "../../lib/api";
type Session = { id: string; createdAt: string; expiresAt: string; userAgent: string | null; current: boolean };
function ProfileContent({ profile }: { profile: Profile }) {
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
  return <Shell name={savedName} admin={profile.permissions.includes("users.read")}><div className="page-heading"><div><div className="eyebrow">MAKE IT YOURS</div><h1>Your account.</h1><p>Your details, security, and active sessions in one place.</p></div><span className="status-badge">Verified account</span></div>{error && <div className="form-error" role="alert">{error}</div>}{message && <div className="form-success" role="status">{message}</div>}<div className="profile-grid"><section className="panel"><h2>Personal details</h2><form className="profile-form" onSubmit={save}><label>Display name<input value={name} onChange={e => setName(e.target.value)} required minLength={2} maxLength={80} autoComplete="name" /></label><label>Email address<input value={profile.user.email} readOnly /></label><button className="button dark" disabled={busy}>Save changes</button></form><div className="account-detail"><span>Account status</span><strong>{profile.user.status}</strong></div><div className="account-detail"><span>Access</span><strong>{profile.roles.join(", ")}</strong></div><div className="account-detail"><span>Member since</span><strong>{new Date(profile.user.createdAt).toLocaleDateString()}</strong></div></section><section className="panel"><h2>Change password</h2><p>Use a strong, unique password. Updating it signs out your other sessions.</p><form className="profile-form" onSubmit={changePassword}><label>Current password<input type="password" name="currentPassword" autoComplete="current-password" required /></label><label>New password<input type="password" name="newPassword" autoComplete="new-password" required minLength={12} maxLength={128} /></label><button className="button dark" disabled={busy}>Update password</button></form></section><section className="panel"><h2>Active sessions</h2><p>Sign out any session you no longer recognize.</p>{sessions.map(s => <div className="session-row" key={s.id}><div><strong>{s.current ? "This session" : "Another session"}</strong><p>{s.userAgent?.slice(0, 65) || "Unknown browser"}</p><p>Started {new Date(s.createdAt).toLocaleDateString()}</p></div><button onClick={() => revoke(s.id, s.current)}>Sign out</button></div>)}</section><section className="panel"><h2>Your next step</h2><p>Your email is verified and your account is active. Task completion, referral tracking, membership plans, and wallet balances will be connected in later modules.</p></section></div></Shell>;
}
export default function Page() { return <AccountGate>{profile => <ProfileContent profile={profile} />}</AccountGate>; }
