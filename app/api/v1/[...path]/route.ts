import { env } from "cloudflare:workers";
export const dynamic = "force-dynamic";
async function proxy(request: Request) {
  const origin = (env as unknown as { API_ORIGIN?: string }).API_ORIGIN || process.env.API_ORIGIN;
  if (!origin) return Response.json({ message: "Account services are not connected on this preview. Run the local backend to use authentication." }, { status: 503 });
  const url = new URL(request.url);
  const headers = new Headers();
  for (const key of ["content-type", "cookie", "origin", "user-agent", "accept"]) {
    const value = request.headers.get(key);
    if (value) headers.set(key, value);
  }
  try {
    const response = await fetch(new URL(url.pathname + url.search, origin), {
      method: request.method, headers, redirect: "manual",
      body: ["GET", "HEAD"].includes(request.method) ? undefined : await request.arrayBuffer(),
      signal: AbortSignal.timeout(15000),
    });
    const result = new Headers(response.headers);
    result.set("cache-control", "no-store");
    result.delete("content-length");
    return new Response(response.body, { status: response.status, headers: result });
  } catch {
    return Response.json({ message: "Account services are temporarily unavailable. Please try again shortly." }, { status: 503 });
  }
}
export { proxy as GET, proxy as POST, proxy as PATCH, proxy as DELETE };
