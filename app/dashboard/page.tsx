"use client";
import { AccountGate } from "../../components/account-gate";
import { Dashboard } from "../../components/dashboard";
export default function DashboardPage() { return <AccountGate>{profile => <Dashboard profile={profile} />}</AccountGate>; }
