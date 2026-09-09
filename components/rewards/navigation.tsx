"use client";
import Link from "next/link";
import { ClipboardCheck, Crown, Gift, House, Layers2, LogOut, ShieldCheck, Sparkles, UserRound, Users } from "lucide-react";
const tabs = [
  { label: "Home", href: "/dashboard", icon: House },
  { label: "Tasks", href: "/tasks", icon: ClipboardCheck },
  { label: "Rewards", href: "/wallet", icon: Gift },
  { label: "Referrals", href: "/referrals", icon: Users },
  { label: "Profile", href: "/profile", icon: UserRound },
];
export function BottomNavigation({ preview }: { preview: boolean }) {
  return <nav className="rw-bottom-nav" aria-label="Mobile navigation">{tabs.map(({ label, href, icon: Icon }, i) => <Link key={label} href={i === 0 && preview ? "/" : href} className={i === 0 ? "is-active" : ""} aria-current={i === 0 ? "page" : undefined}><span><Icon size={21} strokeWidth={i === 0 ? 2.4 : 1.8} /></span><small>{label}</small></Link>)}</nav>;
}
export function DesktopNavigation({ preview, name, admin, onLogout, busy }: { preview: boolean; name: string; admin: boolean; onLogout: () => void; busy: boolean }) {
  return <aside className="rw-sidebar"><Link className="rw-brand" href={preview ? "/" : "/dashboard"}><span><Layers2 size={23} strokeWidth={2.5} /></span>rewardly<span className="rw-brand-period">.</span></Link><div className="rw-sidebar-caption">A LITTLE EVERY DAY.</div><nav aria-label="Desktop navigation">{tabs.map(({ label, href, icon: Icon }, i) => <Link key={label} href={i === 0 && preview ? "/" : href} className={i === 0 ? "is-active" : ""} aria-current={i === 0 ? "page" : undefined}><Icon size={20} />{label}{i === 0 && <span className="rw-nav-dot" />}</Link>)}<Link href="/membership"><Crown size={20} />Membership</Link>{admin && <Link href="/admin"><ShieldCheck size={20} />Admin portal</Link>}</nav><div className="rw-sidebar-promo"><span className="rw-promo-star"><Sparkles size={27} /></span><h2>Small steps.<br />Big possibilities.</h2><p>Your next little win<br />is closer than you think.</p><Link href="/how-it-works">How it works <span>↗</span></Link></div><div className="rw-sidebar-account"><Link href={preview ? "/login" : "/profile"} className="rw-avatar">{preview ? <UserRound size={21} /> : name.slice(0, 1).toUpperCase()}</Link><span><strong>{preview ? "Your journey awaits" : name}</strong><small>{preview ? "Explore the preview" : "Verified account"}</small></span>{!preview && <button className="rw-icon-button" aria-label="Sign out" disabled={busy} onClick={onLogout}><LogOut size={17} /></button>}</div>{preview && <Link href="/register" className="rw-button rw-button-primary rw-sidebar-signup">Let’s get started</Link>}</aside>;
}
