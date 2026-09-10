import { AuthForm } from "../../components/auth-form";
export default async function Page({ searchParams }: { searchParams: Promise<{ ref?: string | string[] }> }) {
  const params = await searchParams;
  return <AuthForm mode="register" initialReferralCode={typeof params.ref === "string" ? params.ref.slice(0, 80) : ""} />;
}
