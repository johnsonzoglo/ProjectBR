"use client";
import { ArrowRight, CheckCircle2, ClipboardCheck, Coins, Globe, MessageSquare, Play, ShieldCheck, Smartphone } from "lucide-react";
import { money, points, taskStatus, type Task } from "../../lib/rewards";
const icons = { Website: Globe, Video: Play, App: Smartphone, Survey: ClipboardCheck, Feedback: MessageSquare, Other: ShieldCheck };
export function TaskTile({ task, rate, onOpen }: { task: Task; rate?: number; onOpen: (task: Task) => void }) {
  const Icon = icons[task.category as keyof typeof icons] || ClipboardCheck;
  const reward = task.run?.rewardPoints || task.rewardPoints;
  const complete = task.run?.status === "completed";
  return <article className="rw-task-tile"><div className={`rw-task-art rw-art-${task.category.toLowerCase()}`}><div className="rw-task-art-top"><span className="rw-category-pill"><Icon size={15} />{task.category}</span><span className="rw-reward-pill"><Coins size={15} />+{points(reward)} pts{rate && <small> ({money(Math.floor(reward * 100 / rate))})</small>}</span></div><div className="rw-task-art-bottom"><span><ShieldCheck size={14} />{(task.run?.verification || task.verification) === "code" ? "Unique code" : "Proof review"}</span><span className={complete ? "rw-art-complete" : ""}>{complete && <CheckCircle2 size={14} />}{taskStatus(task)}</span></div></div><div className="rw-task-tile-body"><h2>{task.title}</h2><p>{task.description}</p><div className="rw-task-tile-actions"><button className={`rw-button ${complete ? "rw-claimed-button" : "rw-button-primary"}`} onClick={() => onOpen(task)}>{complete ? <><CheckCircle2 size={17} />Claimed</> : <>{task.run?.status === "approved" ? "Claim points" : task.run ? "Continue task" : "Open task"}<ArrowRight size={16} /></>}</button><small>{task.run?.status === "approved" ? "Ready to claim" : task.run ? "Your place is saved" : `${task.slotsRemaining} slots today`}</small></div></div></article>;
}
