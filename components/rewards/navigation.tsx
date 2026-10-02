"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleHelp, ClipboardCheck, House, Layers2, LogIn, LogOut, Mail, ShieldCheck, Star, UserPlus, UserRound, Users, Wallet } from "lucide-react";
const tabs = [
  { label: "Tasks", href: "/tasks", icon: ClipboardCheck },
  { label: "Wallet", href: "/wallet", icon: Wallet },
  { label: "Membership", href: "/membership", icon: Star },
  { label: "Referrals", href: "/referrals", icon: Users },
  { label: "Profile", href: "/profile", icon: UserRound },
];
const publicTabs = [
  { label: "Home", href: "/", icon: House },
  { label: "How it works", href: "/how-it-works", icon: CircleHelp },
  { label: "Contact", href: "/contact", icon: Mail },
  { label: "Sign in", href: "/login", icon: LogIn },
  { label: "Join", href: "/register", icon: UserPlus },
];
function matches(path: string, href: string) { return (href === "/wallet" && path === "/payments") || path === href || path.startsWith(href + "/"); }
export function BottomNavigation({ preview }: { preview: boolean }) {
  const path = usePathname();
  const items = preview ? publicTabs : tabs;
  return <nav className="rw-bottom-nav" aria-label="Mobile navigation">{items.map(({ label, href, icon: Icon }) => {
    const active = matches(path, href);
    return <Link key={label} href={href} className={active ? "is-active" : ""} aria-current={active ? "page" : undefined}><span><Icon size={23} strokeWidth={active ? 2.4 : 1.8} /></span><small>{label === "Referrals" ? "Refer" : label === "Membership" ? "Plans" : label === "How it works" ? "How" : label}</small></Link>;
  })}</nav>;
}
export function DesktopNavigation({ preview, name, admin, onLogout, busy }: { preview: boolean; name: string; admin: boolean; onLogout: () => void; busy: boolean }) {
  const path = usePathname();
  const items = preview ? publicTabs : tabs;
  return <aside className="rw-sidebar"><Link className="rw-brand" href={preview ? "/" : admin ? "/admin" : "/tasks"}><span><Layers2 size={23} strokeWidth={2.5} /></span>NuevaReviews<span className="rw-brand-period">.</span></Link><div className="rw-sidebar-caption">A LITTLE EVERY DAY.</div><nav aria-label="Desktop navigation">{items.map(({ label, href, icon: Icon }) => {
    const active = matches(path, href);
    return <Link key={label} href={href} className={active ? "is-active" : ""} aria-current={active ? "page" : undefined}><Icon size={20} />{label}{active && <span className="rw-nav-dot" />}</Link>;
  })}{admin && <Link href="/admin" className={matches(path, "/admin") ? "is-active" : ""} aria-current={matches(path, "/admin") ? "page" : undefined}><ShieldCheck size={20} />Admin portal</Link>}</nav><div className="rw-sidebar-account"><Link href={preview ? "/login" : "/profile"} className="rw-avatar" aria-label={preview ? "Sign in" : "Your profile"}>{preview ? <UserRound size={21} /> : name.slice(0, 1).toUpperCase()}</Link><span><strong>{preview ? "Your journey awaits" : name}</strong><small>{preview ? "Explore the preview" : "Verified account"}</small></span>{!preview && <button className="rw-icon-button" aria-label="Sign out" disabled={busy} onClick={onLogout}><LogOut size={17} /></button>}</div>{preview && <Link href="/register" className="rw-button rw-button-primary rw-sidebar-signup">Let’s get started</Link>}</aside>;
}
