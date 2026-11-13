// admin-sign-in.mjs — how every check signs in to the live admin (11-13, before admin two-step goes ON).
//
// 🔴 WHY: 46 checks each made their own magic link for hello@rocketgrowthagency.com. Once two-step is on (ADMIN_MFA_REQUIRED) and hello@
// has an authenticator, a magic link alone is aal1: the admin asks for a code the checks can't type, and the database's staff rule
// (staff_two_step_ok, ADMIN_TWO_STEP_RLS_2026-11-12.sql) refuses staff data to any aal1 session of a person who HAS a factor — even
// with the admin screen off. So the checks sign in as their own staff account, the ROBOT (rocketgrowthagencyadmin+robot@gmail.com,
// role staff, its own authenticator; created by scripts/create-robot-staff.mjs), and finish two-step through Supabase's API (aal2)
// before the admin loads.
//
// 🔒 The robot's authenticator secret lives ONLY in the Scraper .env (RGA_ROBOT_TOTP_SECRET); it is never printed, logged or committed.
// Without the robot settings it falls back to the old hello@ magic link, so nothing breaks before the robot exists.
import { totp, totpSelfTest } from "./totp.mjs";

const STORAGE_KEY = (url) => `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;   // supabase-js 2.x default (admin: /vendor/supabase-js-2.52.1.js)

function env() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY, anon = process.env.SUPABASE_ANON_KEY || key;
  if (!url || !key) throw new Error("no Supabase credentials (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  return { url, key, anon };
}
export const robotConfigured = () => !!(process.env.RGA_ROBOT_EMAIL && process.env.RGA_ROBOT_TOTP_SECRET);
/** The address the checks sign in as: the robot when it exists, else hello@ (the pre-robot behaviour). */
export const adminSignInEmail = () => (robotConfigured() ? process.env.RGA_ROBOT_EMAIL : (process.env.RGA_ADMIN_EMAIL || "hello@rocketgrowthagency.com"));

async function j(res) { const t = await res.text(); let b = null; try { b = JSON.parse(t); } catch { b = { raw: t.slice(0, 200) }; } if (!res.ok) { const e = new Error(`${res.status} ${(b && (b.msg || b.message || b.error_description || b.error)) || ""}`.trim()); e.status = res.status; throw e; } return b; }

/** A magic link for `email` (service role). → the action link (for a browser) and its hashed token (for the API). */
export async function magicLink(email = adminSignInEmail()) {
  const { url, key } = env();
  const b = await j(await fetch(`${url}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", email }) }));
  return { link: b.action_link || (b.properties && b.properties.action_link), hashed: b.hashed_token || (b.properties && b.properties.hashed_token) };
}

/** The robot's session, two-step finished (aal2). Throws when it can't, never a half-signed-in session. */
export async function robotSession() {
  if (!robotConfigured()) throw new Error("the robot staff account isn't set up (RGA_ROBOT_EMAIL / RGA_ROBOT_TOTP_SECRET); run scripts/create-robot-staff.mjs");
  if (!totpSelfTest()) throw new Error("the code generator failed its RFC 6238 self-test");
  // the PUBLIC anon key: from .env when present, else from the live admin-config (it serves it to the login page by design)
  if (!process.env.SUPABASE_ANON_KEY) { try { const c = await (await fetch("https://www.rocketgrowthagency.com/.netlify/functions/admin-config")).json(); if (c && c.supabaseAnonKey) process.env.SUPABASE_ANON_KEY = c.supabaseAnonKey; } catch { /* the verify below says so */ } }
  const { url, anon } = env();
  const { hashed } = await magicLink(process.env.RGA_ROBOT_EMAIL);
  const s1 = await j(await fetch(`${url}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: hashed }) }));
  const H = { apikey: anon, Authorization: `Bearer ${s1.access_token}`, "Content-Type": "application/json" };
  const user = await j(await fetch(`${url}/auth/v1/user`, { headers: H }));
  const f = (user.factors || []).find((x) => x.factor_type === "totp" && x.status === "verified");
  if (!f) throw new Error("the robot has no verified authenticator; run scripts/create-robot-staff.mjs");
  const ch = await j(await fetch(`${url}/auth/v1/factors/${f.id}/challenge`, { method: "POST", headers: H, body: "{}" }));
  const s2 = await j(await fetch(`${url}/auth/v1/factors/${f.id}/verify`, { method: "POST", headers: H, body: JSON.stringify({ challenge_id: ch.id, code: totp(process.env.RGA_ROBOT_TOTP_SECRET) }) }));
  const now = Math.floor(Date.now() / 1000);
  return { access_token: s2.access_token, refresh_token: s2.refresh_token, token_type: "bearer", expires_in: s2.expires_in, expires_at: now + Number(s2.expires_in || 3600), user: s2.user || user };
}

/**
 * Sign a browser page in to the live admin (puppeteer or playwright). With the robot: its aal2 session is put where the admin's
 * client looks for it, then `next` opens. Without: the old magic link for hello@, then `next`.
 */
export async function signInAdmin(page, next, { site = "https://www.rocketgrowthagency.com", timeout = 60000 } = {}) {
  if (robotConfigured()) {
    const s = await robotSession(), k = STORAGE_KEY(env().url);
    await page.goto(`${site}/robots.txt`, { timeout });
    await page.evaluate((a) => { localStorage.setItem(a.k, a.v); }, { k, v: JSON.stringify(s) });
  } else {
    const { link } = await magicLink();
    if (!link) throw new Error("no sign-in link returned");
    await page.goto(link, { timeout });
  }
  if (next) await page.goto(next, { timeout });
}
