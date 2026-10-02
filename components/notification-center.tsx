"use client";

import Link from "next/link";
import { ArrowUpRight, Bell, BellRing, CheckCheck, CircleDollarSign, ClipboardCheck, Crown, MailWarning, MessageCircle, Users } from "lucide-react";
import { useState, type ReactNode } from "react";
import { api } from "../lib/api";
import { Modal } from "./rewards/primitives";
import { Pagination, ResourceFeedback, useResource } from "./rewards/resource";

type Notice = { key:string; title:string; message:string; href:string; category:string; createdAt:string; read:boolean };

const icons: Record<string, ReactNode> = {
  email:<MailWarning size={19}/>, task:<ClipboardCheck size={19}/>, tasks:<ClipboardCheck size={19}/>,
  payment:<CircleDollarSign size={19}/>, payments:<CircleDollarSign size={19}/>, withdrawal:<CircleDollarSign size={19}/>,
  membership:<Crown size={19}/>, referral:<Users size={19}/>, referrals:<Users size={19}/>, chat:<MessageCircle size={19}/>,
};

function formatTime(value:string) {
  const date = new Date(value);
  const sameDay = date.toDateString() === new Date().toDateString();
  return new Intl.DateTimeFormat(undefined, sameDay ? { hour:"numeric", minute:"2-digit" } : { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" }).format(date);
}

export function NotificationCenter() {
  const [open,setOpen] = useState(false);
  const [page,setPage] = useState(1);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const feed = useResource<{items:Notice[];total:number;unread:number}>(`/notifications?page=${page}`);
  const unread = feed.data?.items.filter(item => !item.read) ?? [];

  async function mark(keys:string[]) {
    if (busy || !keys.length) return;
    setBusy(true); setError("");
    try { await api("/notifications/read", { method:"POST", body:JSON.stringify({keys}) }); await feed.refresh(); }
    catch (caught) { setError((caught as Error).message); }
    finally { setBusy(false); }
  }

  return <>
    <button className="rw-icon-button notification-bell" aria-label={`Notifications${feed.data ? `, ${feed.data.unread} unread` : ""}`} aria-expanded={open} onClick={()=>setOpen(true)}>
      <Bell size={21}/>{!!feed.data?.unread && <span>{feed.data.unread>99?"99+":feed.data.unread}</span>}{feed.error && <span>!</span>}
    </button>
    {open && <Modal title="Notifications" onClose={()=>setOpen(false)} className="rw-notification-modal">
      <header className="notification-inbox-head">
        <div className="notification-head-icon"><BellRing size={25}/></div>
        <div><span className="rw-overline">Notification center</span><h2>Your updates</h2><p>Recent activity and items that need your attention.</p></div>
        <strong className="notification-unread-count">{feed.data?.unread ?? 0}<span>unread</span></strong>
      </header>
      <ResourceFeedback {...feed} retry={feed.refresh} initial={!feed.data}/>
      {error && <p className="form-error" role="alert">{error}</p>}
      {!!feed.data?.items.length && <div className="notification-toolbar">
        <span>{feed.data.total} update{feed.data.total===1?"":"s"} from the last 30 days</span>
        <button disabled={busy || !unread.length} onClick={()=>void mark(unread.map(item=>item.key))}><CheckCheck size={17}/> Mark page read</button>
      </div>}
      <div className="notification-list">
        {feed.data?.items.map(item => { const category=item.category.toLowerCase(); return <article key={item.key} className={`${item.read?"is-read":"is-unread"} category-${category}`}>
          <div className="notification-item-icon" aria-hidden="true">{icons[category] ?? <Bell size={19}/>}</div>
          <div className="notification-item-body">
            <div className="notification-item-meta"><span>{item.category}</span><time dateTime={item.createdAt}>{formatTime(item.createdAt)}</time></div>
            <h3>{item.title}</h3><p>{item.message}</p>
            <div className="notification-item-actions">
              <Link href={item.href} onClick={()=>{if(!item.read)void mark([item.key]);setOpen(false)}}>View details <ArrowUpRight size={15}/></Link>
              {!item.read && <button disabled={busy} onClick={()=>void mark([item.key])}><CheckCheck size={15}/> Mark read</button>}
            </div>
          </div>
          {!item.read && <span className="notification-new-dot" aria-label="Unread"/>}
        </article>; })}
      </div>
      {feed.data?.total===0 && <div className="notification-empty"><span><CheckCheck size={27}/></span><h3>You are all caught up</h3><p>New account and platform updates will appear here.</p></div>}
      {feed.data && <Pagination page={page} total={feed.data.total} onPage={setPage} busy={feed.loading}/>}
    </Modal>}
  </>;
}
