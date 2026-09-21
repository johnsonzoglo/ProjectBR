"use client";
import { AccountGate } from "../../components/account-gate";
import { Shell } from "../../components/shell";
import { SupportChat } from "../../components/support-chat";
export default function Page(){return <AccountGate>{p=><Shell name={p.user.name}><SupportChat userId={p.user.id}/></Shell>}</AccountGate>;}
