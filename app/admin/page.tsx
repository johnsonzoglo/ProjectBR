"use client";
import { useEffect, useState } from "react";
import { AccountGate } from "../../components/account-gate";
import { Shell } from "../../components/shell";
import { api, type Profile } from "../../lib/api";
type UserRow = { id: string; name: string; email: string; status: string; emailVerified: boolean; roles: { role: { name: string } }[] };
type Audit = { id: string; action: string; reason: string | null; createdAt: string; actorId: string | null; targetId: string | null };
function AdminContent({ profile }: { profile: Profile }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [error, setError] = useState("");
  const [target, setTarget] = useState<UserRow | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const allowed = profile.permissions.includes("users.read");
  async function refresh() {
    const data = await api<{ items: UserRow[]; total: number }>(`/admin/users?page=${page}`); setUsers(data.items); setTotal(data.total);
    if (profile.permissions.includes("audit.read")) setAudit(await api<Audit[]>("/admin/audit-logs"));
  }
  useEffect(() => {
    if (!allowed) return;
    let active = true;
    api<{ items: UserRow[]; total: number }>(`/admin/users?page=${page}`).then(data => { if (active) { setUsers(data.items); setTotal(data.total); } }).catch(e => setError(e.message));
    if (profile.permissions.includes("audit.read")) api<Audit[]>("/admin/audit-logs").then(data => { if (active) setAudit(data); }).catch(e => setError(e.message));
    return () => { active = false; };
  }, [page, allowed, profile.permissions]);
  async function update(event: React.FormEvent) {
    event.preventDefault(); if (!target) return; setBusy(true); setError("");
    try { await api(`/admin/users/${target.id}/status`, { method: "POST", body: JSON.stringify({ status: target.status === "active" ? "suspended" : "active", reason }) }); setTarget(null); setReason(""); await refresh(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <Shell name={profile.user.name} admin={allowed}><div className="page-heading"><div><div className="eyebrow">PLATFORM OPERATIONS</div><h1>Admin workspace.</h1><p>Manage accounts and review recorded changes.</p></div></div>{!allowed ? <div className="form-error" role="alert">You do not have permission to access the admin portal.</div> : <>{error && <div className="form-error" role="alert">{error}</div>}<section className="panel"><div className="section-top"><h2>Users</h2><span className="pill">{total} accounts</span></div><div className="table-wrap"><table><thead><tr><th>User</th><th>Status</th><th>Email</th><th>Role</th><th>Action</th></tr></thead><tbody>{users.map(u => <tr key={u.id}><td>{u.name}<small>{u.email}</small></td><td><span className={`status-badge ${u.status}`}>{u.status}</span></td><td>{u.emailVerified ? "Verified" : "Pending"}</td><td>{u.roles.map(r => r.role.name).join(", ")}</td><td>{u.id !== profile.user.id && u.roles.every(r => r.role.name === "User") && profile.permissions.includes("users.manage") && <button className="button light" onClick={() => { setTarget(u); setReason(""); }}>{u.status === "active" ? "Suspend" : "Activate"}</button>}</td></tr>)}</tbody></table></div><div className="admin-actions"><button className="button light" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button><button className="button light" disabled={page * 20 >= total} onClick={() => setPage(page + 1)}>Next</button></div></section>{target && <section className="panel" style={{ marginTop: 20 }}><h2>{target.status === "active" ? "Suspend" : "Activate"} {target.name}</h2><form className="profile-form" onSubmit={update}><label>Recorded reason<input value={reason} onChange={e => setReason(e.target.value)} required minLength={10} maxLength={500} placeholder="Explain this account status change" /></label><div className="admin-actions"><button className="button dark" disabled={busy}>Confirm change</button><button type="button" className="button light" onClick={() => setTarget(null)}>Cancel</button></div></form></section>}<section className="panel" style={{ marginTop: 24 }}><h2>Latest audit events</h2><div className="audit-list">{audit.map(a => <div className="audit-item" key={a.id}><strong>{a.action}</strong>{a.reason && <p>{a.reason}</p>}<small>{new Date(a.createdAt).toLocaleString()} · Actor: {a.actorId || "Operator"} · Target: {a.targetId || "—"}</small></div>)}</div></section></>}</Shell>;
}
export default function Page() { return <AccountGate>{profile => <AdminContent profile={profile} />}</AccountGate>; }
