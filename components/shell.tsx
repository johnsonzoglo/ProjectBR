"use client";
import { FloatingSupport } from "./floating-support";
import { NotificationCenter } from "./notification-center";
import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, LogOut, ShieldCheck } from "lucide-react";
import { api } from "../lib/api";
import { BottomNavigation, DesktopNavigation } from "./rewards/navigation";
import { ThemeSurface, ThemeToggle } from "./rewards/theme";
import { AccountPoints } from "./rewards/account-points";
import { ConnectionStatus } from "./connection-status";

export function Shell({ children, name, preview = false, admin = false }: { children: React.ReactNode; name?: string; preview?: boolean; admin?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function logout() {
    setBusy(true); setError("");
    try { await api("/auth/sign-out", { method: "POST", body: "{}" }); window.location.assign("/login"); }
    catch (e) { setError((e as Error).message); setBusy(false); }
  }
  return <ThemeSurface className="rw-inner-app user-neon"><ConnectionStatus/><a href="#rw-page-main" className="rw-skip-link">Skip to page content</a><DesktopNavigation preview={preview} name={name || "Explorer"} admin={admin} onLogout={logout} busy={busy} /><div className="rw-main-wrap"><header className="rw-header rw-page-header">{!preview && <AccountPoints />}<Link href="/profile" className="neon-welcome"><span className="neon-avatar">{(name || "U").slice(0,1).toUpperCase()}<i /></span><span><strong>Hi, {(name || "Explorer").split(" ")[0]} <span aria-hidden="true">&#128075;</span></strong><small>Complete tasks. Earn rewards.</small></span></Link><div className="rw-header-actions"><ThemeToggle />{!preview && <NotificationCenter />}{preview && <Link href="/login" className="rw-page-signin">Sign in<ArrowUpRight size={14} /></Link>}</div></header><main id="rw-page-main" className="rw-main rw-page-main">{error && <div role="alert" className="rw-error">{error}</div>}{children}<footer className="rw-footer"><span><ShieldCheck size={14} />Small steps. Clear rewards.</span>{!preview && <button disabled={busy} onClick={logout}><LogOut size={14} />{busy ? "Signing out…" : "Sign out"}</button>}<Link href="/how-it-works">How it works<ArrowUpRight size={13} /></Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/contact">Contact</Link></footer></main></div><BottomNavigation preview={preview} />{!preview && <FloatingSupport admin={admin} />}</ThemeSurface>;
}
