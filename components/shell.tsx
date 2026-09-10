"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ArrowUpRight, Bell, Layers2, LogOut, ShieldCheck } from "lucide-react";
import { api } from "../lib/api";
import { BottomNavigation, DesktopNavigation } from "./rewards/navigation";
import { ThemeSurface, ThemeToggle } from "./rewards/theme";
import { AccountPoints } from "./rewards/account-points";
import { Modal } from "./rewards/primitives";
const pageNames: Record<string, string> = { dashboard: "Dashboard", payments: "Deposits & payments", tasks: "Explore tasks", wallet: "Your rewards", referrals: "Your people", profile: "Your account", admin: "Admin workspace", "how-it-works": "Getting started" };
export function Shell({ children, name, preview = false, admin = false }: { children: React.ReactNode; name?: string; preview?: boolean; admin?: boolean }) {
  const path = usePathname();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notifications, setNotifications] = useState(false);
  async function logout() {
    setBusy(true); setError("");
    try { await api("/auth/sign-out", { method: "POST", body: "{}" }); window.location.assign("/login"); }
    catch (e) { setError((e as Error).message); setBusy(false); }
  }
  return <ThemeSurface className="rw-inner-app"><a href="#rw-page-main" className="rw-skip-link">Skip to page content</a><DesktopNavigation preview={preview} name={name || "Explorer"} admin={admin} onLogout={logout} busy={busy} /><div className="rw-main-wrap"><header className="rw-header rw-page-header">{!preview && <AccountPoints />}<Link href={preview ? "/" : "/dashboard"} className="rw-header-brand" aria-label="Rewardly home"><span className="rw-page-brand"><Layers2 size={23} /></span><strong>Rewardly</strong></Link><div className="rw-page-breadcrumb"><span>YOUR REWARDLY WORLD</span><strong>{pageNames[path.split("/")[1]] || "Your workspace"}</strong></div><div className="rw-header-actions"><ThemeToggle /><button className="rw-icon-button rw-notification-button" aria-label="Open notifications" onClick={() => setNotifications(true)}><Bell size={21} /></button>{preview && <Link href="/login" className="rw-page-signin">Sign in<ArrowUpRight size={14} /></Link>}</div></header><main id="rw-page-main" className="rw-main rw-page-main">{error && <div role="alert" className="rw-error">{error}</div>}{children}<footer className="rw-footer"><span><ShieldCheck size={14} />Small steps. Clear rewards.</span>{!preview && <button disabled={busy} onClick={logout}><LogOut size={14} />{busy ? "Signing out…" : "Sign out"}</button>}<Link href="/how-it-works">How it works<ArrowUpRight size={13} /></Link></footer></main></div><BottomNavigation preview={preview} />{notifications && <Modal title="Notifications" onClose={() => setNotifications(false)}><span className="rw-modal-hero-icon"><Bell size={32} /></span><span className="rw-tag">NOTIFICATIONS</span><h2>You’re all caught up.</h2><p>Task approvals, reward updates, and account alerts will appear here when notifications launch.</p><button className="rw-button rw-button-primary" onClick={() => setNotifications(false)}>Got it</button></Modal>}</ThemeSurface>;
}
