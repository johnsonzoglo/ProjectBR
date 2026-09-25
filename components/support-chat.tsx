"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Headphones, MessageCircle, Plus, Search, Send } from "lucide-react";
import { api } from "../lib/api";
import { ResourceFeedback, Pagination, useResource } from "./rewards/resource";
type Conversation={id:string;userId:string;name:string;email?:string;lastMessage:string;unread:number};
type Message={id:number;senderId:string;senderName:string;fromStaff:boolean;body:string;createdAt:string};
const initials=(name:string)=>name.split(/\s+/).slice(0,2).map(word=>word[0]).join("").toUpperCase()||"U";

export function SupportChat({admin=false,userId}:{admin?:boolean;userId:string}){
 const [page,setPage]=useState(1);const [search,setSearch]=useState("");const [query,setQuery]=useState("");const [selected,setSelected]=useState("");const [error,setError]=useState("");const [busy,setBusy]=useState(false);
 const list=useResource<{items:Conversation[];total:number}>("/chat/conversations?page="+page+"&search="+encodeURIComponent(query),5000);
 useEffect(()=>{const id=new URLSearchParams(window.location.search).get("conversation");if(!id)return;const timer=window.setTimeout(()=>setSelected(id),0);return()=>window.clearTimeout(timer);},[]);
 const activeId=selected||(!admin?list.data?.items[0]?.id:"");const active=list.data?.items.find(c=>c.id===activeId);
 async function start(email?:string){if(busy)return;setBusy(true);setError("");try{const row=await api<{id:string}>("/chat/conversations",{method:"POST",body:JSON.stringify(email?{email}:{})});setSelected(row.id);await list.refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <div className={"chat-experience "+(admin?"is-admin":"is-user")+" "+(activeId?"has-thread":"")}>
  <div className="chat-title"><div><span className="eyebrow">{admin?"SUPPORT COMMAND CENTER":"PRIVATE SUPPORT"}</span><h1>{admin?"Support inbox":"How can we help?"}</h1><p>{admin?"Review conversations and help users resolve account, task, and payment questions.":"Message the Rewardly support team securely. We’ll notify you when a reply arrives."}</p></div><div className="chat-service-state"><i/>Support online</div></div>
  {error&&<p className="form-error" role="alert">{error}</p>}
  <div className="support-workspace">
   {admin&&<aside className="support-inbox">
    <div className="support-inbox-heading"><div><span>Conversations</span><strong>{list.data?.total||0}</strong></div><small>Updates every 5 seconds</small></div>
    <form className="chat-search" onSubmit={e=>{e.preventDefault();setQuery(search);setPage(1);}}><Search size={17}/><input aria-label="Search users" placeholder="Search name or email" value={search} onChange={e=>setSearch(e.target.value)}/><button aria-label="Search">Search</button></form>
    <details className="chat-new"><summary><Plus size={16}/>New conversation</summary><form onSubmit={e=>{e.preventDefault();const form=new FormData(e.currentTarget);void start(String(form.get("email")));}}><input aria-label="User email address" type="email" name="email" placeholder="user@example.com" required/><button className="rw-button rw-button-primary" disabled={busy}>{busy?"Opening...":"Open chat"}</button></form></details>
    <ResourceFeedback {...list} retry={list.refresh} initial={!list.data}/>
    <nav aria-label="Conversations">{list.data?.items.map(c=><button key={c.id} className={activeId===c.id?"is-active":""} onClick={()=>setSelected(c.id)}><span className="chat-avatar">{initials(c.name)}</span><span className="chat-conversation-copy"><strong>{c.name}<time>{c.unread>0?"New":""}</time></strong><small>{c.email}</small><em>{c.lastMessage||"No messages yet"}</em></span>{c.unread>0&&<b aria-label={c.unread+" unread"}>{c.unread>9?"9+":c.unread}</b>}</button>)}</nav>
    {list.data?.total===0&&<div className="chat-list-empty"><MessageCircle size={24}/><p>No conversations found.</p></div>}
    {list.data&&list.data.total>20&&<Pagination page={page} total={list.data.total} onPage={setPage} busy={list.loading}/>}
   </aside>}
   {!admin&&<ResourceFeedback {...list} retry={list.refresh} initial={!list.data}/>}
   {activeId?<ChatThread key={activeId} id={activeId} name={active?.name||(admin?"User conversation":"Rewardly Support")} email={active?.email} userId={userId} onBack={admin?()=>setSelected(""):undefined}/>:<section className="support-thread-empty"><span><Headphones size={34}/></span><h2>{admin?"Select a conversation":"Start a private conversation"}</h2><p>{admin?"Choose a user from the inbox or create a conversation using their email address.":"Ask about a task, account issue, membership, deposit, or reward withdrawal."}</p>{!admin&&<button className="rw-button rw-button-primary" disabled={busy||list.loading} onClick={()=>void start()}><MessageCircle size={17}/>Start chatting</button>}</section>}
  </div>
 </div>;
}

function ChatThread({id,name,email,userId,onBack}:{id:string;name:string;email?:string;userId:string;onBack?:()=>void}){
 const [page,setPage]=useState(1);const [draft,setDraft]=useState("");const [busy,setBusy]=useState(false);const [error,setError]=useState("");const sent=useRef<{body:string;key:string}|null>(null);const read=useRef(0);const bottom=useRef<HTMLDivElement>(null);const scroll=useRef<HTMLDivElement>(null);const nearBottom=useRef(true);const form=useRef<HTMLFormElement>(null);
 const messages=useResource<{items:Message[];total:number;readThrough:number}>("/chat/conversations/"+id+"/messages?page="+page,5000);const latest=messages.data?.items.at(-1)?.id||0;
 useEffect(()=>{if(page!==1||!latest)return;const mark=()=>{if(document.hidden||latest<=read.current)return;read.current=latest;void api("/chat/conversations/"+id+"/read",{method:"POST",body:JSON.stringify({lastReadId:latest})}).catch(()=>{read.current=0;});};mark();document.addEventListener("visibilitychange",mark);return()=>document.removeEventListener("visibilitychange",mark);},[id,latest,page]);
 useEffect(()=>{const box=scroll.current;if(page===1&&box&&nearBottom.current)bottom.current?.scrollIntoView({block:"nearest"});},[latest,page]);
 async function send(){const body=draft.trim();if(!body||busy)return;setBusy(true);setError("");if(sent.current?.body!==body)sent.current={body,key:crypto.randomUUID()};try{await api("/chat/conversations/"+id+"/messages",{method:"POST",body:JSON.stringify({body,requestKey:sent.current.key})});setDraft("");sent.current=null;setPage(1);await messages.refresh();bottom.current?.scrollIntoView({block:"nearest"});}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <section className="support-thread">
  <header><button className="chat-back" onClick={onBack} aria-label="Back to conversations"><ArrowLeft size={20}/></button><span className="chat-avatar chat-avatar-large">{initials(name)}</span><div><h2>{name}</h2><small><i/> {email||"Rewardly support team"}</small></div><span className="chat-private">Private chat</span></header>
  <ResourceFeedback {...messages} retry={messages.refresh} initial={!messages.data}/>
  {messages.data&&messages.data.total>50&&<div className="support-history"><button disabled={page===1||messages.loading} onClick={()=>setPage(page-1)}>Newer</button><span>Page {page}</span><button disabled={page*50>=messages.data.total||messages.loading} onClick={()=>setPage(page+1)}>Older</button></div>}
  <div className="support-messages" ref={scroll} onScroll={()=>{const box=scroll.current;if(box)nearBottom.current=box.scrollHeight-box.scrollTop-box.clientHeight<150;}} role="log" aria-label="Conversation messages" aria-live="polite">
   {messages.data?.items.map(m=>{const mine=m.senderId===userId;return <article key={m.id} className={mine?"chat-bubble is-mine":"chat-bubble"}><strong>{mine?"You":m.fromStaff?m.senderName+" · Support":m.senderName}</strong><p>{m.body}</p><time dateTime={m.createdAt}>{new Date(m.createdAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}{mine?(m.id<=(messages.data?.readThrough||0)?" · Read":" · Sent"):""}</time></article>})}
   {messages.data?.total===0&&<div className="chat-welcome"><span><Headphones size={28}/></span><h3>Welcome to Rewardly support</h3><p>Send a message below and include any relevant task or payment request ID.</p></div>}<div ref={bottom}/>
  </div>
  <form ref={form} className="support-compose" onSubmit={e=>{e.preventDefault();void send();}}><label className="sr-only" htmlFor={"message-"+id}>Your message</label><textarea id={"message-"+id} value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();form.current?.requestSubmit();}}} placeholder="Write a message…" maxLength={4000} rows={2} disabled={busy} required/><div><small>Enter to send · Shift + Enter for a new line</small><span>{draft.length}/4000</span><button className="chat-send" aria-label="Send message" disabled={busy||!draft.trim()}><Send size={19}/>{busy?<span>Sending</span>:<span>Send</span>}</button></div>{error&&<p className="form-error" role="alert">{error} Your draft is still here.</p>}</form>
 </section>;
}
