#!/usr/bin/env node
/**
 * check-portal-calls-stay-authenticated.mjs
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 THE PORTAL HELD ONE ACCESS TOKEN FOR THE LIFE OF THE TAB.
 *
 * Chris, 2026-09-16, pressing "Check again" on a tab that had been open a while: the function
 * returned **401 Invalid or expired token** and the portal showed him "reply to your last email
 * from us" — advice that cannot help, for a problem one refresh fixes.
 *
 * `_portalSession` was captured ONCE when the dashboard rendered and never refreshed. A Supabase
 * access token lives ONE HOUR. So after an hour with the tab open, EVERY authenticated action in
 * the portal failed identically: answering an owner question, choosing call tracking, marking a
 * step done, flagging one, re-checking one — and **signing a contract** and **paying an invoice**.
 *
 * Nothing caught it because every one of those paths returns a clean 401 and the portal's own
 * error copy made it look like a transient fault. → feedback_correct_is_not_the_same_as_happening
 *
 * ── AND THE SECOND HALF ────────────────────────────────────────────────────────────────────────
 * The same session surfaced that every `notify-rga` call from the checklist had been returning
 * **400 Missing kind** since the day it was written — logged to `console.error` and read by nobody
 * — and that a 200 from that endpoint means "request accepted", not "message delivered": with no
 * webhook configured it returns `delivered:false` and status 200.
 * → feedback_a_swallowed_send_failure_is_an_outage · feedback_an_alert_nobody_reads_is_not_an_alert
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 */
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (p) => fs.readFileSync(path.join(SITE, p), "utf8");
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

let fail = 0;
const bad = (m) => { console.log(`  🔴 ${m}`); fail++; };
const ok = (m) => console.log(`  ✅ ${m}`);

console.log("── portal calls stay authenticated, and notifications actually go ──");

// ── 1. no portal fetch may send a token captured at boot ───────────────────────────────────────
const portal = strip(read("portal/portal.js"));

if (!/async function portalToken\(\)/.test(portal)) {
  bad("portalToken() is gone — the portal would be back to one token for the life of the tab");
}
// 🔑 Scoped to the FUNCTION BODY. The loose form matched `portalToken()` at one of its ten call
// sites and then found an unrelated `auth.getSession()` further down the file — so it stayed green
// with the refresh deleted. → feedback_dead_check_selector_gap
{
  const i = portal.indexOf("async function portalToken()");
  const body = i >= 0 ? portal.slice(i, portal.indexOf("\n}", i)) : "";
  if (!body) bad("could not read portalToken's body — this gate is not auditing the refresh");
  else {
    if (!/auth\.getSession\(\)/.test(body)) bad("portalToken() does not call getSession() — it cannot be refreshing anything");
    if (!/session\?\.access_token/.test(body)) bad("portalToken() never reads the refreshed access_token");
  }
}

// 🔑 The real assertion: the stale copy must never be sent. Count Authorization headers that
// interpolate the cached variable instead of awaiting a fresh one.
const stale = [...portal.matchAll(/Bearer \$\{_factsToken\}/g)];
if (stale.length) {
  bad(`${stale.length} portal call(s) still send the cached _factsToken — each one 401s after an hour`);
}
const fresh = [...portal.matchAll(/Bearer \$\{await portalToken\(\)\}/g)];
if (fresh.length < 8) {
  bad(`only ${fresh.length} portal call(s) fetch a fresh token — expected every authenticated call to`);
}

// 🔴 A 401 must not be dressed as a fault the client caused or support can fix.
const ce = portal.indexOf("function clientError(");
const ceBody = ce >= 0 ? portal.slice(ce, portal.indexOf("\n}", ce)) : "";
if (!ceBody) bad("clientError is gone — every failure would surface raw");
else {
  if (!/401|expired/i.test(ceBody)) {
    bad("clientError does not special-case an expired session — it would tell them to email support over a refresh");
  }
  if (!/Refresh the page|sign(ed)? (you )?back in/i.test(ceBody)) {
    bad("the expired-session message does not tell them what to actually do");
  }
}

// ── 2. every notify-rga caller sends what notify-rga demands ───────────────────────────────────
const notify = read("netlify/functions/notify-rga.js");
const required = [...notify.matchAll(/if \(!(\w+) \|\| !(\w+)\) return json\(400/g)][0];
const must = required ? [required[1], required[2]] : ["kind", "message"];

const callers = fs.readdirSync(path.join(SITE, "netlify/functions"))
  .filter((f) => f.endsWith(".js") && f !== "notify-rga.js")
  .filter((f) => read(`netlify/functions/${f}`).includes("/notify-rga"));

if (!callers.length) bad("no notify-rga callers found — this gate is not reading anything");

for (const f of callers) {
  const src = read(`netlify/functions/${f}`);
  // Each fetch to notify-rga and the body it sends.
  for (const m of src.matchAll(/notify-rga[\s\S]{0,900}?body: JSON\.stringify\(\{([\s\S]{0,700}?)\}\),/g)) {
    const bodySrc = m[1];
    for (const field of must) {
      if (!new RegExp(`\\b${field}\\s*:`).test(bodySrc)) {
        bad(`${f} calls notify-rga without \`${field}\` — it returns 400 and nobody is told anything`);
      }
    }
  }
  // 🔴 A 200 from notify-rga is not a delivery. A caller must either CHECK that, or hold its own
  // verified durable record and refuse to report success without it.
  //
  // 🔑 `portal-message` does the latter, and it is the stronger form: it writes the client's words
  // to `client_activity`, reads the write back, and returns 500 if it did not land — so the push
  // through notify-rga is a bonus, not the delivery. Demanding a `delivered` check there would be
  // demanding a check on something that is already guaranteed by construction.
  const ownsDurableWrite = /skip_activity:\s*true/.test(src) && /if \(!logged\) return json\(500/.test(src);
  if (!/delivered === false/.test(src) && !ownsDurableWrite) {
    bad(`${f} treats any 200 from notify-rga as delivered, and holds no verified record of its own — an unconfigured webhook reads as success`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴🔴 THE CRON MUST BE ABLE TO REACH THE NOTIFIER. Found by audit on 2026-09-17, not by anything
// failing: `notify-rga` accepted only a portal owner, and the nightly step sweep calls it through
// `portal-step-recheck` with an internal secret and no JWT. Every notification the nightly produced
// 401'd — including its single most valuable output, "a client's Google connection has broken".
//
// 🔑 A chain is only as reachable as its least reachable link, and nothing in the chain fails
// loudly: the cron logs a console error nobody reads.
// → feedback_a_guard_must_reach_the_thing_it_guards
// ═══════════════════════════════════════════════════════════════════════════════════════════════
{
  if (!/x-internal-secret/.test(notify)) {
    bad("notify-rga does not accept the internal secret — every notification from the nightly sweep would 401");
  }
  if (!/requirePortalOwner/.test(notify)) {
    bad("notify-rga no longer checks a portal owner — it would accept any unauthenticated caller");
  }
  // 🔴 And the caller in the middle must FORWARD the credential it was given. Accepting the secret
  // at notify-rga is useless if recheck only ever passes on an Authorization header it lacks.
  const rc2 = read("netlify/functions/portal-step-recheck.js");
  if (/notify-rga/.test(rc2) && !/viaCron \? \{ "x-internal-secret"/.test(rc2)) {
    bad("portal-step-recheck does not forward the internal secret to notify-rga — a cron-triggered notification would 401");
  }
}

// 🔑 Every `kind` a caller sends should have a label, or it renders as a raw slug in Slack.
const labels = new Set([...notify.matchAll(/^\s{4}([a-z_]+):\s*"/gm)].map((m) => m[1]));
for (const f of callers) {
  for (const m of read(`netlify/functions/${f}`).matchAll(/kind:\s*"([a-z_]+)"/g)) {
    // activity-table kinds are not notification kinds; only flag those sent TO notify-rga
    const src = read(`netlify/functions/${f}`);
    const i = src.indexOf(`kind: "${m[1]}"`);
    const near = src.slice(Math.max(0, i - 900), i);
    if (near.includes("/notify-rga") && !labels.has(m[1])) {
      bad(`${f} sends kind "${m[1]}" to notify-rga, which has no label for it — it renders as a raw slug`);
    }
  }
}

if (!fail) {
  ok(`every portal call fetches a fresh token (${fresh.length} sites); an expired session says so plainly`);
  ok(`all ${callers.length} notify-rga caller(s) send ${must.join(" + ")} and check delivery`);
}

console.log(fail
  ? `\n🔴 ${fail} problem(s) — a portal action would fail silently, or a notification would not arrive.`
  : "\n✅ portal calls stay authenticated and every notification is sent and checked.");
process.exit(fail ? 1 : 0);
