import Link from "next/link";
import { ArrowLeft, Compass } from "lucide-react";
import { Shell } from "../components/shell";
export default function NotFound() {
  return <Shell preview><section className="panel rw-not-found"><span className="rw-modal-hero-icon"><Compass size={36} /></span><span className="rw-tag">404 · A LITTLE OFF TRACK</span><h1>Let’s find your way back.</h1><p>This page isn’t here. Your next little win is waiting in Tasks.</p><Link href="/tasks" className="rw-button rw-button-primary"><ArrowLeft size={16} />Browse tasks</Link></section></Shell>;
}
