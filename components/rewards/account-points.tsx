"use client";
import Link from "next/link";
import { Coins } from "lucide-react";
import { useResource } from "./resource";
import { points, type Wallet } from "../../lib/rewards";
export function AccountPoints() {
  const { data, error } = useResource<Wallet>("/wallet");
  return <Link href="/wallet" className="rw-header-points" aria-label={data ? `${points(data.points)} points. Open wallet` : "Open wallet"} title={error || "Your verified points"}><Coins size={17} /><span>{data ? points(data.points) : "—"}</span></Link>;
}
