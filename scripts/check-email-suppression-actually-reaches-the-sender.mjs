#!/usr/bin/env node
/**
 * check-email-suppression-actually-reaches-the-sender.mjs — a flag that cannot reach the code it
 * guards is not a guard.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * 2026-09-10. `run-billing-ladder.mjs` backdates an invoice to exercise the dunning ladder. Without
 * suppression, every rung mails the client a real branded notice quoting a due date that only ever
 * existed inside the test — which is exactly what happened: Chris got "Your card will be charged in
 * 3 days ... on September 13" for an invoice genuinely due October 10.
 *
 * The first fix set `process.env.RGA_SUPPRESS_CLIENT_EMAIL` in the harness and checked it inside
 * `send-invoice-email`. It suppressed NOTHING: `billing-daily-check` reaches that function by HTTP,
 * so the deployed process never saw the harness's variable. The guard looked present, read as a
 * pass, and did nothing — the dead-check pattern, one process boundary over.
 *
 * 🔑 Env vars stop at the process edge. Anything crossing HTTP has to travel IN THE REQUEST.
 *
 * This gate asserts, statically:
 *   1. every function that sends client email has a suppression check at its send path
 *   2. any caller that reaches a sender over HTTP FORWARDS the flag in the body
 *   3. the sender reads it from the BODY, not only from the environment
 *
 * Exit 0 = suppression can actually reach every sender · 1 = a path is unguarded · 2 = can't tell.
 */
import fs from "node:fs";
import path from "node:path";

const SITE = "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const DIR = path.join(SITE, "netlify/functions");
const SABOTAGE = process.env.SABOTAGE === "1";
const FLAG = "RGA_SUPPRESS_CLIENT_EMAIL";

console.log("── email suppression reaches every sender, across process boundaries ──");

if (!fs.existsSync(DIR)) { console.log(`  ⚠️  missing: ${DIR}`); process.exit(2); }

const read = (f) => {
  let s = fs.readFileSync(path.join(DIR, f), "utf8");
  if (SABOTAGE && f === "billing-daily-check.js") {
    // Re-create the original defect: stop forwarding the flag over the wire.
    s = s.replace(/,\s*\n\s*suppress: process\.env\.RGA_SUPPRESS_CLIENT_EMAIL === "1" \}\)/, " })");
  }
  return s;
};

let files;
try { files = fs.readdirSync(DIR).filter((f) => f.endsWith(".js")); }
catch (e) { console.log(`  ⚠️  could not list functions: ${e.message}`); process.exit(2); }

// A SENDER actually hands a message to Gmail.
const SENDS = /gmail\.googleapis\.com\/gmail\/v1\/users\/me\/messages\/send/;

const senders = [];
for (const f of files) {
  const src = read(f);
  if (SENDS.test(src)) senders.push([f, src]);
}
if (!senders.length) { console.log("  ⚠️  found NO email senders — the probe is wrong."); process.exit(2); }

let fails = 0;

for (const [f, src] of senders) {
  const problems = [];
  if (!src.includes(FLAG)) problems.push(`no ${FLAG} check — a local harness will mail real clients`);
  if (problems.length) { console.log(`  🔴 ${f}: ${problems.join(" · ")}`); fails++; }
  else console.log(`  ✅ ${f.padEnd(26)} suppression check present`);
}

// Callers that reach a sender over HTTP must forward the flag.
const senderNames = senders.map(([f]) => f.replace(/\.js$/, ""));
for (const f of files) {
  const src = read(f);
  if (senders.some(([sf]) => sf === f)) continue;
  for (const sender of senderNames) {
    const callsIt = new RegExp(`\\.netlify/functions/${sender}`).test(src);
    if (!callsIt) continue;
    // Find the fetch body it posts to that sender.
    const idx = src.indexOf(`/.netlify/functions/${sender}`);
    const window = src.slice(idx, idx + 900);
    const forwards = /suppress\s*:/.test(window);
    if (!forwards) {
      console.log(`  🔴 ${f} POSTs to ${sender} but does NOT forward \`suppress\` in the body.`);
      console.log("       Env vars stop at the process edge — the deployed sender never sees them.");
      fails++;
    } else {
      console.log(`  ✅ ${f.padEnd(26)} forwards suppress → ${sender}`);
    }
  }
}

// And the sender must read it from the BODY, not only from process.env.
for (const [f, src] of senders) {
  const readsBody = /\bsuppress\b/.test(src) && /body/.test(src);
  if (!readsBody) {
    console.log(`  🔴 ${f} checks only the environment — an HTTP caller cannot suppress it.`);
    fails++;
  }
}

if (fails) {
  console.log(`\n🔴 ${fails} problem(s). A test harness would mail real clients about states that never happened.`);
  process.exit(1);
}
console.log("\n✅ suppression travels in the request and is honoured at every send.");
process.exit(0);
