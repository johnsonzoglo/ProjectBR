"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Download, KeyRound, LogOut, Trash2 } from "lucide-react";
import { api, type Profile } from "../lib/api";

type Preferences = { emailTaskApproved:boolean; emailPayments:boolean; emailSecurity:boolean; inAppTasks:boolean; inAppPayments:boolean; marketing:boolean };
const labels: Record<keyof Preferences,string> = { emailTaskApproved:"Email me when a task is approved",emailPayments:"Email payment and withdrawal updates",emailSecurity:"Email security and new-device alerts",inAppTasks:"Show task notifications in the app",inAppPayments:"Show payment notifications in the app",marketing:"Send occasional product news" };

export function AccountTools({ profile }: { profile: Profile }) {
 const [preferences,setPreferences]=useState<Preferences|null>(null); const [busy,setBusy]=useState(false); const [message,setMessage]=useState(""); const [error,setError]=useState(""); const [reason,setReason]=useState("");
 useEffect(()=>{api<Preferences>("/me/preferences").then(setPreferences).catch(e=>setError(e.message));},[]);
 async function save(){if(!preferences)return;setBusy(true);setError("");try{await api("/me/preferences",{method:"PATCH",body:JSON.stringify(preferences)});setMessage("Notification preferences saved.");}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function download(){setBusy(true);setError("");try{const data=await api<Record<string,unknown>>("/me/export");const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));const a=document.createElement("a");a.href=url;a.download=`rewardly-account-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(url);setMessage("Your account export was downloaded.");}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function signOutOthers(){setBusy(true);setError("");try{const result=await api<{count:number}>("/me/sessions",{method:"DELETE"});setMessage(`${result.count} other session${result.count===1?"":"s"} signed out.`);}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function deletion(){setBusy(true);setError("");try{await api("/me/deletion-request",{method:"POST",body:JSON.stringify({reason})});setReason("");setMessage("Your deletion request is pending review.");}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <div className="rw-account-tools">
  {error&&<p className="form-error" role="alert">{error}</p>}{message&&<p className="form-success" role="status">{message}</p>}
  <section className="panel"><div className="rw-panel-kicker"><Bell size={15}/> NOTIFICATIONS</div><h2>Choose what reaches you</h2><p>Security messages stay recommended so you can spot account changes quickly.</p>{preferences&&<div className="rw-preference-list">{(Object.keys(labels) as (keyof Preferences)[]).map(key=><label key={key}><span>{labels[key]}</span><input type="checkbox" role="switch" checked={preferences[key]} onChange={e=>setPreferences({...preferences,[key]:e.target.checked})}/></label>)}</div>}<button className="rw-button rw-button-primary" disabled={busy||!preferences} onClick={save}>Save preferences</button></section>
  <section className="panel"><div className="rw-panel-kicker"><KeyRound size={15}/> ACCOUNT CONTROL</div><h2>Your data and devices</h2><div className="rw-inline-actions"><button className="rw-button rw-button-secondary" disabled={busy} onClick={download}><Download size={17}/>Download my data</button><button className="rw-button rw-button-secondary" disabled={busy} onClick={signOutOthers}><LogOut size={17}/>Sign out other devices</button><Link className="rw-button rw-button-secondary" href={profile.security?.twoFactorEnabled?"/profile":"/profile/security"}><KeyRound size={17}/>{profile.security?.twoFactorEnabled?"Authenticator enabled":"Set up authenticator"}</Link></div></section>
  <section className="panel rw-danger-zone"><div className="rw-panel-kicker">ACCOUNT DELETION</div><h2>Request account deletion</h2><p>Open payments must be resolved first. An administrator reviews the request before your account is closed.</p><textarea rows={3} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Tell us why you want to delete your account" maxLength={500}/><button className="rw-button rw-button-danger" disabled={busy||reason.trim().length<10} onClick={deletion}><Trash2 size={17}/>Request deletion</button></section>
 </div>;
}
