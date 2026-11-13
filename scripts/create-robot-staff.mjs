#!/usr/bin/env node
// create-robot-staff.mjs — the checks' own staff account (11-13), so admin two-step can go ON without locking out every check.
// Idempotent: finds or creates the auth user, makes sure its profile is STAFF in RGA's workspace, and gives it ONE verified
// authenticator. The authenticator secret is written straight into this repo's .env (RGA_ROBOT_TOTP_SECRET) and NEVER printed.
// → scripts/lib/admin-sign-in.mjs · project_database_changes_applied (2FA before-ON item 5)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { totp, totpSelfTest } from "./lib/totp.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EMAIL = "rocketgrowthagencyadmin+robot@gmail.com";
const OWNER_EMAIL = "hello@rocketgrowthagency.com";
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY, anon = process.env.SUPABASE_ANON_KEY || key;
if (!url || !key) { console.error("no Supabase credentials"); process.exit(2); }
if (!totpSelfTest()) { console.error("the code generator failed its self-test"); process.exit(2); }
const S = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
async function j(res) { const t = await res.text(); let b; try { b = JSON.parse(t); } catch { b = { raw: t.slice(0, 160) }; } if (!res.ok) throw new Error(`${res.status} ${(b && (b.msg || b.message || b.error_description || b.error || b.raw)) || ""}`); return b; }

// 1 · the user
let user = null;
for (let p = 1; p <= 10 && !user; p++) {
  const b = await j(await fetch(`${url}/auth/v1/admin/users?page=${p}&per_page=200`, { headers: S }));
  user = (b.users || []).find((u) => (u.email || "").toLowerCase() === EMAIL) || null;
  if (!(b.users || []).length) break;
}
if (!user) { user = await j(await fetch(`${url}/auth/v1/admin/users`, { method: "POST", headers: S, body: JSON.stringify({ email: EMAIL, email_confirm: true, user_metadata: { robot: true, purpose: "RGA's automated checks sign in as this account" } }) })); console.log("· created the robot user"); }
else console.log("· the robot user exists");

// 2 · its profile: staff, in RGA's workspace (the owner's)
const owner = (await j(await fetch(`${url}/rest/v1/profiles?email=eq.${encodeURIComponent(OWNER_EMAIL)}&select=workspace_id`, { headers: S })))[0];
if (!owner || !owner.workspace_id) { console.error("RGA's workspace not found"); process.exit(1); }
const prof = (await j(await fetch(`${url}/rest/v1/profiles?id=eq.${user.id}&select=id,role,workspace_id`, { headers: S })))[0];
if (!prof) await j(await fetch(`${url}/rest/v1/profiles`, { method: "POST", headers: { ...S, Prefer: "return=representation" }, body: JSON.stringify({ id: user.id, workspace_id: owner.workspace_id, email: EMAIL, full_name: "RGA checks (robot)", role: "staff" }) }));
else if (prof.role !== "staff" || prof.workspace_id !== owner.workspace_id) await j(await fetch(`${url}/rest/v1/profiles?id=eq.${user.id}`, { method: "PATCH", headers: { ...S, Prefer: "return=representation" }, body: JSON.stringify({ role: "staff", workspace_id: owner.workspace_id }) }));
const back = (await j(await fetch(`${url}/rest/v1/profiles?id=eq.${user.id}&select=role,workspace_id`, { headers: S })))[0];
if (!back || back.role !== "staff" || back.workspace_id !== owner.workspace_id) { console.error("the robot's profile did not read back as staff in RGA's workspace"); process.exit(1); }
console.log("· profile: staff in RGA's workspace (read back)");

// 3 · a session (magic link → verify), then ONE verified authenticator
const gl = await j(await fetch(`${url}/auth/v1/admin/generate_link`, { method: "POST", headers: S, body: JSON.stringify({ type: "magiclink", email: EMAIL }) }));
const s1 = await j(await fetch(`${url}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: gl.hashed_token || (gl.properties || {}).hashed_token }) }));
const H = { apikey: anon, Authorization: `Bearer ${s1.access_token}`, "Content-Type": "application/json" };
const me = await j(await fetch(`${url}/auth/v1/user`, { headers: H }));
const envPath = path.join(ROOT, ".env"), envTxt = fs.readFileSync(envPath, "utf8");
const haveSecret = /^RGA_ROBOT_TOTP_SECRET=/m.test(envTxt);
const verified = (me.factors || []).filter((f) => f.factor_type === "totp" && f.status === "verified");
if (verified.length && haveSecret) { console.log("· the robot already has a verified authenticator and its secret is in .env"); }
else {
  // a verified factor whose secret we don't hold is useless to the checks: remove it (admin API) and enroll afresh; drop unverified ones too
  for (const f of me.factors || []) await fetch(`${url}/auth/v1/admin/users/${user.id}/factors/${f.id}`, { method: "DELETE", headers: S });
  const en = await j(await fetch(`${url}/auth/v1/factors`, { method: "POST", headers: H, body: JSON.stringify({ factor_type: "totp", friendly_name: "rga-checks-robot" }) }));
  const secret = en.totp && en.totp.secret; if (!secret) { console.error("enrollment returned no secret"); process.exit(1); }
  const ch = await j(await fetch(`${url}/auth/v1/factors/${en.id}/challenge`, { method: "POST", headers: H, body: "{}" }));
  await j(await fetch(`${url}/auth/v1/factors/${en.id}/verify`, { method: "POST", headers: H, body: JSON.stringify({ challenge_id: ch.id, code: totp(secret) }) }));
  const lines = envTxt.split("\n").filter((l) => !/^RGA_ROBOT_(EMAIL|TOTP_SECRET)=/.test(l));
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  lines.push(`RGA_ROBOT_EMAIL=${EMAIL}`, `RGA_ROBOT_TOTP_SECRET=${secret}`, "");
  fs.writeFileSync(envPath, lines.join("\n"));
  console.log("· enrolled ONE authenticator, verified it, and wrote its secret to .env (not printed)");
}
const me2 = await j(await fetch(`${url}/auth/v1/user`, { headers: H }));
const n = (me2.factors || []).filter((f) => f.status === "verified").length;
console.log(n === 1 ? "✅ the robot staff account is ready: staff in RGA's workspace, one verified authenticator" : `🔴 the robot has ${n} verified factors`);
process.exit(n === 1 ? 0 : 1);
