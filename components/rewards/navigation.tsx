"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardCheck, Layers2, LogOut, ShieldCheck, Star, UserRound, Users, Wallet } from "lucide-react";
const tabs = [
  { label: "Tasks", href: "/tasks", icon: ClipboardCheck },
  { label: "Wallet", href: "/wallet", icon: Wallet },
  { label: "Membership", href: "/membership", icon: Star },
  { label: "Referrals", href: "/referrals", icon: Users },
  { label: "Profile", href: "/profile", icon: UserRound },
];
function matches(path: string, href: string) { return (href === "/wallet" && path === "/payments") || path === href || path.startsWith(href + "/"); }
export function BottomNavigation(_props: { preview: boolean }) {
  const path = usePathname();
  return <nav className="rw-bottom-nav" aria-label="Mobile navigation">{tabs.map(({ label, href, icon: Icon }) => {
    const active = matches(path, href);
    return <Link key={label} href={href} className={active ? "is-active" : ""} aria-current={active ? "page" : undefined}><span><Icon size={23} strokeWidth={active ? 2.4 : 1.8} /></span><small>{label === "Referrals" ? "Refer" : label}</small></Link>;
  })}</nav>;
}
export function DesktopNavigation({ preview, name, admin, onLogout, busy }: { preview: boolean; name: string; admin: boolean; onLogout: () => void; busy: boolean }) {
  const path = usePathname();
  return <aside className="rw-sidebar"><Link className="rw-brand" href={admin ? "/admin" : "/tasks"}><span><Layers2 size={23} strokeWidth={2.5} /></span>rewardly<span className="rw-brand-period">.</span></Link><div className="rw-sidebar-caption">A LITTLE EVERY DAY.</div><nav aria-label="Desktop navigation">{tabs.map(({ label, href, icon: Icon }) => {
    const active = matches(path, href);
    return <Link key={label} href={href} className={active ? "is-active" : ""} aria-current={active ? "page" : undefined}><Icon size={20} />{label}{active && <span className="rw-nav-dot" />}</Link>;
  })}{admin && <Link href="/admin" className={matches(path, "/admin") ? "is-active" : ""} aria-current={matches(path, "/admin") ? "page" : undefined}><ShieldCheck size={20} />Admin portal</Link>}</nav><div className="rw-sidebar-account"><Link href={preview ? "/login" : "/profile"} className="rw-avatar" aria-label={preview ? "Sign in" : "Your profile"}>{preview ? <UserRound size={21} /> : name.slice(0, 1).toUpperCase()}</Link><span><strong>{preview ? "Your journey awaits" : name}</strong><small>{preview ? "Explore the preview" : "Verified account"}</small></span>{!preview && <button className="rw-icon-button" aria-label="Sign out" disabled={busy} onClick={onLogout}><LogOut size={17} /></button>}</div>{preview && <Link href="/register" className="rw-button rw-button-primary rw-sidebar-signup">Let’s get started</Link>}</aside>;
}
