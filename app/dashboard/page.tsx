"use client";
import { AccountGate } from "../../components/account-gate";
import { Dashboard } from "../../components/dashboard";
import { DashboardSkeleton } from "../../components/rewards/dashboard-skeleton";
export default function DashboardPage() { return <AccountGate loading={<DashboardSkeleton />}>{profile => <Dashboard profile={profile} />}</AccountGate>; }
