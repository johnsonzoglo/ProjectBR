"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import QRCode from "qrcode";
import { Check, Copy, ScanLine } from "lucide-react";
import { AccountGate } from "../../../components/account-gate";
import { AdminShell } from "../../../components/admin-shell";
import { api, type Profile } from "../../../lib/api";

function Security({ profile }: { profile: Profile }) {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [uri, setUri] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [enabled, setEnabled] = useState(!!profile.staffSecurity?.twoFactorEnabled);
  const secret = uri ? new URL(uri).searchParams.get("secret") || "" : "";

  useEffect(() => {
    let active = true;
    if (!uri) return;
    void QRCode.toDataURL(uri, { width: 320, margin: 2, errorCorrectionLevel: "M", color: { dark: "#0a1538", light: "#ffffff" } })
      .then(image => { if (active) setQrCode(image); })
      .catch(() => { if (active) setError("The QR code could not be generated. Use the setup key below."); });
    return () => { active = false; };
  }, [uri]);

  async function enroll(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await api<{ totpURI: string; backupCodes: string[] }>("/auth/two-factor/enable", { method: "POST", body: JSON.stringify({ password, method: "totp" }) });
      setUri(result.totpURI); setBackupCodes(result.backupCodes); setPassword("");
      setMessage("Scan the QR code with your authenticator app, then enter its current six-digit code.");
    } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await api("/auth/two-factor/verify-totp", { method: "POST", body: JSON.stringify({ code, trustDevice: false }) });
      setEnabled(true); setMessage("Authenticator enabled. Save your recovery codes, then sign in again with a code.");
    } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  }

  return <AdminShell name={profile.user.name} roles={profile.roles} permissions={profile.permissions}>
    <div className="ad-page-title"><div><span className="eyebrow">STAFF SECURITY</span><h1>Protect your admin account</h1><p>Staff use an authenticator code at sign-in. Sessions end after 30 minutes of inactivity or 12 hours total.</p></div></div>
    <section className="panel ad-security-panel">
      {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-success" role="status">{message}</p>}
      {enabled ? <><h2>Authenticator is enabled</h2><p>High-risk changes require a recent sign-in or password confirmation. Your current setup session must be replaced with a new sign-in.</p>{backupCodes.length > 0 && <><h3>One-time recovery codes</h3><p>Save these in a secure place. Each code works once.</p><pre className="ad-recovery-codes">{backupCodes.join("\n")}</pre></>}<button className="rw-button rw-button-primary" type="button" onClick={async () => { await api("/auth/sign-out", { method: "POST", body: "{}" }).catch(() => undefined); window.location.assign("/login"); }}>Sign in again</button></> : <>
        <h2>Set up two-factor authentication</h2><p>Install an authenticator app, then enter your current password to create a secure QR code.</p>
        {!uri ? <form onSubmit={enroll} className="rw-form"><label>Current password<input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required /></label><button className="rw-button rw-button-primary" disabled={busy}>{busy ? "Setting up…" : "Generate QR code"}</button></form> : <div className="ad-mfa-enrollment">
          <div className="ad-mfa-qr"><span><ScanLine size={18}/> Scan with your authenticator</span>{qrCode ? <Image src={qrCode} alt="Rewardly authenticator setup QR code" width={320} height={320} unoptimized priority /> : <div className="rw-spinner" aria-label="Generating QR code"/>}<small>Works with Google Authenticator, Microsoft Authenticator, Authy, and other TOTP apps.</small></div>
          <div className="ad-mfa-details"><h3>Can’t scan the code?</h3><p>Enter this setup key manually in your authenticator app.</p><div className="ad-mfa-key"><code>{secret}</code><button type="button" className="rw-icon-button" aria-label="Copy setup key" onClick={async () => { await navigator.clipboard.writeText(secret); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>{copied ? <Check size={18}/> : <Copy size={18}/>}</button></div><form onSubmit={verify} className="rw-form"><label>Six-digit authenticator code<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ""))} placeholder="000000" required /></label><button className="rw-button rw-button-primary" disabled={busy || code.length !== 6}>{busy ? "Verifying…" : "Verify and enable"}</button></form></div>
        </div>}
      </>}
    </section>
  </AdminShell>;
}

export default function Page() { return <AccountGate>{profile => profile.staffSecurity ? <Security profile={profile} /> : <p>Staff account required.</p>}</AccountGate>; }
