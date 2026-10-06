#!/usr/bin/env node
/**
 * check-signed-in-user-never-sees-login-form.mjs — succeeding must not look like failing.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * 2026-09-10. Chris clicked "Set Up Your Rocket Growth Agency Client Portal" in the welcome email
 * and landed on a LOGIN FORM reading "You are already signed in as chriskapranos2@gmail.com."
 *
 * Nothing had failed. The magic link worked perfectly:
 *
 *     welcome email → /client-portal/ → 302 → /client-login/#access_token=...
 *     supabase consumes the fragment → session established → getSession() returns it
 *     client-login.js printed a notice ... and rendered the Email field anyway
 *
 * So the single most fragile step in onboarding — the one moment a new client MUST get through —
 * ended on a screen asking them to log in again. A client does not read "already signed in"; they
 * read "it didn't work" and either try again or give up. We would never have heard why.
 *
 * 🔑 THE INVARIANT: once a session exists, the login page's job is DONE. It must leave, not narrate.
 *
 * ─── AND THE TRAP THE FIX CREATES ─────────────────────────────────────────────────────────────
 * Forwarding every live session to /portal/ makes any plain /client-login/ link from INSIDE the
 * portal a dead button — click it, bounce straight back. That matters in exactly one real state:
 * signed in, but that email has no portal access. The user's only way out is a different email, and
 * a bounce means they can never reach the form to try one. Hence ?switch=1, and hence check 3 —
 * which is the one that would actually catch a regression, because it constrains NEW code.
 *
 * Exit 0 = a signed-in visitor is always forwarded · 1 = they can be stranded · 2 = could not tell.
 */
import fs from "node:fs";

// 🔑 THE SITE PATH IS A DEFAULT, NOT A CONSTANT. A gate that can only ever read the real
// working tree cannot be pointed at a scratch copy, so its mutations cannot be run — and a
// gate nobody can make fail is a gate nobody has checked. Found 2026-10-06 when three
// mutations of `check-refusal-is-not-done` all came back green: it was reading straight past
// them. → feedback_a_gate_that_cannot_fail · feedback_the_harness_i_wrote_to_check_my_work_can_lie
const __SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SITE = `${__SITE}`;
const LOGIN = `${SITE}/portal/client-login.js`;
const PORTAL = `${SITE}/portal/portal.js`;
const SABOTAGE = process.env.SABOTAGE === "1";

console.log("── a signed-in visitor is never shown a login form ──");

for (const f of [LOGIN, PORTAL]) {
  if (!fs.existsSync(f)) {
    console.log(`  ⚠️  missing: ${f}`);
    process.exit(2); // 🔴 exit 2, not 1 — a missing file means we could not tell, not that it passed.
  }
}

// Strip comments before matching. This file's own prose quotes the strings it looks for, and a gate
// that matches its own documentation passes its own sabotage test while proving nothing.
const strip = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

let login = strip(fs.readFileSync(LOGIN, "utf8"));
let portal = strip(fs.readFileSync(PORTAL, "utf8"));

if (SABOTAGE) {
  const which = process.env.SABOTAGE_CASE || "1";
  if (which === "1") login = login.replace(/window\.location\.replace\("\/portal\/"\)/, 'setAlert("hi")');
  if (which === "2") login = login.replace(/params\.get\("switch"\)/g, "false");
  if (which === "3") portal = portal.replace(/"\/client-login\/\?switch=1"/g, '"/client-login/"');
}

let fails = 0;

// ── 1. A live session on the login page must NAVIGATE AWAY, not just describe itself. ──────────
const sessionBlock = login.match(/if\s*\(\s*session\s*\)\s*\{([\s\S]{0,900}?)\n\s{0,4}\}/);
if (!sessionBlock) {
  console.log("  ⚠️  could not locate the `if (session)` branch in client-login.js");
  process.exit(2);
}
if (/location\.(replace|href|assign)\s*\(?\s*=?\s*["'`]\/portal\//.test(sessionBlock[1])) {
  console.log("  ✅ a live session is forwarded to /portal/");
} else {
  console.log("  🔴 client-login.js: a session exists and the page STAYS — the client sees a login");
  console.log("     form after a link that worked. Redirect to /portal/ inside `if (session)`.");
  fails++;
}

// ── 2. The escape hatch must exist, or "wrong email" becomes unrecoverable. ─────────────────────
if (/params\.get\(["'`]switch["'`]\)/.test(login)) {
  console.log("  ✅ ?switch=1 still reaches the form (sign in as a different client)");
} else {
  console.log("  🔴 client-login.js: no ?switch escape hatch. A client signed in with the wrong");
  console.log("     email can never reach the form to request a link for the right one.");
  fails++;
}

// ── 3. THE LOAD-BEARING ONE — no dead buttons back to a page that will bounce you. ─────────────
// Everything textually after `portalAuth = "in"` runs with a confirmed session, so a bare
// /client-login/ link there is guaranteed to bounce back. It must carry ?switch=1.
const inMarker = portal.search(/dataset\.portalAuth\s*=\s*["'`]in["'`]/);
if (inMarker === -1) {
  console.log("  ⚠️  could not find `portalAuth = \"in\"` in portal.js");
  process.exit(2);
}
const afterAuth = portal.slice(inMarker);
const bare = [...afterAuth.matchAll(/["'`](\/client-login\/[^"'`]*)["'`]/g)]
  .map((m) => m[1])
  .filter((u) => !/[?&]switch=/.test(u));
if (bare.length === 0) {
  console.log("  ✅ every in-portal link back to the login page carries ?switch=1");
} else {
  console.log(`  🔴 portal.js: ${bare.length} link(s) to the login page from a SIGNED-IN state`);
  console.log("     without ?switch=1 — each is a dead button that bounces straight back:");
  bare.forEach((u) => console.log(`       ${u}`));
  fails++;
}

if (fails) {
  console.log(`\n🔴 ${fails} check(s) failed — a client can be stranded on a login form.`);
  process.exit(1);
}
console.log("\n✅ succeeding never looks like failing.");
process.exit(0);
