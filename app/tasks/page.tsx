"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, CheckCircle2, ClipboardCheck, Coins, ExternalLink, Search, ShieldCheck } from "lucide-react";
import { AccountGate } from "../../components/account-gate";
import { Shell } from "../../components/shell";
import { TaskTile } from "../../components/rewards/task-tile";
import { AnimatedCounter, Modal } from "../../components/rewards/primitives";
import { RefreshButton, ResourceFeedback, useResource } from "../../components/rewards/resource";
import { api, type Profile } from "../../lib/api";
import { points, taskStatus, type Task, type TaskRun, type Wallet } from "../../lib/rewards";

function TaskPage({ profile }: { profile: Profile }) {
  const resource = useResource<Task[]>("/tasks");
  const wallet = useResource<Wallet>("/wallet");
  const [category, setCategory] = useState("All");
  const [status, setStatus] = useState("All");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [runOverride, setRunOverride] = useState<TaskRun | null>(null);
  const [proof, setProof] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState<number | null>(null);
  const selected = resource.data?.find(t => t.id === selectedId);
  const run = runOverride || selected?.run;
  const tasks = resource.data || [];
  const categories = ["All", ...new Set(tasks.map(t => t.category))];
  const visible = tasks.filter(t => (category === "All" || t.category === category) && (status === "All" || taskStatus(t) === status) && `${t.title} ${t.description}`.toLowerCase().includes(search.toLowerCase()));
  function open(task: Task) { setSelectedId(task.id); setRunOverride(null); setProof(task.run?.proof || ""); setCode(""); setError(""); setMessage(""); }
  async function action(kind: "start" | "submit" | "claim") {
    if (!selected || busy) return; setBusy(true); setError(""); setMessage("");
    try {
      const result = await api<TaskRun | { run: TaskRun; credited: boolean }>(`/tasks/${selected.id}/${kind}`, { method: "POST", body: JSON.stringify(kind === "submit" ? run?.verification === "code" ? { code } : { proof } : {}) });
      const next = "run" in result ? result.run : result; setRunOverride(next);
      if (kind === "claim") { setSelectedId(null); setSuccess("credited" in result && result.credited ? next.rewardPoints : 0); }
      else setMessage(kind === "start" ? "Task started. Follow the instructions, then submit your verification." : next.status === "approved" ? "Verification successful. Your points are ready to claim." : "Proof submitted. We’ll show the decision here after review.");
      await resource.refresh(); setRunOverride(null);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <Shell name={profile.user.name} admin={profile.permissions.includes("users.read")}>
    <div className="page-heading rw-compact-heading"><div><span className="eyebrow">YOUR DAILY OPPORTUNITIES</span><h1>Tasks & rewards.</h1></div><RefreshButton busy={resource.loading} onClick={resource.refresh} /></div>
    <div className="rw-account-active"><ShieldCheck size={22} /><span>Verified account <span className="rw-active-separator">·</span> Ready to earn with approved tasks</span></div>
    <section className="rw-earn-hero"><div><span className="rw-hero-kicker"><ShieldCheck size={15} />YOUR NEXT LITTLE WIN</span><h2>Small tasks.<br />More possibilities.</h2><p>Complete approved tasks.<br />Build your rewards, one step at a time.</p></div><span className="rw-hero-reward"><Coins size={19} />{wallet.data ? `+${points(wallet.data.todayPoints)} pts today` : "Make your time count"}</span></section>
    <div className="rw-task-status-summary" aria-label="Task progress">{[["In progress", tasks.filter(t => t.run && ["in_progress", "approved"].includes(t.run.status)).length], ["Pending review", tasks.filter(t => t.run?.status === "pending_review").length], ["Completed", tasks.filter(t => t.run?.status === "completed").length]].map(([label, value]) => <span key={label}><strong>{resource.data ? value : "—"}</strong> {label}</span>)}</div>
    <div className="rw-module-toolbar"><label className="rw-search"><Search size={18} /><input aria-label="Search tasks" placeholder="Search your next task" value={search} onChange={e => setSearch(e.target.value)} /></label><label className="rw-status-filter">Status<select value={status} onChange={e => setStatus(e.target.value)}>{["All", "Available", "In Progress", "Pending Review", "Completed"].map(s => <option key={s}>{s}</option>)}</select></label></div>
    <div className="rw-task-filters" role="group" aria-label="Task categories">{categories.map(c => <button key={c} className={category === c ? "is-active" : ""} aria-pressed={category === c} onClick={() => setCategory(c)}>{c}</button>)}</div>
    <ResourceFeedback {...resource} retry={resource.refresh} initial={!resource.data} />
    <div className="rw-task-list-heading"><h2>{status === "All" ? "Your tasks" : status} <span>({visible.length})</span></h2>{wallet.data && <span className="rw-reward-pill">{points(wallet.data.rules.pointsPerUsd)} pts = $1.00</span>}</div>
    <div className="rw-live-task-grid">{visible.map(task => <TaskTile key={task.id} task={task} rate={wallet.data?.rules.pointsPerUsd} onOpen={open} />)}</div>
    {resource.data && visible.length === 0 && <div className="panel rw-empty"><ClipboardCheck size={30} /><h2>No tasks here yet.</h2><p>Try another filter or check back for newly approved tasks.</p></div>}
    {selected && <Modal title={selected.title} onClose={() => { if (!busy) setSelectedId(null); }}><span className="rw-tag">{selected.category} · {run?.status === "approved" ? "READY TO CLAIM" : taskStatus({ ...selected, run: run || null })}</span><h2>{selected.title}</h2><p>{selected.description}</p><div className="rw-modal-reward"><span>Verified task reward</span><strong>+{points(run?.rewardPoints || selected.rewardPoints)} pts</strong></div><h3 className="rw-form-heading">Your instructions</h3><p className="rw-proof-text">{selected.instructions}</p>{selected.endsAt && !run && <p className="rw-fine-print">Start by {new Date(selected.endsAt).toLocaleString()}. Daily slots reset at 00:00 UTC.</p>}
      {run && selected.destinationUrl && <a className="rw-button rw-button-secondary" href={selected.destinationUrl} target="_blank" rel="noopener noreferrer">Open task website<ExternalLink size={15} /></a>}
      {run?.reviewReason && <div className="rw-notice"><strong>Reviewer feedback</strong><p>{run.reviewReason}</p></div>}
      {error && <div className="form-error" role="alert">{error}</div>}{message && <div className="form-success" role="status">{message}</div>}
      {!run && <button className="rw-button rw-button-primary rw-full" disabled={busy || selected.slotsRemaining === 0} onClick={() => action("start")}>{busy ? "Starting…" : selected.slotsRemaining === 0 ? "No slots remaining" : "Start this task"}<ArrowRight size={16} /></button>}
      {run?.status === "in_progress" && <form className="profile-form" onSubmit={e => { e.preventDefault(); void action("submit"); }}>{run.verification === "code" ? <label>Unique completion code<input autoComplete="off" value={code} onChange={e => setCode(e.target.value)} required maxLength={128} disabled={busy} placeholder="Code from the task provider" /><small>Each code can be used only once.</small></label> : <label>Your feedback or proof<textarea value={proof} onChange={e => setProof(e.target.value)} required minLength={10} maxLength={4000} rows={5} disabled={busy} placeholder="Follow the instructions. Include feedback or a link to your proof." /><small>10–4,000 characters. An admin will review this submission.</small></label>}<button className="rw-button rw-button-primary" disabled={busy}>{busy ? "Submitting…" : "Submit verification"}<ShieldCheck size={16} /></button></form>}
      {run?.status === "pending_review" && <div className="rw-notice"><ShieldCheck size={22} /><p>Your submission is awaiting review. This page refreshes automatically; you can return later.</p></div>}
      {run?.status === "approved" && <button className="rw-button rw-button-primary rw-full" disabled={busy} onClick={() => action("claim")}>{busy ? "Claiming…" : `Claim ${points(run.rewardPoints)} points`}<Coins size={17} /></button>}
      {run?.status === "completed" && <div className="rw-notice"><CheckCircle2 size={24} /><p>{points(run.rewardPoints)} points were credited on {run.completedAt && new Date(run.completedAt).toLocaleString()}.</p><Link className="rw-button rw-button-secondary" href="/wallet">View rewards</Link></div>}
    </Modal>}
    {success !== null && <Modal title="Points claimed" onClose={() => setSuccess(null)}><span className="rw-modal-hero-icon"><CheckCircle2 size={38} /></span><h2>{success ? "A little win, earned." : "Already safely credited."}</h2><div className="rw-earned"><AnimatedCounter value={success} prefix="+" /> pts</div><p>{success ? "Your points and transaction history are updated." : "This task was already claimed. Your balance has not been credited twice."}</p><Link className="rw-button rw-button-primary" href="/wallet">View my rewards<ArrowRight size={16} /></Link></Modal>}
  </Shell>;
}
export default function Page() { return <AccountGate>{profile => <TaskPage profile={profile} />}</AccountGate>; }
