"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, CheckCircle2, Sparkles, X } from "lucide-react";
import { api } from "../lib/api";
import { useResource } from "./rewards/resource";

type ApprovedTaskNotice = { id: string; key: string; status: string; rewardPoints: number; task: { title: string } };

export function TaskNotifications() {
  const feed = useResource<ApprovedTaskNotice[]>("/notifications/tasks");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!feed.data?.length) return null;
  async function dismiss() {
    setBusy(true); setError("");
    try {
      await api("/notifications/read", { method: "POST", body: JSON.stringify({ keys: feed.data?.map(item => item.key) || [] }) });
      await feed.refresh();
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }
  const totalPoints=feed.data.reduce((sum,item)=>sum+item.rewardPoints,0);
  return <aside className="rw-approval-notice" role="status"><div className="rw-approval-icon"><Sparkles size={20}/></div><div className="rw-approval-content"><div className="rw-approval-heading"><div><span>REWARDS UPDATED</span><strong>{feed.data.length} task{feed.data.length===1?"":"s"} approved</strong></div><b>+{totalPoints.toLocaleString()} pts</b></div><div className="rw-approval-items">{feed.data.slice(0,3).map(item=><div key={item.id}><CheckCircle2 size={15}/><span><strong>{item.task.title}</strong><small>{item.rewardPoints.toLocaleString()} pts · {item.status==="completed"?"Added":"Ready to claim"}</small></span></div>)}{feed.data.length>3&&<span className="rw-approval-more">+{feed.data.length-3} more</span>}</div>{error&&<p className="form-error" role="alert">{error}</p>}<Link className="rw-approval-link" href="/wallet">View reward activity<ArrowRight size={15}/></Link></div><button type="button" className="rw-approval-dismiss" aria-label="Dismiss approval notifications" disabled={busy} onClick={()=>void dismiss()}><X size={18}/></button></aside>;
}
