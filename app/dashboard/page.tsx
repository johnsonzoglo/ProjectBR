"use client";

import { AccountGate } from "../../components/account-gate";
import { LiveDashboard } from "../../components/rewards/live-dashboard";

export default function DashboardPage() {
  return <AccountGate>{profile => <LiveDashboard profile={profile} />}</AccountGate>;
}
