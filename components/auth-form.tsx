"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Eye, EyeOff, Layers2, ShieldCheck } from "lucide-react";
import { Brand } from "./brand";
import { api } from "../lib/api";
type Mode = "login" | "register" | "forgot-password" | "reset-password" | "verify-email";
const copy = {
  login: ["Welcome back.", "A little progress is waiting for you.", "Sign in"],
  register: ["Good things start here.", "Create your account. Make your time count.", "Create account"],
  "forgot-password": ["Let’s get you back in.", "We’ll send a password reset link if an account exists.", "Send reset link"],
  "reset-password": ["A fresh start.", "Choose a new password to secure your account.", "Reset password"],
  "verify-email": ["Check your inbox.", "Follow the link in your verification email, then sign in.", "Resend verification email"],
};
export function AuthForm({ mode }: { mode: Mode }) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const hasPassword = ["login", "register", "reset-password"].includes(mode);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const values = new FormData(event.currentTarget);
    const email = String(values.get("email") || "").trim().toLowerCase();
    const password = String(values.get("password") || "");
    const origin = window.location.origin;
    try {
      if (mode === "register") {
        await api("/auth/sign-up/email", { method: "POST", body: JSON.stringify({ name: values.get("name"), email, password, callbackURL: `${origin}/login?verified=1` }) });
        window.location.assign("/verify-email");
      } else if (mode === "login") {
        await api("/auth/sign-in/email", { method: "POST", body: JSON.stringify({ email, password, rememberMe: values.get("remember") === "on" }) });
        window.location.assign("/dashboard");
      } else if (mode === "forgot-password") {
        await api("/auth/request-password-reset", { method: "POST", body: JSON.stringify({ email, redirectTo: `${origin}/reset-password` }) });
        setMessage("If an account exists, a reset link has been sent. Please check your inbox.");
      } else if (mode === "verify-email") {
        await api("/auth/send-verification-email", { method: "POST", body: JSON.stringify({ email, callbackURL: `${origin}/login?verified=1` }) });
        setMessage("If your account needs verification, a new link has been sent.");
      } else {
        const token = new URLSearchParams(window.location.search).get("token");
        if (!token) throw new Error("This reset link is incomplete. Request a new one.");
        await api("/auth/reset-password", { method: "POST", body: JSON.stringify({ newPassword: password, token }) });
        setMessage("Password updated. You can now sign in with your new password.");
      }
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <div className="auth-layout"><aside className="auth-story"><Brand /><div className="auth-story-content"><span className="eyebrow">SMALL STEPS. REAL POSSIBILITY.</span><h1>A little time.<br />A whole lot<br />of potential<span>.</span></h1><p>Discover approved tasks, share your perspective,<br />and build towards your next reward.</p><div className="auth-coin"><Layers2 size={80} /></div><span className="auth-story-check"><ShieldCheck size={19} />Verified tasks. Transparent rewards.</span></div><span className="auth-copyright">Make your time count.</span></aside><main className="auth-main"><Link className="back-link" href="/"><ArrowLeft size={16} />Back to preview</Link><div className="auth-form-wrap"><span className="auth-step">YOUR REWARDLY ACCOUNT</span><h2>{copy[mode][0]}</h2><p>{copy[mode][1]}</p><form onSubmit={submit}>
    {mode === "register" && <label>Full name<input name="name" autoComplete="name" placeholder="Your name" required minLength={2} maxLength={80} /></label>}
    {mode !== "reset-password" && <label>Email address<input type="email" name="email" autoComplete="email" placeholder="you@example.com" required maxLength={254} /></label>}
    {hasPassword && <label>Password<div className="password-field"><input name="password" type={visible ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder={mode === "login" ? "Enter your password" : "At least 12 characters"} required minLength={mode === "login" ? 1 : 12} maxLength={128} /><button type="button" className="icon-button" aria-label={visible ? "Hide password" : "Show password"} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>{mode !== "login" && <small>Use a unique password with at least 12 characters.</small>}</label>}
    {mode === "login" && <div className="form-options"><label className="checkbox-label"><input type="checkbox" name="remember" defaultChecked />Remember me</label><Link href="/forgot-password">Forgot password?</Link></div>}
    {error && <div className="form-error" role="alert">{error}</div>}
    {message && <div className="form-success" role="status"><CheckCircle2 size={18} />{message}</div>}
    <button className="button dark full-width" disabled={busy}>{busy ? "Please wait…" : copy[mode][2]}<ArrowRight size={17} /></button>
  </form><div className="auth-switch">{mode === "login" ? <>New to Rewardly? <Link href="/register">Create an account</Link><p><Link href="/verify-email">Need to verify your email?</Link></p></> : <>Already have an account? <Link href="/login">Sign in</Link></>}</div><div className="auth-secure"><ShieldCheck size={15} />Your account, protected.</div></div><span className="auth-bottom">Rewardly · Foundation release</span></main></div>;
}
