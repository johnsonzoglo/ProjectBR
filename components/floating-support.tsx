"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle } from "lucide-react";
export function FloatingSupport({ admin = false }: { admin?: boolean }) {
 const path = usePathname(); const href = admin ? "/admin/chat" : "/support";
 if (path === href) return null;
 return <Link href={href} className={"floating-support " + (admin ? "floating-support-admin" : "")} aria-label={admin ? "Open support inbox" : "Chat with support"} title={admin ? "Support inbox" : "Chat with support"}><MessageCircle size={26} aria-hidden="true"/><span>{admin ? "Inbox" : "Support"}</span></Link>;
}
