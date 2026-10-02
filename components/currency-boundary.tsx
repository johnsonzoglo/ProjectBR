"use client";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { activateCurrency, type CurrencyPreference } from "../lib/currency";
function browserCountry() { try { return new Intl.Locale(navigator.language).region || ""; } catch { return navigator.language.split("-")[1]?.toUpperCase() || ""; } }
export function CurrencyBoundary({ children, enabled = true }: { children: React.ReactNode; enabled?: boolean }) {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!enabled) { activateCurrency(null); return; }
    let live = true;
    api<CurrencyPreference>(`/currency?country=${encodeURIComponent(browserCountry())}`).then(value => { if (live) { activateCurrency(value); setVersion(current => current + 1); } }).catch(() => { if (live) activateCurrency(null); });
    return () => { live = false; };
  }, [enabled]);
  return <div className="rw-currency-boundary" key={version}>{children}</div>;
}
