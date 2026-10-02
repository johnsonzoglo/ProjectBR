"use client";
import { AccountGate } from "../../components/account-gate";
import { Shell } from "../../components/shell";
import { SupportChat } from "../../components/support-chat";
import { SupportTickets } from "../../components/support-tickets";
export default function Page(){return <AccountGate>{p=><Shell name={p.user.name}><SupportChat userId={p.user.id}/><div className="rw-support-tickets-secondary"><SupportTickets/></div></Shell>}</AccountGate>;}
