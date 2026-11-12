#!/usr/bin/env node
// check-sign-ups-are-closed.mjs — AN ACCOUNT EXISTS ONLY BECAUSE RGA INVITED THAT EMAIL (security master #13, approved 11-11, finding S2).
//
// 🔴 WHY: the client login and the admin invite both called signInWithOtp with shouldCreateUser:true, and the welcome email asked
// Supabase's /otp with create_user:true, so ANY email typed into the login page became an account. Row level security kept it away
// from client data, but a self-made account was one row away from the 11-11 workspace hole (S1).
// 🔑 THE FIX THIS GUARDS: the server makes the account at invite time (website netlify/functions/_portal-user.js ensurePortalUser,
// called by admin-portal-user.js for the admin invite and by send-welcome-email.js), and every sign-in says shouldCreateUser:false /
// create_user:false. An address with no account reads exactly like one with an account on the login page (no list of clients leaks).
// (a) STATIC on the website: no `shouldCreateUser: true` / `create_user: true` anywhere; every signInWithOtp and every /auth/v1/otp
//     says false EXPLICITLY (Supabase's default is true); send-welcome-email makes the account before its /otp call; the admin invite
//     calls admin-portal-user before its signInWithOtp; admin-portal-user is staff-guarded and only for an email the client has access
//     for; the login page treats Supabase's otp_disabled answer as "check your email".
// (b) SELF-PROVING: ensurePortalUser runs on a fake Supabase (made → created, already there → fine, refused → throws, not an email →
//     throws), and the login page's own signupRefused() is lifted and run on Supabase's real error shapes.
// (c) LIVE, read-only (skipped in the mutation copy): every active client_portal_access email has an account, so no existing client
//     is locked out; and Supabase's own sign-up switch is reported (Chris's step in docs/supabase/PENDING_FOR_CHRIS.md: a ⚠️ line, not red).
// Live-tested 11-11 on the RGA test client: an address RGA never invited → 422 otp_disabled, no account made; the test client → 200.
// Exit 0 = sign-ups closed in the code · 1 = a way to make an account by signing in is open · 2 = INDETERMINATE.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const COPY = !!process.env.SCRAPER_COPY_DIR;
const idk = (m) => { console.error(`⚠️  INDETERMINATE — ${m}`); process.exit(2); };
const F = [];
const fail = (m) => F.push(m);
const read = (r) => { try { return fs.readFileSync(path.join(SITE, r), "utf8"); } catch { idk(`cannot read ${r}`); } };
const code = (s) => s.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

// ── (a) static ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const files = [];
for (const dir of ["admin", "portal", "shared", "netlify/functions", "client-login"]) {
  let names = []; try { names = fs.readdirSync(path.join(SITE, dir)); } catch { continue; }
  for (const n of names) if (/\.(js|mjs|html)$/.test(n)) files.push(`${dir}/${n}`);
}
if (files.length < 50) idk(`only ${files.length} source files found under ${SITE}`);
let otpSites = 0;
for (const f of files) {
  const src = code(read(f));
  if (/shouldCreateUser\s*:\s*true/.test(src)) fail(`${f} signs in with shouldCreateUser: true (a typed email becomes an account)`);
  if (/create_user\s*:\s*true/.test(src)) fail(`${f} asks Supabase's /otp with create_user: true`);
  for (const m of src.matchAll(/signInWithOtp\s*\(/g)) {
    otpSites++;
    if (!/shouldCreateUser\s*:\s*false/.test(src.slice(m.index, m.index + 400))) fail(`${f}: a signInWithOtp call doesn't say shouldCreateUser: false (Supabase's default makes the account)`);
  }
  for (const m of src.matchAll(/\/auth\/v1\/otp/g)) {
    otpSites++;
    if (!/create_user\s*:\s*false/.test(src.slice(m.index, m.index + 500))) fail(`${f}: an /auth/v1/otp call doesn't say create_user: false`);
  }
}
if (otpSites < 3) idk(`only ${otpSites} sign-in link senders found (the client login, the admin invite and the welcome email are expected)`);

const welcome = code(read("netlify/functions/send-welcome-email.js"));
const wEnsure = welcome.indexOf("ensurePortalUser("), wOtp = welcome.indexOf("/auth/v1/otp");
if (wEnsure < 0) fail("send-welcome-email.js doesn't make the account on the server (ensurePortalUser) before the link");
else if (wOtp >= 0 && wEnsure > wOtp) fail("send-welcome-email.js sends the link before it makes the account");
if (!/catch\s*\(e\)\s*\{\s*return json\(500/.test(welcome.slice(wEnsure, wEnsure + 300))) fail("send-welcome-email.js sends the link even when the account couldn't be made");

const admin = code(read("admin/admin.js"));
const inv = admin.indexOf("async sendPortalInvite(client, portalEmail, options = {})");
if (inv < 0) idk("admin.js has no sendPortalInvite(client, portalEmail, options) (the Supabase adapter's invite)");
const invBody = admin.slice(inv, inv + 3000);
const aMake = invBody.indexOf("/.netlify/functions/admin-portal-user"), aOtp = invBody.indexOf("signInWithOtp(");
if (aMake < 0) fail("the admin invite doesn't make the account on the server (admin-portal-user) first");
else if (aOtp >= 0 && aMake > aOtp) fail("the admin invite sends the link before the account is made");
if (aMake >= 0 && !/if \(!madeRes\.ok \|\| !made\.ok\) throw/.test(invBody)) fail("the admin invite goes on when the server couldn't make the account");

const apu = code(read("netlify/functions/admin-portal-user.js"));
if (!/requireWorkspaceForClient\(event, clientId\)/.test(apu)) fail("admin-portal-user.js isn't guarded by requireWorkspaceForClient (staff of the client's workspace)");
if (!/client_portal_access\?client_id=eq\./.test(apu) || !/if \(!row\) return json\(409/.test(apu)) fail("admin-portal-user.js would make an account for an email the client has no portal access for");
if (!/invite_status === "revoked"\) return json\(409/.test(apu)) fail("admin-portal-user.js would make an account for a revoked email");

const login = read("portal/client-login.js");
if (!/if \(error && !signupRefused\(error\)\) throw error;/.test(code(login))) fail("the login page shows Supabase's sign-up refusal as an error (it would tell a stranger which emails are clients, or block nobody)");

// ── (b) self-proving ─────────────────────────────────────────────────────────────────────────────────────────────────────
const require = createRequire(path.join(SITE, "netlify/functions/_portal-user.js"));
let PU;
try { PU = require("./_portal-user.js"); } catch (e) { idk(`_portal-user.js won't load: ${String(e.message).slice(0, 120)}`); }
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body), json: async () => body });
const deps = (status, body, seen) => ({ url: "https://sb.test", key: "k", fetch: async (u, o) => { seen && seen.push({ u, o }); return res(status, body); } });
{
  const seen = [];
  const a = await PU.ensurePortalUser("  New@Client.com ", deps(200, { id: "u1" }, seen));
  if (!a.ok || a.created !== true) fail("ensurePortalUser doesn't report a made account");
  const sent = seen[0] && JSON.parse(seen[0].o.body || "{}");
  if (!seen[0] || !/\/auth\/v1\/admin\/users$/.test(seen[0].u) || sent.email !== "new@client.com" || sent.email_confirm !== true) fail("ensurePortalUser doesn't make the account through the admin API with the lower-cased, confirmed address");
  const b = await PU.ensurePortalUser("old@client.com", deps(422, { code: 422, error_code: "email_exists", msg: "A user with this email address has already been registered" }));
  if (!b.ok || b.created !== false) fail("an existing account reads as a failure (every re-invite of a real client would break)");
  let threw = false; try { await PU.ensurePortalUser("x@client.com", deps(500, { msg: "down" })); } catch { threw = true; }
  if (!threw) fail("a refused account reads as made (the invite would send a link that can't sign in)");
  threw = false; try { await PU.ensurePortalUser("not-an-email", deps(200, {})); } catch { threw = true; }
  if (!threw) fail("ensurePortalUser makes an account for something that isn't an email");
}
{
  const m = /function signupRefused\(error\) \{[\s\S]*?\n\}/.exec(login);
  if (!m) idk("client-login.js has no signupRefused(error) to test");
  const signupRefused = new Function(`${m[0]}; return signupRefused;`)();
  if (!signupRefused({ status: 422, code: "otp_disabled", message: "Signups not allowed for otp" })) fail("Supabase's otp_disabled answer isn't read as 'no account'");
  if (!signupRefused({ status: 422, message: "Signups not allowed for this instance" })) fail("the sign-ups-off answer isn't read as 'no account'");
  if (signupRefused({ status: 429, message: "For security purposes, you can only request this after 42 seconds." })) fail("a rate limit reads as 'no account'");
  if (signupRefused({ status: 500, message: "Error sending magic link email" })) fail("a failed send reads as sent");
  if (signupRefused(null)) fail("no error reads as a refusal");
}

if (F.length) { console.error(`🔴 a sign-in can still make an account:\n${F.map((x) => `   · ${x}`).join("\n")}`); process.exit(1); }
if (COPY) { console.log("✅ sign-ups closed in the code (mutation copy: the live database is not read)"); process.exit(0); }

// ── (c) live, read-only ──────────────────────────────────────────────────────────────────────────────────────────────────
let envText = ""; try { envText = fs.readFileSync(path.join(path.dirname(HERE), ".env"), "utf8"); } catch { /* the environment may carry them */ }
const env = (k) => process.env[k] || ((new RegExp(`^${k}=(.*)$`, "m").exec(envText) || [])[1] || "").trim().replace(/^["']|["']$/g, "");
const DB = env("SUPABASE_URL"), SVC = env("SUPABASE_SERVICE_ROLE_KEY");
if (!DB || !SVC) idk("no database address or service key for the live read");
const h = { apikey: SVC, Authorization: `Bearer ${SVC}` };
let access, users = [];
try {
  const r = await fetch(`${DB}/rest/v1/client_portal_access?select=portal_email,invite_status`, { headers: h, signal: AbortSignal.timeout(15000) });
  if (!r.ok) idk(`client_portal_access answered HTTP ${r.status}`);
  access = await r.json();
  for (let p = 1; p < 50; p++) {
    const u = await fetch(`${DB}/auth/v1/admin/users?page=${p}&per_page=200`, { headers: h, signal: AbortSignal.timeout(15000) });
    if (!u.ok) idk(`the account list answered HTTP ${u.status}`);
    const list = (await u.json()).users || []; users.push(...list); if (list.length < 200) break;
  }
} catch (e) { idk(`the live read failed: ${String(e.message).slice(0, 100)}`); }
const have = new Set(users.map((u) => String(u.email || "").toLowerCase()));
const locked = access.filter((a) => a.invite_status !== "revoked" && !have.has(String(a.portal_email || "").toLowerCase()));
if (locked.length) { console.error(`🔴 ${locked.length} invited portal email(s) have no account, and sign-in no longer makes one: they can't sign in. Re-send their invite from admin (it makes the account).`); process.exit(1); }
let signupNote = "";
try {
  const anon = (await (await fetch("https://www.rocketgrowthagency.com/.netlify/functions/admin-config", { signal: AbortSignal.timeout(15000) })).json()).supabaseAnonKey;
  const s = await (await fetch(`${DB}/auth/v1/settings`, { headers: { apikey: anon }, signal: AbortSignal.timeout(15000) })).json();
  signupNote = s.disable_signup === true ? " · Supabase's sign-up switch is off" : " · ⚠️  Supabase's \"Allow new users to sign up\" is still ON (Chris's step 2 in website docs/supabase/PENDING_FOR_CHRIS.md)";
} catch { signupNote = " · Supabase's sign-up switch couldn't be read"; }
console.log(`✅ sign-ups closed in the code: ${otpSites} sign-in link senders all say "don't make an account", the account is made on the server at invite; ${access.length} portal access row(s), every active one has an account${signupNote}`);
