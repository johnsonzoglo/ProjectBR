"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ArrowUpRight, ChartNoAxesCombined, CircleHelp, ClipboardCheck, Crown, LayoutDashboard, LogOut, Menu, Settings2, ShieldCheck, Users, Wallet, X } from "lucide-react";
import { Brand } from "./brand";
import { api } from "../lib/api";
const navigation = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "Explore tasks", href: "/tasks", icon: ClipboardCheck },
  { label: "My wallet", href: "/wallet", icon: Wallet },
  { label: "Referrals", href: "/referrals", icon: Users },
  { label: "Membership", href: "/membership", icon: Crown },
];
export function Shell({ children, name, preview = false, admin = false }: { children: React.ReactNode; name?: string; preview?: boolean; admin?: boolean }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    try { await api("/auth/sign-out", { method: "POST", body: "{}" }); window.location.assign("/login"); }
    catch (e) { setError((e as Error).message); }
  }
  return <div className="app-shell">
    <button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => setOpen(true)}><Menu /></button>
    {open && <button className="nav-scrim" aria-label="Close navigation" onClick={() => setOpen(false)} />}
    <aside className={`sidebar ${open ? "open" : ""}`}>
      <div className="sidebar-brand"><Brand /><button className="mobile-close icon-button" aria-label="Close navigation" onClick={() => setOpen(false)}><X /></button></div>
      <div className="workspace"><span className="workspace-logo">R</span><span>Personal workspace<small>Your next opportunity</small></span><span className="workspace-dot" /></div>
      <span className="nav-heading">WORKSPACE</span>
      <nav aria-label="Main navigation">{navigation.map(({ label, href, icon: Icon }) => <Link key={href} href={href} onClick={() => setOpen(false)} className={`nav-link ${path === href || (preview && path === "/" && href === "/dashboard") ? "active" : ""}`}><Icon size={19} />{label}{href === "/tasks" && <span className="soon-dot" />}</Link>)}</nav>
      <div className="sidebar-promo"><span className="promo-icon"><ChartNoAxesCombined size={22} /></span><strong>Small tasks.<br />Bigger possibilities.</strong><p>A little progress, every day.</p><Link href="/how-it-works">How rewards work <ArrowUpRight size={16} /></Link></div>
      <nav className="bottom-nav" aria-label="Account navigation">
        {admin && <Link className={`nav-link ${path === "/admin" ? "active" : ""}`} href="/admin"><ShieldCheck size={19} />Admin portal</Link>}
        <Link className={`nav-link ${path === "/profile" ? "active" : ""}`} href="/profile"><Settings2 size={19} />Account settings</Link>
        <Link className="nav-link" href="/how-it-works"><CircleHelp size={19} />Getting started</Link>
      </nav>
      <div className="sidebar-user"><span className="avatar">{name?.slice(0, 1).toUpperCase() || "G"}</span><span><strong>{name || "Guest explorer"}</strong><small>{preview ? "Preview workspace" : "Personal account"}</small></span>{preview ? <Link href="/login" aria-label="Sign in"><ArrowUpRight size={18} /></Link> : <button className="icon-button" aria-label="Sign out" onClick={logout}><LogOut size={17} /></button>}</div>
      {error && <p role="alert" className="error-text">{error}</p>}
    </aside>
    <div className="main-wrap"><header className="topbar"><div className="breadcrumb">Workspace <span>/</span> <strong>{path === "/" || path === "/dashboard" ? "Overview" : path.split("/")[1].replaceAll("-", " ")}</strong></div><div className="topbar-actions"><span className="build-tag"><i />Foundation release</span>{preview ? <Link href="/login" className="text-link">Sign in <ArrowUpRight size={16} /></Link> : <Link href="/profile" className="avatar small">{name?.slice(0, 1).toUpperCase() || "U"}</Link>}</div></header><main className="main-content">{children}</main><footer className="app-footer"><span>© {new Date().getFullYear()} Rewardly</span><span>Make your time count.</span></footer></div>
  </div>;
}
