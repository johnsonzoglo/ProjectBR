"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Eye, EyeOff, Layers2, ShieldCheck } from "lucide-react";
import { Brand } from "./brand";
import { api } from "../lib/api";
import { ThemeSurface, ThemeToggle } from "./rewards/theme";
type Mode = "login" | "register" | "forgot-password" | "reset-password" | "verify-email";
const copy = {
  login: ["Welcome back.", "A little progress is waiting for you.", "Sign in"],
  register: ["Good things start here.", "Create your account. Make your time count.", "Create account"],
  "forgot-password": ["Let’s get you back in.", "We’ll send a password reset link if an account exists.", "Send reset link"],
  "reset-password": ["A fresh start.", "Choose a new password to secure your account.", "Reset password"],
  "verify-email": ["Check your inbox.", "Enter the six-digit code from your email. Codes expire after 10 minutes.", "Verify email"],
};
export function AuthForm({ mode, initialReferralCode = "" }: { mode: Mode; initialReferralCode?: string }) {
  const [emailValue, setEmailValue] = useState("");
  const [resendWait, setResendWait] = useState(0);
  const autoSent = useRef(false);
  useEffect(() => { if (!resendWait) return; const timer = setTimeout(() => setResendWait(resendWait - 1), 1000); return () => clearTimeout(timer); }, [resendWait]);
  const [visible, setVisible] = useState(false);
  const [twoFactorChallenge, setTwoFactorChallenge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [referralCode, setReferralCode] = useState(initialReferralCode);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      const query = new URLSearchParams(window.location.search);
      if (mode === "verify-email") {
        const address = query.get("email") || sessionStorage.getItem("verificationEmail") || "";
        setEmailValue(address);
        if (query.get("send") === "1" && address && !autoSent.current) {
          autoSent.current = true;
          query.delete("send");
          window.history.replaceState(null, "", `${window.location.pathname}?${query.toString()}`);
          void api("/auth/send-verification-email", { method: "POST", credentials: "omit", body: JSON.stringify({ email: address.trim().toLowerCase() }) })
            .then(() => { if (active) { setMessage("We emailed a six-digit code. Enter the newest code below; it expires in 10 minutes."); setResendWait(60); } })
            .catch((failure: Error) => { if (active) setError(`We could not send a code: ${failure.message}. Please try Send / resend code.`); });
        }
      }
      if (mode === "login" && query.get("verified") === "1" && !query.has("error")) setMessage("Your email is verified. You can now sign in.");
      if (mode === "login" && query.get("registered") === "1") setMessage("Account created. Sign in to start using Rewardly.");
      if (query.has("error")) setError("This verification link is invalid or expired. Request a new email using the verification page.");
    });
    return () => { active = false; };
  }, [mode]);
  const hasPassword = ["login", "register", "reset-password"].includes(mode);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const values = new FormData(event.currentTarget);
    const email = String(values.get("email") || "").trim().toLowerCase();
    const password = String(values.get("password") || "");
    const origin = window.location.origin;
    try {
      if (mode === "login" && twoFactorChallenge) {
        const code = String(values.get("twoFactorCode") || "").trim();
        if (/^\d{6}$/.test(code)) await api("/auth/two-factor/verify-totp", { method: "POST", body: JSON.stringify({ code, trustDevice: false }) });
        else await api("/auth/two-factor/verify-backup-code", { method: "POST", body: JSON.stringify({ code, trustDevice: false }) });
        const profile = await api<{ permissions: string[] }>("/me");
        window.location.assign(profile.permissions.includes("users.read") ? "/admin" : "/tasks");
        return;
      }
      if (mode === "register") {
        await api("/auth/sign-up/email", { method: "POST", credentials: "omit", body: JSON.stringify({ name: values.get("name"), email, password, ...(referralCode.trim() ? { signupReferralCode: referralCode.trim() } : {}) }) });
        window.location.assign("/login?registered=1");
      } else if (mode === "login") {
        const result = await api<{ twoFactorRedirect?: boolean }>("/auth/sign-in/email", { method: "POST", body: JSON.stringify({ email, password, rememberMe: values.get("remember") === "on", callbackURL: `${origin}/login?verified=1` }) });
        if (result.twoFactorRedirect) { setTwoFactorChallenge(true); setMessage("Enter a six-digit code from your authenticator app, or use a recovery code."); return; }
        const profile = await api<{ permissions: string[] }>("/me");
        window.location.assign(profile.permissions.includes("users.read") ? "/admin" : "/tasks");
      } else if (mode === "forgot-password") {
        await api("/auth/request-password-reset", { method: "POST", body: JSON.stringify({ email, redirectTo: `${origin}/reset-password` }) });
        setMessage("If an account exists, a reset link has been sent. Please check your inbox.");
      } else if (mode === "verify-email") {
        await api("/auth/email-otp/verify-email", { method: "POST", credentials: "omit", body: JSON.stringify({ email, otp: String(values.get("otp") || "").trim() }) });
        sessionStorage.removeItem("verificationEmail");
        window.location.assign("/profile");
      } else {
        const token = new URLSearchParams(window.location.search).get("token");
        if (!token) throw new Error("This reset link is incomplete. Request a new one.");
        await api("/auth/reset-password", { method: "POST", body: JSON.stringify({ newPassword: password, token }) });
        setMessage("Password updated. You can now sign in with your new password.");
      }
    } catch (e) { const failure = e as Error & { status?: number }; setError(mode === "verify-email" && failure.status === 400 ? "That code is invalid or expired. Check the newest email, or request another code." : failure.message); }
    finally { setBusy(false); }
  }
  async function resend() {
    setBusy(true); setError(""); setMessage("");
    try {
      await api("/auth/send-verification-email", { method: "POST", credentials: "omit", body: JSON.stringify({ email: emailValue.trim().toLowerCase() }) });
      setMessage("If your account needs verification, a new six-digit code has been emailed. Check your inbox and spam folder; use the newest code within 10 minutes."); setResendWait(60);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <ThemeSurface className="rw-auth-surface"><div className="auth-layout"><aside className="auth-story"><Brand /><div className="auth-story-content"><span className="eyebrow">SMALL STEPS. REAL POSSIBILITY.</span><h1>A little time.<br />A whole lot<br />of potential<span>.</span></h1><p>Discover approved tasks, share your perspective,<br />and build towards your next reward.</p><div className="auth-coin"><Layers2 size={80} /></div><span className="auth-story-check"><ShieldCheck size={19} />Verified tasks. Transparent rewards.</span></div><span className="auth-copyright">Make your time count.</span></aside><main className="auth-main"><div className="rw-auth-top"><Link className="back-link" href="/tasks"><ArrowLeft size={16} />Browse tasks</Link><ThemeToggle /></div><div className="rw-auth-mobile-brand"><Brand /></div><div className="auth-form-wrap"><span className="auth-step">YOUR REWARDLY ACCOUNT</span><h2>{copy[mode][0]}</h2><p>{copy[mode][1]}</p><form onSubmit={submit}>
    {mode === "register" && <label>Full name<input name="name" autoComplete="name" placeholder="Your name" required minLength={2} maxLength={80} /></label>}
    {mode === "register" && <label>Referral code (optional)<input name="referral" value={referralCode} onChange={e => setReferralCode(e.target.value)} maxLength={80} autoComplete="off" placeholder="Invited by a friend?" /><small>The referral is saved when your account is created.</small></label>}
    {mode !== "reset-password" && !twoFactorChallenge && <label>Email address<input type="email" name="email" value={emailValue} onChange={e => setEmailValue(e.target.value)} autoComplete="email" placeholder="you@example.com" required maxLength={254} /></label>}
    {mode === "login" && twoFactorChallenge && <label>Authenticator or recovery code<input name="twoFactorCode" autoComplete="one-time-code" autoFocus required maxLength={64} placeholder="6-digit code" /></label>}
    {mode === "verify-email" && <label>Verification code<input name="otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} placeholder="000000" required style={{fontSize:28,letterSpacing:8,textAlign:"center"}} /></label>}
    {hasPassword && !twoFactorChallenge && <label>Password<div className="password-field"><input name="password" type={visible ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder={mode === "login" ? "Enter your password" : "At least 12 characters"} required minLength={mode === "login" ? 1 : 12} maxLength={128} /><button type="button" className="icon-button" aria-label={visible ? "Hide password" : "Show password"} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>{mode !== "login" && <small>Use a unique password with at least 12 characters.</small>}</label>}
    {mode === "login" && !twoFactorChallenge && <div className="form-options"><label className="checkbox-label"><input type="checkbox" name="remember" defaultChecked />Remember me</label><Link href="/forgot-password">Forgot password?</Link></div>}
    {error && <div className="form-error" role="alert">{error}</div>}
    {message && <div className="form-success" role="status"><CheckCircle2 size={18} />{message}</div>}
    <button className="button dark full-width" disabled={busy}>{busy ? <><span className="rw-spinner" />Please wait…</> : twoFactorChallenge ? "Verify and sign in" : copy[mode][2]}<ArrowRight size={17} /></button>
  </form>{mode === "verify-email" && <button type="button" className="button full-width" disabled={busy || resendWait > 0 || !emailValue.trim()} onClick={resend}>{resendWait ? `Resend code in ${resendWait}s` : "Send / resend code"}</button>}<div className="auth-switch">{mode === "login" ? <>New to Rewardly? <Link href="/register">Create an account</Link><p><Link href="/verify-email">Need to verify your email?</Link></p></> : <>Already have an account? <Link href="/login">Sign in</Link></>}</div><div className="auth-secure"><ShieldCheck size={15} />Your account, protected.</div></div><span className="auth-bottom">Rewardly · Foundation release</span></main></div></ThemeSurface>;
}
