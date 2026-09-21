"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { AccountGate } from "../../../components/account-gate";
import { AdminShell } from "../../../components/admin-shell";
import { Modal } from "../../../components/rewards/primitives";
import { RefreshButton, ResourceFeedback, useResource } from "../../../components/rewards/resource";
import { api, type Profile } from "../../../lib/api";
import { money } from "../../../lib/rewards";

type Plan = { id: string; key: string; name: string; description: string; priceCents: number; durationDays: number | null; earningPotentialCents: number; minimumReferrals: number; minimumCompletedTasks: number; active: boolean; _count: { purchases: number }; accessGrants: Array<{ targetPlan: { id: string; name: string; key: string } }> };
type Draft = Omit<Plan, "id" | "_count" | "accessGrants"> & { accessToPlanIds: string[] };

function MembershipAdmin({ profile }: { profile: Profile }) {
  const resource = useResource<Plan[]>("/admin/rewards/membership");
  const [editor, setEditor] = useState<{ id: string; data: Draft } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const plans = resource.data || [];

  function openEditor(plan?: Plan) {
    setError("");
    setEditor({ id: plan?.id || "", data: { key: plan?.key || "starter", name: plan?.name || "Starter", description: plan?.description || "", priceCents: plan?.priceCents || 500, durationDays: plan?.durationDays ?? 30, earningPotentialCents: plan?.earningPotentialCents || 0, minimumReferrals: plan?.minimumReferrals || 0, minimumCompletedTasks: plan?.minimumCompletedTasks || 0, active: plan?.active ?? true, accessToPlanIds: plan?.accessGrants.map(grant => grant.targetPlan.id) || [] } });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editor || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await api(`/admin/rewards/membership${editor.id ? `/${editor.id}` : ""}`, { method: editor.id ? "PATCH" : "POST", body: JSON.stringify({ ...editor.data, priceCents: Number(editor.data.priceCents), durationDays: editor.data.durationDays === null ? null : Number(editor.data.durationDays), earningPotentialCents: Number(editor.data.earningPotentialCents), minimumReferrals: Number(editor.data.minimumReferrals), minimumCompletedTasks: Number(editor.data.minimumCompletedTasks) }) });
      setEditor(null); setMessage("Membership plan saved and recorded in the audit log."); await resource.refresh();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return <AdminShell name={profile.user.name}>
    <div className="ad-page-title"><div><span className="eyebrow">DEPOSIT-FUNDED ACCESS</span><h1>Membership plans</h1><p>Create plans and decide which other membership tasks each plan can access.</p></div><RefreshButton onClick={resource.refresh} busy={resource.loading} /></div>
    <ResourceFeedback {...resource} retry={resource.refresh} initial={!resource.data} />
    {error && !editor && <div className="form-error" role="alert">{error}</div>}{message && <div className="form-success" role="status">{message}</div>}
    {resource.data && <section className="panel"><div className="section-top"><div><span className="eyebrow">AVAILABLE OFFERS</span><h2>Plans</h2></div><button className="rw-button rw-button-primary" onClick={() => openEditor()}><Plus size={17} />Add plan</button></div>{plans.length === 0 && <p>No membership plans exist yet.</p>}{plans.map(plan => <article className="rw-admin-review" key={plan.id}><div className="section-top"><div><h3>{plan.name}</h3><p>{plan.key} · {money(plan.priceCents)} · {plan.durationDays === null ? "Unlimited access" : `${plan.durationDays} days`}</p></div><span className={`rw-state-badge ${plan.active ? "available" : "rejected"}`}>{plan.active ? "Active" : "Paused"}</span></div><p>{plan.description || "No description added."}</p><small>{plan.accessGrants.length ? `Can access: ${plan.accessGrants.map(grant => grant.targetPlan.name).join(", ")}` : "No access to other plan tasks"} · {plan._count.purchases} purchase{plan._count.purchases === 1 ? "" : "s"}</small><div className="rw-inline-actions"><button className="rw-button rw-button-secondary" onClick={() => openEditor(plan)}>Edit plan</button></div></article>)}</section>}
    {editor && <Modal title={editor.id ? "Edit membership plan" : "Create membership plan"} onClose={() => { if (!busy) setEditor(null); }}><h2>{editor.id ? "Update this offer" : "A new member offer"}</h2><p>Choose which other plan tasks members of this plan may perform.</p><form className="profile-form" onSubmit={save}><label>Plan key<input value={editor.data.key} onChange={e => setEditor({ ...editor, data: { ...editor.data, key: e.target.value } })} pattern="[a-z0-9_-]+" required disabled={busy} /></label><label>Display name<input value={editor.data.name} onChange={e => setEditor({ ...editor, data: { ...editor.data, name: e.target.value } })} required disabled={busy} /></label><label>Description<textarea rows={3} value={editor.data.description} onChange={e => setEditor({ ...editor, data: { ...editor.data, description: e.target.value } })} maxLength={1000} disabled={busy} /></label><label>Price (USD)<input type="number" min={0.01} max={1000000} step={0.01} value={(editor.data.priceCents / 100).toFixed(2)} onChange={e => setEditor({ ...editor, data: { ...editor.data, priceCents: Math.round(Number(e.target.value) * 100) } })} required disabled={busy} /></label><label className="rw-check-field"><input type="checkbox" checked={editor.data.durationDays === null} onChange={e => setEditor({ ...editor, data: { ...editor.data, durationDays: e.target.checked ? null : 30 } })} disabled={busy} />Unlimited duration</label>{editor.data.durationDays !== null && <label>Duration (days)<input type="number" min={1} max={3650} value={editor.data.durationDays} onChange={e => setEditor({ ...editor, data: { ...editor.data, durationDays: Number(e.target.value) } })} required disabled={busy} /></label>}<label>Estimated earning potential (USD)<input type="number" min={0} max={1000000} step={0.01} value={(editor.data.earningPotentialCents / 100).toFixed(2)} onChange={e => setEditor({ ...editor, data: { ...editor.data, earningPotentialCents: Math.round(Number(e.target.value) * 100) } })} disabled={busy} /></label><label>Minimum qualified referrals<input type="number" min={0} max={1000000} value={editor.data.minimumReferrals} onChange={e => setEditor({ ...editor, data: { ...editor.data, minimumReferrals: Number(e.target.value) } })} disabled={busy} /></label><label>Minimum completed tasks<input type="number" min={0} max={1000000} value={editor.data.minimumCompletedTasks} onChange={e => setEditor({ ...editor, data: { ...editor.data, minimumCompletedTasks: Number(e.target.value) } })} disabled={busy} /></label><label>Allow access to tasks assigned to<select multiple value={editor.data.accessToPlanIds} onChange={e => setEditor({ ...editor, data: { ...editor.data, accessToPlanIds: Array.from(e.target.selectedOptions, option => option.value) } })} disabled={busy}>{plans.filter(plan => plan.id !== editor.id).map(plan => <option key={plan.id} value={plan.id}>{plan.name} ({plan.key})</option>)}</select><small>Select one or more plans. Members of this plan will be allowed to perform their tasks.</small></label><label className="rw-check-field"><input type="checkbox" checked={editor.data.active} onChange={e => setEditor({ ...editor, data: { ...editor.data, active: e.target.checked } })} disabled={busy} />Allow new purchases</label>{error && <div className="form-error" role="alert">{error}</div>}<button className="rw-button rw-button-primary" disabled={busy}>{busy ? "Saving..." : "Save plan"}</button></form></Modal>}
  </AdminShell>;
}

export default function Page() { return <AccountGate>{profile => profile.permissions.includes("rewards.manage") ? <MembershipAdmin profile={profile} /> : <AdminShell name={profile.user.name}><div className="form-error" role="alert">You do not have permission to manage memberships.</div></AdminShell>}</AccountGate>; }
