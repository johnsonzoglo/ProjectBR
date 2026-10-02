"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { api, type Profile } from "../lib/api";
import { SupportChat } from "./support-chat";

export function FloatingSupport({ admin = false }: { admin?: boolean }) {
 const path=usePathname();const[open,setOpen]=useState(false);const[userId,setUserId]=useState("");const[error,setError]=useState("");
 useEffect(()=>{if(!open)return;const close=(event:KeyboardEvent)=>{if(event.key==="Escape")setOpen(false)};document.addEventListener("keydown",close);return()=>document.removeEventListener("keydown",close)},[open]);
 async function launch(){setOpen(true);setError("");if(userId)return;try{const profile=await api<Profile>("/me");setUserId(profile.user.id)}catch(failure){setError((failure as Error).message)}}
 if(admin)return path==="/admin/chat"?null:<Link href="/admin/chat" className="floating-support floating-support-admin" aria-label="Open support inbox" title="Support inbox"><MessageCircle size={26}/><span>Inbox</span></Link>;
 if(path==="/support")return null;
 return <><button type="button" className={"floating-support floating-chat-launcher "+(open?"is-open":"")} aria-label={open?"Close support chat":"Chat with support"} aria-expanded={open} onClick={()=>open?setOpen(false):void launch()}>{open?<X size={25}/>:<MessageCircle size={26}/>}<span>{open?"Close":"Support"}</span></button>
  {open&&<div className="floating-chat-layer" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setOpen(false)}}><section className="floating-chat-panel" role="dialog" aria-modal="true" aria-label="Rewardly support chat"><header className="floating-chat-top"><div><span><i/>Support online</span><strong>Rewardly Support</strong></div><button type="button" aria-label="Close support chat" onClick={()=>setOpen(false)}><X size={20}/></button></header>{error?<div className="floating-chat-error"><p>{error}</p><Link href="/login" className="rw-button rw-button-primary">Sign in again</Link></div>:userId?<SupportChat userId={userId}/>:<div className="floating-chat-loading"><span className="rw-spinner"/><p>Opening your conversation…</p></div>}</section></div>}
 </>;
}
