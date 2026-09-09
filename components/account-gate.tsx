"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Profile } from "../lib/api";
export function AccountGate({ children, loading }: { children: (profile: Profile) => React.ReactNode; loading?: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api<Profile>("/me").then(p => { if (active) setProfile(p); }).catch(e => {
      if (e.status === 401) window.location.replace("/login");
      else if (active) setError(e.message);
    });
    return () => { active = false; };
  }, []);
  if (error) return <div className="gate-state"><h1>We couldn’t open your account</h1><p role="alert">{error}</p><Link className="button dark" href="/login">Back to sign in</Link></div>;
  if (!profile) return loading || <div className="gate-state" aria-live="polite"><span className="loading-dot" /><p>Opening your workspace…</p></div>;
  return children(profile);
}
