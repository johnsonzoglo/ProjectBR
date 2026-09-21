"use client";
import Link from "next/link";
import { useState } from "react";
import { Bell, CheckCircle2 } from "lucide-react";
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
  return <aside className="rw-approval-notice" role="status"><Bell size={22} /><div><strong>{feed.data.length} task{feed.data.length === 1 ? "" : "s"} approved!</strong>{feed.data.slice(0, 3).map(item => <p key={item.id}><CheckCircle2 size={15} />{item.task.title} · {item.rewardPoints.toLocaleString()} points {item.status === "completed" ? "added to your wallet" : "ready to claim"}</p>)}<Link href="/wallet">View rewards →</Link>{error && <p role="alert">{error}</p>}</div><button type="button" className="rw-button rw-button-secondary" disabled={busy} onClick={() => void dismiss()}>Dismiss</button></aside>;
}
