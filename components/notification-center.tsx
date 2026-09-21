"use client";
import { useState } from "react";
import { Bell } from "lucide-react";
import Link from "next/link";
import { api } from "../lib/api";
import { Modal } from "./rewards/primitives";
import { Pagination, ResourceFeedback, useResource } from "./rewards/resource";
type Notice={key:string;title:string;message:string;href:string;category:string;createdAt:string;read:boolean};
export function NotificationCenter(){
 const [open,setOpen]=useState(false);const [page,setPage]=useState(1);const [busy,setBusy]=useState(false);const [error,setError]=useState("");
 const feed=useResource<{items:Notice[];total:number;unread:number}>("/notifications?page="+page);
 async function mark(keys:string[]){if(busy||!keys.length)return;setBusy(true);setError("");try{await api("/notifications/read",{method:"POST",body:JSON.stringify({keys})});await feed.refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <><button className="rw-icon-button notification-bell" aria-label={"Notifications"+(feed.data?", "+feed.data.unread+" unread":"")} onClick={()=>setOpen(true)}><Bell size={21}/>{!!feed.data?.unread&&<span>{feed.data.unread>99?"99+":feed.data.unread}</span>}{feed.error&&<span>!</span>}</button>{open&&<Modal title="Notifications" onClose={()=>setOpen(false)}><div className="section-top"><h2>Your updates</h2><span>{feed.data?.unread||0} unread</span></div><p>Current action items and account updates from the last 30 days. Refreshes automatically.</p><ResourceFeedback {...feed} retry={feed.refresh} initial={!feed.data}/>{error&&<p className="form-error" role="alert">{error}</p>}<button className="rw-button rw-button-secondary" disabled={busy||!feed.data?.items.some(i=>!i.read)} onClick={()=>void mark(feed.data?.items.filter(i=>!i.read).map(i=>i.key)||[])}>Mark this page read</button><div className="notification-list">{feed.data?.items.map(item=><article key={item.key} className={item.read?"is-read":"is-unread"}><span className="rw-tag">{item.category}</span><h3>{item.title}</h3><p>{item.message}</p><small>{new Date(item.createdAt).toLocaleString()}</small><div><Link href={item.href} onClick={()=>setOpen(false)}>Open details</Link>{!item.read&&<button disabled={busy} onClick={()=>void mark([item.key])}>Mark read</button>}</div></article>)}</div>{feed.data?.total===0&&<p className="rw-empty">You are all caught up. New updates will appear here.</p>}{feed.data&&<Pagination page={page} total={feed.data.total} onPage={setPage} busy={feed.loading}/>}</Modal>}</>;
}
