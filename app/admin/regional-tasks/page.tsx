"use client";
import { useState } from "react";
import { Globe2 } from "lucide-react";
import { AccountGate } from "../../../components/account-gate";
import { AdminShell } from "../../../components/admin-shell";
import { ResourceFeedback, useResource } from "../../../components/rewards/resource";
import { api, type Profile } from "../../../lib/api";
import type { Task } from "../../../lib/rewards";

type RegionalTask = Task & { countryCodes?: string[] };
type Overview = { tasks: RegionalTask[] };
const countries = [["GH","Ghana"],["NG","Nigeria"],["AE","United Arab Emirates"],["US","United States"],["GB","United Kingdom"],["CA","Canada"],["ZA","South Africa"],["KE","Kenya"],["IN","India"],["PK","Pakistan"],["PH","Philippines"],["SG","Singapore"],["SA","Saudi Arabia"]] as const;

function RegionalTasks({ profile }: { profile: Profile }) {
  const resource = useResource<Overview>("/admin/rewards");
  const [saving,setSaving] = useState("");
  const [message,setMessage] = useState("");
  const [error,setError] = useState("");
  async function save(task: RegionalTask, countryCodes: string[]) {
    setSaving(task.id); setError(""); setMessage("");
    try { await api(`/admin/rewards/tasks/${task.id}/countries`,{method:"PATCH",body:JSON.stringify({countryCodes})}); await resource.refresh(); setMessage(`${task.title} targeting updated.`); }
    catch (failure) { setError((failure as Error).message); }
    finally { setSaving(""); }
  }
  return <AdminShell name={profile.user.name} roles={profile.roles} permissions={profile.permissions}>
    <div className="page-heading"><div><div className="eyebrow">AUDIENCE TARGETING</div><h1>Regional tasks</h1><p>Choose which countries can discover and start each task. Tasks with no countries selected remain global.</p></div><span className="pill"><Globe2 size={15}/>Country access</span></div>
    <ResourceFeedback loading={resource.loading} error={resource.error} retry={resource.refresh}/>{error&&<p className="form-error" role="alert">{error}</p>}{message&&<p className="form-success" role="status">{message}</p>}
    <div className="ad-regional-list">{resource.data?.tasks.map(task=><section className="panel ad-regional-task" key={task.id}><div><span className="rw-panel-kicker">{task.category}</span><h2>{task.title}</h2><p>{task.countryCodes?.length ? `Available in ${task.countryCodes.length} selected countr${task.countryCodes.length===1?"y":"ies"}.` : "Available globally."}</p></div><div className="ad-country-grid">{countries.map(([code,name])=><label key={code}><input type="checkbox" checked={(task.countryCodes||[]).includes(code)} disabled={saving===task.id} onChange={event=>{const current=task.countryCodes||[];void save(task,event.target.checked?[...current,code]:current.filter(item=>item!==code));}}/><span>{name}<small>{code}</small></span></label>)}</div><button className="rw-button rw-button-secondary" disabled={saving===task.id||!(task.countryCodes||[]).length} onClick={()=>void save(task,[])}>Make global</button></section>)}</div>
  </AdminShell>;
}
export default function Page(){return <AccountGate>{profile=>profile.permissions.includes("rewards.manage")?<RegionalTasks profile={profile}/>:<AdminShell name={profile.user.name}><h1>Admin access required</h1></AdminShell>}</AccountGate>}
