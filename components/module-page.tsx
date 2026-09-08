import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock3 } from "lucide-react";
import { Shell } from "./shell";
export function ModulePage({ title, description, steps }: { title: string; description: string; steps: string[] }) {
  return <Shell preview><div className="page-heading"><div><div className="eyebrow">BUILDING ONE GOOD STEP AT A TIME</div><h1>{title}</h1><p>{description}</p></div></div><section className="panel module-panel"><span className="module-icon"><Clock3 size={32} /></span><span className="pill">Upcoming module</span><h2>A little more is on the way.</h2><p>Accounts and security are the first release. This part of your workspace will open as the next modules are completed.</p><div className="module-steps">{steps.map(step => <div key={step}><CheckCircle2 size={18} />{step}</div>)}</div><Link href="/dashboard" className="button dark">Go to your account<ArrowRight size={16} /></Link></section></Shell>;
}
