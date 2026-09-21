"use client";
import { FloatingSupport } from "./floating-support";
import { NotificationCenter } from "./notification-center";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { MessageCircle, LayoutDashboard, Users, ClipboardList, ClipboardCheck, Wallet, ArrowUpRight, SlidersHorizontal, Network, History, ShieldCheck, LogOut, Menu, X, Crown } from "lucide-react";
import { ThemeSurface, ThemeToggle } from "./rewards/theme";
import { api } from "../lib/api";

const sections = [
  { href: "/admin/promotions", label: "Banners & ads", icon: LayoutDashboard },
  { href: "/admin/chat", label: "Support chat", icon: MessageCircle },
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users & balances", icon: Users },
  { href: "/admin/tasks", label: "Tasks workspace", icon: ClipboardList },
  { href: "/admin/reviews", label: "Verification review", icon: ClipboardCheck },
  { href: "/admin/payments", label: "Deposits & wallets", icon: Wallet },
  { href: "/admin/membership", label: "Membership", icon: Crown },
  { href: "/admin/withdrawals", label: "Withdrawals", icon: ArrowUpRight },
  { href: "/admin/referrals", label: "Referrals", icon: Network },
  { href: "/admin/settings", label: "Rules & settings", icon: SlidersHorizontal },
  { href: "/admin/audit", label: "Audit log", icon: History },
];

export function AdminShell({ children, name = "Administrator" }: { children: React.ReactNode; name?: string }) {
  const path = usePathname();
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <ThemeSurface className="admin-app">
    <a href="#admin-main" className="rw-skip-link">Skip to content</a>
    {menu && <button className="ad-backdrop" aria-label="Close navigation" onClick={() => setMenu(false)} />}
    <aside className={`ad-sidebar ${menu ? "is-open" : ""}`}>
      <Link href="/admin" className="ad-brand"><ShieldCheck size={29} /><span>rewardly<strong>CONTROL CENTER</strong></span></Link>
      <div className="ad-nav-label">PLATFORM MANAGEMENT</div>
      <nav aria-label="Admin navigation">{sections.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setMenu(false)} className={path === href ? "is-active" : ""} aria-current={path === href ? "page" : undefined}><Icon size={19} /><span>{label}</span></Link>)}</nav>
      <div className="ad-operator"><span className="ad-avatar">{name[0]?.toUpperCase()}</span><div><strong>{name}</strong><small>Administration workspace</small></div></div>
      <button className="ad-signout" disabled={busy} onClick={async () => { setBusy(true); setError(""); try { await api("/auth/sign-out", { method: "POST", body: "{}" }); window.location.assign("/login"); } catch (e) { setError((e as Error).message); setBusy(false); } }}><LogOut size={17} />{busy ? "Signing out…" : "Sign out"}</button>
    </aside>
    <div className="ad-workspace"><header className="ad-header"><button className="ad-menu rw-icon-button" aria-label={menu ? "Close admin navigation" : "Open admin navigation"} aria-expanded={menu} onClick={() => setMenu(!menu)}>{menu ? <X size={22} /> : <Menu size={22} />}</button><div><small>ADMINISTRATION</small><strong>{sections.find(s => s.href === path)?.label || "Reward operations"}</strong></div><span className="ad-header-status"><span />Live platform data</span><NotificationCenter /><ThemeToggle /></header><main id="admin-main" className="ad-main">{error && <p className="form-error" role="alert">{error}</p>}{children}</main></div>
    <FloatingSupport admin />
  </ThemeSurface>;
}
