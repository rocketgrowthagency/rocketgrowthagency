#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-admin-two-step-sign-in.mjs — admin two-step sign-in (TOTP), approved Chris 11-12 (mockup admin_2fa).
//
// HOLDS (no network: the real _auth.js runs against a stubbed fetch and hand-made JWT payloads):
//   1. flag OFF (ADMIN_MFA_REQUIRED unset / 0): the staff guards accept an aal1 token even for a user WITH a code app, and
//      the admin page's getContext never reaches the MFA call (guarded by `if (adminMfaRequired)`); admin-config says false
//   2. flag ON: an enrolled user on an aal1 token is refused 401 "Two-step sign-in is required. Sign in again."; aal2 passes;
//      a user with NO verified factor is NEVER refused (sent to setup, so the release cannot lock anyone out)
//   3. the page: no code app -> setup screen, enrolled + aal1 -> code screen, aal2 -> in (twoStepLevel run with a stub client)
//   4. portal / internal / cron guards are untouched (an aal1 portal user passes requirePortalOwner with the flag on)
//   5. the approved words are on the screens; the wrong-code line is exact
//   6. the 6 boxes SHRINK (flex 0 1, min-width 0, border-box) so nothing overflows the card at 360px; colours only via var()
// exit 0 holds · 1 broken · 2 can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import os from "node:os";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (rel) => { try { return fs.readFileSync(`${SITE}/${rel}`, "utf8"); } catch { console.error(`INDETERMINATE: cannot read ${rel}`); process.exit(2); } };
const fails = []; const F = (m) => fails.push(m);
const admin = read("admin/admin.js"), html = read("admin/index.html"), css = read("admin/admin.css");
const authSrc = read("netlify/functions/_auth.js"), cfgSrc = read("netlify/functions/admin-config.js");

// ── 3 + 1(page) · static + a run of twoStepLevel ──
const lvl = admin.match(/async function twoStepLevel\(\) \{[\s\S]*?\n\}\n/);
if (!lvl) { console.error("INDETERMINATE: twoStepLevel not found"); process.exit(2); }
const level = (cur, next) => new Function("supabase", `${lvl[0]}; return twoStepLevel();`)({ auth: { mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: cur, nextLevel: next }, error: null }) } } });
const L = { none: await level("aal1", "aal1"), enrolled: await level("aal1", "aal2"), done: await level("aal2", "aal2") };
if (L.none !== "setup") F(`no code app must go to the setup screen, got ${L.none}`);
if (L.enrolled !== "code") F(`enrolled + aal1 must go to the code screen, got ${L.enrolled}`);
if (L.done !== null) F(`aal2 must go straight in, got ${L.done}`);
const ctx = admin.match(/async getContext\(\) \{\s*const \{ data: sessionData \}[\s\S]*?requiresBootstrap: true/);
if (!ctx) F("getContext not found");
else {
  const calls = ctx[0].match(/twoStepLevel\(\)/g) || [];
  if (calls.length !== 1 || !/if \(adminMfaRequired\) \{\s*const level = await twoStepLevel\(\);\s*if \(level\) return \{ requiresMfa: level \};\s*\}/.test(ctx[0])) F("getContext must reach twoStepLevel only inside `if (adminMfaRequired)` and return requiresMfa (flag off = sign-in unchanged)");
}
if ((admin.match(/getAuthenticatorAssuranceLevel/g) || []).length !== 1) F("the assurance-level call must exist exactly once, inside twoStepLevel");
if (!/adminMfaRequired = config\.adminMfaRequired === true;/.test(admin)) F("the page flag must be exactly config.adminMfaRequired === true (absent = off)");
if (!/if \(context\.requiresMfa\) \{\s*await showTwoStepScreen\(context\.requiresMfa\);\s*return;/.test(admin)) F("a reload with requiresMfa must show the screen and never enter the admin");
if (!/signInWithPassword\(\{ email, password \}\)/.test(admin)) F("password sign-in changed");

// ── 5 · words ──
const WORDS = ["Log in to RGA Admin", "Rocket Growth Agency staff", "Forgot your password?", "Staff only &middot; protected sign-in", "Set up your code", "Open your authenticator app, add an account, scan this",
  "Can't scan? Type this key instead:", "6-digit code", "Turn on", "Save the key above in Bitwarden (Rocket Growth Agency &rarr; RGA Admin). If your phone is lost, it's the way back in.",
  "Enter your code", "The 6-digit code from your authenticator app", "Verify", "Use a different account"];
for (const w of WORDS) if (!html.includes(w)) F(`admin/index.html is missing the approved words: ${w}`);
for (const gone of ["Admin Login", "admin-lock-wordmark", "Forgot password?", "admin-mfa-steps", "admin-mfa-lede", "admin-mfa-note"]) if (html.includes(gone)) F(`admin/index.html still has "${gone}" (removed by the approved dark sign-in)`);
if (!/<h1 class="admin-lock-heading">Log in to RGA Admin<\/h1>/.test(html)) F("the sign-in heading must be exactly: Log in to RGA Admin");
if ((html.match(/class="admin-lock-logo"[^>]*width="48" height="48"/g) || []).length !== 3) F("all three lock screens use the RGA icon at 48px");
if ((html.match(/class="admin-button admin-lock-submit"/g) || []).length !== 3) F("three lock buttons, each `admin-button admin-lock-submit`");
if (!admin.includes(`"That code didn't match. Codes change every 30 seconds; try the newest one."`)) F("the wrong-code line is not exact");
if (!/friendlyName: "Rocket Growth Agency admin"/.test(admin) || !/factorType: "totp"/.test(admin)) F("enrol must be a totp factor named Rocket Growth Agency admin");
if ((html.match(/class="admin-code-box"/g) || []).length !== 12) F("two screens x 6 boxes expected");
if (!/autocomplete="one-time-code"/.test(html) || !/inputmode="numeric"/.test(html)) F("boxes need inputmode numeric + one-time-code");
for (const id of ["mfaSetupButton", "mfaCodeButton", "mfaDifferentButton"]) if (!html.includes(`id="${id}"`)) F(`${id} missing`);
if (!/button\.classList\.toggle\("is-pending", on\)/.test(admin)) F("every two-step button must spin (is-pending)");
if (!/paste/.test(admin) || !/Backspace/.test(admin) || !/requestSubmit/.test(admin)) F("paste / backspace / Enter handling missing from the code boxes");

// ── 6 · widths ──
const rule = (sel) => { const m = css.match(new RegExp(`(?:^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`)); return m ? m[1] : ""; };
const box = rule(".admin-code-box"), row = rule(".admin-code-boxes"), qr = rule(".admin-mfa-qr");
if (!/flex:\s*0 1 \d+px/.test(box) || !/min-width:\s*0/.test(box) || !/box-sizing:\s*border-box/.test(box)) F("the code boxes must shrink: flex 0 1 <size>, min-width 0, box-sizing border-box");
if (!/max-width:\s*100%/.test(row) || !/box-sizing:\s*border-box/.test(row) || !/min-width:\s*0/.test(row)) F("the box row needs min-width 0, max-width 100%, border-box");
if (!/max-width:\s*100%/.test(qr) || !/box-sizing:\s*border-box/.test(qr)) F("the QR frame must be max-width 100% and border-box");
const at = css.indexOf("/* Two-step sign-in");
const block = at < 0 ? "" : css.slice(at).replace(/\/\*[\s\S]*?\*\//g, "");
if (!block || /#[0-9a-fA-F]{3,6}\b/.test(block)) F("the two-step CSS must take colours from var() tokens, no hex literal");
// 6 boxes x 48 + 5 gaps x 8 = 328px; the card's inner width at a 360px phone is ~284px, so the boxes must be able to shrink (flex-shrink 1, min-width 0).

// ── 7 · the approved dark sign-in (Chris 11-12, mockup admin-login-spotify): tokens, scope, the doubled button selector ──
const TOK = { "--lock-page-top": "#1a2036", "--lock-page": "#0f1320", "--lock-panel": "#121624", "--lock-field": "#1d2335", "--lock-line": "#3a4256", "--lock-divider": "#2a3044",
  "--lock-ink": "#ffffff", "--lock-muted": "#a7b0c4", "--lock-soft": "#7c8599", "--lock-brand": "#2f6bff", "--lock-brand-hover": "#4b7fff", "--lock-warn-ink": "#f6c983" };
for (const [k, v] of Object.entries(TOK)) if (!new RegExp(`${k}:\\s*${v}\\b`, "i").test(css)) F(`admin.css :root must declare ${k}: ${v} (approved sign-in palette)`);
const lockAt = css.indexOf("/* ═══ 11-12 ADMIN SIGN-IN, DARK"), lockEnd = css.indexOf(".admin-main {\n  display: flex;");
const lockCss = lockAt < 0 || lockEnd < lockAt ? "" : css.slice(lockAt, lockEnd).replace(/\/\*[\s\S]*?\*\//g, "");
if (!lockCss) F("the lock block (from the `11-12 ADMIN SIGN-IN, DARK` comment to .admin-main) is missing");
else {
  if (/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(lockCss)) F("the lock rules must take every colour from a --lock-* token (no hex / rgb literal)");
  if (!/var\(--lock-ink\)/.test(lockCss) || !/var\(--lock-brand\)/.test(lockCss) || !/var\(--lock-field\)/.test(lockCss)) F("the lock rules must use the --lock-* tokens");
  if (!/\.admin-button\.admin-lock-submit\s*\{[^}]*height:\s*50px[^}]*border-radius:\s*999px[^}]*background:\s*var\(--lock-brand\)/s.test(lockCss)) F("the lock button must be the DOUBLED selector `.admin-button.admin-lock-submit` (50px, pill, --lock-brand): `.admin-button` later in the file squashes a single class");
  if (/(^|\n)\.admin-lock-submit\s*\{/.test(lockCss)) F("a single-class `.admin-lock-submit` rule loses to `.admin-button` — use the doubled selector");
  if (!/\.admin-lock-heading\s*\{[^}]*font-size:\s*2\.4rem[^}]*font-weight:\s*800[^}]*letter-spacing:\s*-0\.03em[^}]*max-width:\s*14ch/s.test(lockCss)) F("the lock heading must be 2.4rem / 800 / -0.03em / 14ch");
  if (!/\.admin-lock-logo\s*\{[^}]*width:\s*48px[^}]*height:\s*48px[^}]*border-radius:\s*14px/s.test(lockCss)) F("the lock logo must be 48px, radius 14px");
  if (!/\.admin-auth\s*\{[^}]*max-width:\s*520px[^}]*background:\s*var\(--lock-panel\)[^}]*padding:\s*44px 0 40px[^}]*gap:\s*30px/s.test(lockCss)) F("the panel must be 520px, --lock-panel, padding 44px 0 40px, gap 30px");
  if (!/@media \(max-width: 599px\)\s*\{[\s\S]*background:\s*transparent/.test(lockCss)) F("on a phone the panel background goes away");
}
if (!/body\.admin-body\[data-admin-view="auth"\],[^{]*\{[^}]*var\(--lock-page-top\)[^}]*var\(--lock-page\)/.test(css)) F("the lock states' page background must be the --lock-page-top -> --lock-page gradient");
if (/body\.admin-body\[data-admin-view="(dashboard|client|clients|list|leads)"\][^{]*\{[^}]*--lock-/.test(css)) F("the dark palette must never reach a signed-in admin view");

// ── 1 + 2 + 4 · the real _auth.js, stubbed fetch ──
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (aal) => `${b64({ alg: "HS256" })}.${b64({ aal, sub: "u" })}.sig`;
const ev = (aal) => ({ headers: { authorization: `Bearer ${jwt(aal)}` } });
process.env.SUPABASE_URL = "https://stub.invalid"; process.env.SUPABASE_ANON_KEY = "a"; process.env.SUPABASE_SERVICE_ROLE_KEY = "s";
let user = null;
globalThis.fetch = async (url) => {
  const u = String(url); const ok = (b) => ({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b) });
  if (u.includes("/auth/v1/user")) return ok(user);
  if (u.includes("/rest/v1/profiles")) return ok([{ workspace_id: "w1", role: "owner" }]);
  if (u.includes("/rest/v1/clients")) return ok([{ id: "c1", workspace_id: "w1" }]);
  if (u.includes("/rest/v1/client_portal_access")) return ok([{ client_id: "c1" }]);
  return { ok: false, status: 404, json: async () => ({}), text: async () => "" };
};
const require = createRequire(import.meta.url);
const tmp = fs.mkdtempSync(`${os.tmpdir()}/two-step-auth-`);
for (const f of fs.readdirSync(`${SITE}/netlify/functions`)) if (/^_[^/]*\.js$/.test(f)) fs.copyFileSync(`${SITE}/netlify/functions/${f}`, `${tmp}/${f}`);
const A = require(`${tmp}/_auth.js`);
const enrolled = { id: "u1", email: "a@b.co", factors: [{ id: "f", factor_type: "totp", status: "verified" }] };
const plain = { id: "u2", email: "a@b.co", factors: [] };
const status = (r) => (r.error ? JSON.parse(r.error.body).error + "|" + r.error.statusCode : "ok");
async function both(aal, u) { user = u; return [status(await A.requireWorkspaceUser(ev(aal))), status(await A.requireWorkspaceForClient(ev(aal), "c1"))]; }
const REFUSAL = "Two-step sign-in is required. Sign in again.|401";
for (const v of [undefined, "0", "", "off"]) {
  if (v === undefined) delete process.env.ADMIN_MFA_REQUIRED; else process.env.ADMIN_MFA_REQUIRED = v;
  const r0 = await both("aal1", enrolled); if (r0.join() !== "ok,ok") F(`flag "${v}" (off): an aal1 token must pass exactly as today, got ${r0}`);
}
process.env.ADMIN_MFA_REQUIRED = "1";
let r = await both("aal1", enrolled); if (r.join() !== `${REFUSAL},${REFUSAL}`) F(`flag on: enrolled + aal1 must be refused with the exact line by BOTH staff guards, got ${r}`);
r = await both("aal2", enrolled); if (r.join() !== "ok,ok") F(`flag on: aal2 must pass, got ${r}`);
r = await both("aal1", plain); if (r.join() !== "ok,ok") F(`flag on: a user with NO verified factor must never be refused (lockout), got ${r}`);
user = { ...enrolled, factors: [{ factor_type: "totp", status: "unverified" }] };
if (status(await A.requireWorkspaceUser(ev("aal1"))) !== "ok") F("an UNVERIFIED factor must not count (a half-finished setup would lock out)");
// portal + internal + cron untouched
user = enrolled;
if (status(await A.requirePortalOwner(ev("aal1"), "c1")) !== "ok") F("flag on: an aal1 portal user must still pass requirePortalOwner");
for (const fn of ["requirePortalOwner", "requireInternalSecret", "requireCronOrInternal", "internalSecretMatches", "isScheduledInvocation", "requireUser"]) {
  const m = authSrc.match(new RegExp(`(?:async )?function ${fn}\\([\\s\\S]*?\\n\\}\\n`));
  if (!m) { F(`${fn} not found`); continue; }
  if (/staffMfaRefusal|ADMIN_MFA/.test(m[0])) F(`${fn} must not know about two-step sign-in`);
}
process.env.INTERNAL_FN_SECRET = "x";
if (A.requireInternalSecret({ headers: { "x-internal-secret": "x" } }).error) F("internal secret guard changed");
// admin-config
fs.writeFileSync(`${tmp}/admin-config.js`, cfgSrc);
const C = require(`${tmp}/admin-config.js`);
for (const [v, want] of [[undefined, false], ["0", false], ["1", true], ["true", true]]) {
  if (v === undefined) delete process.env.ADMIN_MFA_REQUIRED; else process.env.ADMIN_MFA_REQUIRED = v;
  const b = JSON.parse((await C.handler()).body);
  if (b.adminMfaRequired !== want) F(`admin-config with ADMIN_MFA_REQUIRED=${v}: adminMfaRequired must be ${want}, got ${b.adminMfaRequired}`);
}
fs.rmSync(tmp, { recursive: true, force: true });

if (fails.length) { console.error("BROKEN: admin two-step sign-in"); for (const f of fails) console.error("   - " + f); process.exit(1); }
console.log("two-step sign-in holds: off = unchanged, on = aal2 for enrolled staff, no lockout, portal/internal untouched, words exact, boxes shrink");
