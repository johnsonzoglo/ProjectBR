"use client";
import { AccountGate } from "../../../components/account-gate";
import { Shell } from "../../../components/shell";
import SecuritySetup from "../../../components/user-security-setup";
export default function Page(){return <AccountGate>{profile=><Shell name={profile.user.name}><SecuritySetup enabled={!!profile.security?.twoFactorEnabled}/></Shell>}</AccountGate>}
