import Link from "next/link";
import { Layers2 } from "lucide-react";
export function Brand() {
  return <Link href="/" className="brand" aria-label="Rewardly home"><span className="brand-icon"><Layers2 size={22} strokeWidth={2.7} /></span>rewardly<span className="brand-dot">.</span></Link>;
}
