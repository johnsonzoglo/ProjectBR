"use client";

import { FloatingSupport } from "./floating-support";
import { NotificationCenter } from "./notification-center";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowUpRight, ChevronRight, ClipboardCheck, ClipboardList, Crown, GitCompareArrows, History, LayoutDashboard, LockKeyhole, LogOut, Megaphone, Menu, MessageCircle, Network, SlidersHorizontal, Sparkles, UserCog, Users, Wallet, X } from "lucide-react";
import { ThemeSurface, ThemeToggle } from "./rewards/theme";
import { api } from "../lib/api";

const groups = [
  { label: "Workspace", items: [
    { href: "/admin", label: "Overview", icon: LayoutDashboard },
    { href: "/admin/tasks", label: "Tasks", icon: ClipboardList },
    { href: "/admin/reviews", label: "Task reviews", icon: ClipboardCheck },
    { href: "/admin/users", label: "Users", icon: Users },
    { href: "/admin/chat", label: "Support", icon: MessageCircle },
  ] },
  { label: "Money & growth", items: [
    { href: "/admin/payments", label: "Deposits", icon: Wallet },
    { href: "/admin/withdrawals", label: "Withdrawals", icon: ArrowUpRight },
    { href: "/admin/reconciliation", label: "Reconciliation", icon: GitCompareArrows },
    { href: "/admin/membership", label: "Membership", icon: Crown },
    { href: "/admin/referrals", label: "Referrals", icon: Network },
  ] },
  { label: "Platform", items: [
    { href: "/admin/promotions", label: "Banners & ads", icon: Megaphone },
    { href: "/admin/staff", label: "Staff access", icon: UserCog },
    { href: "/admin/settings", label: "Rules & settings", icon: SlidersHorizontal },
    { href: "/admin/security", label: "Security", icon: LockKeyhole },
    { href: "/admin/audit", label: "Audit log", icon: History },
  ] },
];

export function AdminShell({ children, name = "Administrator", roles = [], permissions = [] }: { children: React.ReactNode; name?: string; roles?: string[]; permissions?: string[] }) {
  const path = usePathname();
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reauthOpen, setReauthOpen] = useState(false);
  const [reauthPassword, setReauthPassword] = useState("");
  const [reauthMessage, setReauthMessage] = useState("");
  useEffect(() => { const open = () => { setReauthMessage(""); setReauthOpen(true); }; window.addEventListener("rewardly:reauth-required", open); return () => window.removeEventListener("rewardly:reauth-required", open); }, []);
  const active = groups.flatMap(group => group.items).find(item => item.href === path);
  const groupName = groups.find(group => group.items.some(item => item.href === path))?.label || "Workspace";
  return <ThemeSurface className="admin-app">
    <a href="#admin-main" className="rw-skip-link">Skip to content</a>
    {menu && <button className="ad-backdrop" aria-label="Close navigation" onClick={() => setMenu(false)} />}
    <aside className={`ad-sidebar ${menu ? "is-open" : ""}`}>
      <div className="ad-brand-row"><Link href="/admin" className="ad-brand" onClick={() => setMenu(false)}><span className="ad-brand-mark"><Sparkles size={21} /></span><span>Rewardly<strong>ADMIN CONSOLE</strong></span></Link><button className="ad-sidebar-close" aria-label="Close admin menu" onClick={() => setMenu(false)}><X size={19}/></button></div>
      <nav aria-label="Admin navigation">{groups.map(group => {
        const items = group.items.filter(item => item.href !== "/admin/staff" || roles.includes("super_admin")).filter(item => item.href !== "/admin/reconciliation" || permissions.includes("rewards.manage"));
        return <div className="ad-nav-group" key={group.label}><div className="ad-nav-label">{group.label}</div>{items.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setMenu(false)} className={path === href ? "is-active" : ""} aria-current={path === href ? "page" : undefined}><Icon size={18} strokeWidth={1.9} /><span>{label}</span>{path === href && <ChevronRight className="ad-nav-chevron" size={15}/>}</Link>)}</div>;
      })}</nav>
      <div className="ad-sidebar-footer"><div className="ad-operator"><span className="ad-avatar">{name[0]?.toUpperCase()}</span><div><strong>{name}</strong><small>{roles.includes("super_admin") ? "Super admin" : "Administrator"}</small></div></div><button className="ad-signout" disabled={busy} onClick={async () => { setBusy(true); setError(""); try { await api("/auth/sign-out", { method: "POST", body: "{}" }); window.location.assign("/login"); } catch (e) { setError((e as Error).message); setBusy(false); } }}><LogOut size={17} />{busy ? "Signing out…" : "Sign out"}</button></div>
    </aside>
    <div className="ad-workspace"><header className="ad-header"><button className="ad-menu rw-icon-button" aria-label={menu ? "Close admin navigation" : "Open admin navigation"} aria-expanded={menu} onClick={() => setMenu(!menu)}>{menu ? <X size={22} /> : <Menu size={22} />}</button><div className="ad-header-location"><small>ADMIN / {groupName.toUpperCase()}</small><strong>{active?.label || "Overview"}</strong></div><span className="ad-header-status"><span />Platform online</span><div className="ad-header-tools"><NotificationCenter /><ThemeToggle /><span className="ad-header-avatar" title={name}>{name[0]?.toUpperCase()}</span></div></header><main id="admin-main" className="ad-main">{error && <p className="form-error" role="alert">{error}</p>}{children}</main></div>
    {reauthOpen && <div className="ad-backdrop" style={{ display: "grid", placeItems: "center", zIndex: 1000 }}><form role="dialog" aria-modal="true" aria-label="Confirm admin password" className="panel" style={{ width: "min(440px, calc(100vw - 32px))", padding: 24 }} onSubmit={async event => { event.preventDefault(); setBusy(true); setReauthMessage(""); try { await api("/admin/security/confirm", { method: "POST", body: JSON.stringify({ password: reauthPassword }) }); setReauthPassword(""); setReauthOpen(false); setError("Password confirmed. Retry your change."); } catch (failure) { setReauthMessage((failure as Error).message); } finally { setBusy(false); } }}><h2>Confirm your identity</h2><p>This change needs a recent password confirmation. Your confirmation lasts 10 minutes.</p><label>Current password<input type="password" autoComplete="current-password" value={reauthPassword} onChange={event => setReauthPassword(event.target.value)} required autoFocus /></label>{reauthMessage && <p className="form-error" role="alert">{reauthMessage}</p>}<div style={{ display: "flex", gap: 12, marginTop: 16 }}><button className="rw-button rw-button-primary" disabled={busy}>Confirm</button><button className="rw-button" type="button" onClick={() => { setReauthOpen(false); setReauthPassword(""); }}>Cancel</button></div></form></div>}
    <FloatingSupport admin />
  </ThemeSurface>;
}
