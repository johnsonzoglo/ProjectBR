import { createHmac } from "node:crypto";
import assert from "node:assert/strict";

function totp(uri: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const secret = new URL(uri).searchParams.get("secret")!;
  let bits = 0, value = 0;
  const bytes: number[] = [];
  for (const char of secret.toUpperCase()) {
    value = (value << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) { bits -= 8; bytes.push((value >>> bits) & 255); }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac("sha1", Buffer.from(bytes)).update(counter).digest();
  const offset = digest[19] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, "0");
}

type Requester = (path: string, method: string, body: unknown, cookie: string) => Promise<Response>;
const cookies = (response: Response) => response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");

export async function enrollStaff(request: Requester, email: string, password: string, initialCookie: string) {
  const enrollment = await request("/auth/two-factor/enable", "POST", { password, method: "totp" }, initialCookie);
  assert.equal(enrollment.status, 200, await enrollment.clone().text());
  const data = await enrollment.json() as { totpURI: string };
  const verification = await request("/auth/two-factor/verify-totp", "POST", { code: totp(data.totpURI), trustDevice: false }, initialCookie);
  assert.equal(verification.status, 200, await verification.clone().text());
  const login = await request("/auth/sign-in/email", "POST", { email, password }, "");
  assert.equal(login.status, 200, await login.clone().text());
  assert.equal((await login.clone().json()).twoFactorRedirect, true);
  const challengeCookie = cookies(login);
  const secondFactor = await request("/auth/two-factor/verify-totp", "POST", { code: totp(data.totpURI), trustDevice: false }, challengeCookie);
  assert.equal(secondFactor.status, 200, await secondFactor.clone().text());
  const sessionCookie = cookies(secondFactor);
  assert.ok(sessionCookie, "MFA verification must issue a session");
  return { cookie: sessionCookie, uri: data.totpURI };
}
