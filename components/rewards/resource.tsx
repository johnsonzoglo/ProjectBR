"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { api } from "../../lib/api";
export function useResource<T>(path: string, intervalMs = 30000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const sequence = useRef(0);
  const invalidate = useCallback(() => { sequence.current++; }, []);
  const refresh = useCallback(async () => {
    const current = ++sequence.current; setLoading(true);
    try { const result = await api<T>(path); if (sequence.current === current) { setData(result); setError(""); } }
    catch (e) { if (sequence.current === current) setError((e as Error).message); }
    finally { if (sequence.current === current) setLoading(false); }
  }, [path]);
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => { if (!cancelled) { setData(null); return refresh(); } });
    const focus = () => { if (!document.hidden) void refresh(); };
    window.addEventListener("focus", focus);
    window.addEventListener("rewardly:data-changed", focus);
    const timer = window.setInterval(focus, intervalMs);
    return () => { cancelled = true; invalidate(); window.removeEventListener("focus", focus); window.removeEventListener("rewardly:data-changed", focus); clearInterval(timer); };
  }, [refresh, invalidate, intervalMs]);
  return { data, error, loading, refresh };
}
export function ResourceFeedback({ loading, error, retry, initial = false }: { loading: boolean; error: string; retry: () => void; initial?: boolean }) {
  return <>{error && <div className="form-error rw-feedback" role="alert"><span>{error}</span><button type="button" className="rw-button rw-button-secondary" onClick={retry}>Try again</button></div>}{loading && initial && <div className="rw-data-loading" role="status"><span className="rw-spinner" />Loading your latest activity…</div>}</>;
}
export function RefreshButton({ onClick, busy }: { onClick: () => void; busy: boolean }) {
  return <button type="button" className="rw-button rw-button-secondary" onClick={onClick} disabled={busy}><RefreshCw size={15} />{busy ? "Refreshing…" : "Refresh"}</button>;
}
export function Pagination({ page, total, onPage, busy }: { page: number; total: number; onPage: (page: number) => void; busy: boolean }) {
  if (total <= 20) return null;
  return <nav className="rw-pagination" aria-label="History pages"><button className="rw-button rw-button-secondary" disabled={busy || page === 1} onClick={() => onPage(page - 1)}>Previous</button><span>Page {page} of {Math.ceil(total / 20)}</span><button className="rw-button rw-button-secondary" disabled={busy || page * 20 >= total} onClick={() => onPage(page + 1)}>Next</button></nav>;
}
