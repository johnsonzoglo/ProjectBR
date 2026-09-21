"use client";
import { useEffect, useState } from "react";
import { Repeat2 } from "lucide-react";
export function TaskRepeatInfo({ hours, nextAt, completed }: { hours?: number | null; nextAt?: string | null; completed?: boolean }) {
 const [now, setNow] = useState<number | null>(null);
 useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
 if (!hours) return null;
 const remaining = now && nextAt ? Math.max(0, Math.ceil((new Date(nextAt).getTime() - now) / 1000)) : null;
 const time = remaining === null ? "Loading countdown?" : remaining === 0 ? "New round ready. Refresh tasks." : Math.floor(remaining / 3600) + "h " + Math.floor(remaining % 3600 / 60) + "m " + remaining % 60 + "s";
 return <div className="rw-repeat-info"><strong><Repeat2 size={16} />{hours === 24 ? "Repeats daily" : hours === 168 ? "Repeats weekly" : "Repeats every " + hours + " hours"}</strong>{nextAt ? <span>{completed ? "Next chance to earn" : "Next round"}: {time}</span> : <span>Final round</span>}<small>One reward per round</small></div>;
}
