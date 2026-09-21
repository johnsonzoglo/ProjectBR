"use client";
import { AccountGate } from "../../../components/account-gate";
import { AdminShell } from "../../../components/admin-shell";
import { SupportChat } from "../../../components/support-chat";
export default function Page(){return <AccountGate>{p=><AdminShell name={p.user.name}>{p.permissions.includes("chat.manage")?<SupportChat admin userId={p.user.id}/>:<p>Support access required.</p>}</AdminShell>}</AccountGate>;}
