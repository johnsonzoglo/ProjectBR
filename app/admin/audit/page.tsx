"use client";
import { useState } from "react";
import { Search } from "lucide-react";
import { AccountGate } from "../../../components/account-gate";
import { AdminShell } from "../../../components/admin-shell";
import { Pagination, RefreshButton, ResourceFeedback, useResource } from "../../../components/rewards/resource";
import { type Profile } from "../../../lib/api";
import { date, type Paged } from "../../../lib/rewards";
type Audit = { id: string; action: string; actorId: string | null; targetId: string | null; reason: string | null; detail: unknown; createdAt: string };
function AuditPage({ profile }: { profile: Profile }) {
  const [page, setPage] = useState(1); const [search, setSearch] = useState(""); const [query, setQuery] = useState(""); const resource = useResource<Paged<Audit>>(`/admin/audit?page=${page}&search=${encodeURIComponent(query)}`);
  return <AdminShell name={profile.user.name} roles={profile.roles} permissions={profile.permissions}><div className="ad-page-title"><div><span className="eyebrow">IMMUTABLE OPERATOR HISTORY</span><h1>Audit log</h1><p>Review administrative decisions, actors, targets, reasons, and recorded changes.</p></div><RefreshButton onClick={resource.refresh} busy={resource.loading} /></div><form className="ad-toolbar" onSubmit={e => { e.preventDefault(); setQuery(search); setPage(1); }}><input aria-label="Search audit log" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search action, actor ID, or target ID" /><button className="rw-button rw-button-primary"><Search size={17} />Search</button></form><ResourceFeedback {...resource} retry={resource.refresh} initial={!resource.data} /><section className="panel"><div className="section-top"><h2>Recorded events</h2><span className="ad-count">{resource.data?.total || 0}</span></div>{resource.data?.items.map(item => <article className="ad-activity" key={item.id}><div><strong>{item.action.replaceAll(".", " · ").replaceAll("_", " ")}</strong><small>{date(item.createdAt)}</small></div>{item.reason && <p>{item.reason}</p>}<small>Actor: {item.actorId || "System"} · Target: {item.targetId || "—"}</small><details><summary>Recorded data</summary><pre>{JSON.stringify(item.detail, null, 2)}</pre></details></article>)}{resource.data?.total === 0 && <p>No matching audit events.</p>}{resource.data && <Pagination page={page} total={resource.data.total} onPage={setPage} busy={resource.loading} />}</section></AdminShell>;
}
export default function Page() { return <AccountGate>{p => p.permissions.includes("audit.read") ? <AuditPage profile={p} /> : <AdminShell name={p.user.name} roles={p.roles} permissions={p.permissions}><h1>Admin access required</h1></AdminShell>}</AccountGate>; }
