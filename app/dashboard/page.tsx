"use client";
import { AccountGate } from "../../components/account-gate";
import { LiveDashboard } from "../../components/rewards/live-dashboard";
import { DashboardSkeleton } from "../../components/rewards/dashboard-skeleton";
export default function DashboardPage() { return <AccountGate loading={<DashboardSkeleton />}>{profile => <LiveDashboard profile={profile} />}</AccountGate>; }
