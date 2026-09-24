"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { api, type Profile } from "../lib/api";
import { ThemeSurface } from "./rewards/theme";
import { DashboardSkeleton } from "./rewards/dashboard-skeleton";
export function AccountGate({ children, loading }: { children: (profile: Profile) => React.ReactNode; loading?: React.ReactNode }) {
  const path = usePathname();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api<Profile>("/me").then(p => { if (active) { if (path.startsWith("/admin") && path !== "/admin/security" && p.staffSecurity && !p.staffSecurity.twoFactorEnabled) window.location.replace("/admin/security"); else setProfile(p); } }).catch(e => {
      if (e.status === 401) window.location.replace("/login");
      else if (active) setError(e.message);
    });
    return () => { active = false; };
  }, [path]);
  if (error) return <ThemeSurface className="rw-state-surface"><div className="gate-state"><span className="rw-tag">ACCOUNT ACCESS</span><h1>We couldn’t open your account</h1><p role="alert">{error}</p><Link className="rw-button rw-button-primary" href="/login">Back to sign in</Link></div></ThemeSurface>;
  if (!profile) return loading || <DashboardSkeleton />;
  return children(profile);
}
