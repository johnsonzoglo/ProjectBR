export type Profile = { user: { id: string; name: string; email: string; emailVerified: boolean; status: string; referralCode: string; createdAt: string }; permissions: string[]; roles: string[]; staffSecurity?: { twoFactorEnabled: boolean; twoFactorEnabledAt: string | null } | null };
export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, { ...options, credentials: options?.credentials ?? "same-origin", headers: { "Content-Type": "application/json", ...options?.headers }, cache: "no-store" });
  const body = await response.json().catch(() => ({})) as { message?: string };
  if (!response.ok) {
    if (response.status === 403 && body.message?.startsWith("REAUTH_REQUIRED:") && typeof window !== "undefined") window.dispatchEvent(new Event("rewardly:reauth-required"));
    throw Object.assign(new Error(body.message || "Something went wrong. Please try again."), { status: response.status, details: body });
  }
  if (options?.method && options.method !== "GET" && typeof window !== "undefined") window.dispatchEvent(new Event("rewardly:data-changed"));
  return body as T;
}
