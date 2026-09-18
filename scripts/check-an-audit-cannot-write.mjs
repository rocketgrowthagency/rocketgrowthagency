#!/usr/bin/env node
/**
 * check-an-audit-cannot-write.mjs
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 AN AUDIT THAT CAN WRITE IS NOT AN AUDIT. IT IS A USER.
 *
 * 2026-09-18. A sweep that clicks every control in the signed-in portal — written to catch dead
 * buttons, and which did catch them — clicked the five owner-question tiles. Those tiles AUTOSAVE
 * on tap, by design and correctly. So the audit answered all five of RGA's owner facts with
 * whatever option sat at the index it happened to click, stamped `by: client, via: portal`, and
 * overwrote answers the owner had given two days earlier. Those five feed 41 drafts.
 *
 * The sweep DID have a safety filter. It matched button TEXT — pay, sign, send, delete, approve.
 * It could not possibly have caught these: the labels are ordinary sentences like "Same day for
 * most jobs" and "Licensed & insured".
 *
 * 🔑 A CONTROL'S LABEL TELLS YOU NOTHING ABOUT WHETHER IT WRITES. The only place that is knowable
 * is the network layer, where the request either is or is not a mutation. Every browser-driving
 * script that points at production must refuse mutations there, before they leave the browser.
 *
 * Restoring was only partly possible: `previous` holds legacy free text, not the prior option, and
 * no history table exists. Four of five answers could not be recovered and had to be cleared so the
 * owner is asked again. **The cost of a missing guard here is data nobody can get back.**
 *
 * → feedback_never_stage_a_failure_in_production · feedback_autosave_the_answer_gate_the_effect
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 🔑 fileURLToPath, not URL.pathname — these repo paths contain spaces, which pathname
// percent-encodes into a directory that does not exist.
const SCRIPTS = path.dirname(fileURLToPath(import.meta.url));
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";

let fail = 0;
const bad = (m) => { console.log(`  🔴 ${m}`); fail++; };

console.log("── nothing that audits production is able to change it ──");

// ── 1. Every browser script that signs in to production must install a write blocker ───────────
const files = fs.readdirSync(SCRIPTS).filter((f) => f.endsWith(".mjs"));
let drivers = 0;
for (const f of files) {
  const src = fs.readFileSync(path.join(SCRIPTS, f), "utf8");
  const drivesBrowser = /from ["']playwright["']/.test(src) && /chromium\.launch/.test(src);
  const hitsProduction = /rocketgrowthagency\.com/.test(src);
  // A read-only renderer that never clicks cannot write. Only sweeps that CLICK need the blocker.
  const clicks = /\.click\(\)/.test(src) || /\.click\(/.test(src);
  if (!drivesBrowser || !hitsProduction || !clicks) continue;
  drivers++;

  // 🔴 STRIP ONLY LINE-LEADING COMMENTS. The obvious `/\*…\*/` sweep matched the `/*` inside the
  // route glob `"**/*"` and deleted every line after it — so this gate reported the blocker's own
  // method check and refusals as missing, on a file that had them.
  // → feedback_a_gate_window_measured_in_characters_will_lie
  const code = src.replace(/^\s*\/\*[\s\S]*?\*\//gm, "").replace(/^\s*\/\/.*$/gm, "");
  // The blocker must (a) route requests, (b) branch on method, (c) refuse non-GET to our origins.
  const routes = /\.route\(/.test(code);
  const checksMethod = /\.method\(\)/.test(code);
  const refuses = /route\.(abort|fulfill)\(/.test(code);
  const coversDb = /rest\/v1/.test(code);
  const coversFns = /netlify\/functions/.test(code);

  if (!routes || !checksMethod || !refuses) {
    bad(`${f} signs in to production and clicks, but installs no write blocker `
      + `(route:${routes} method:${checksMethod} refuse:${refuses}). A click on an autosaving control will persist.`);
    continue;
  }
  if (!coversDb) bad(`${f}'s write blocker does not cover /rest/v1 — a click could write straight to the database`);
  if (!coversFns) bad(`${f}'s write blocker does not cover /.netlify/functions — the endpoints that do every portal write`);

  // 🔑 AND IT MUST NOT TRUST THE LABEL. A text-based "destructive" filter is what failed; if a
  // script has one it is fine as a courtesy, but it may never be the ONLY guard.
  const labelFilterOnly = /DESTRUCTIVE\s*=/.test(code) && !routes;
  if (labelFilterOnly) bad(`${f} guards by button TEXT alone — labels do not reveal which controls write`);
}
if (!drivers) {
  console.error("[audit-writes] INDETERMINATE — no production-clicking browser script found to check");
  process.exit(2);
}

// ── 2. The FGA PageSpeed function measures the record's URL, never the caller's ────────────────
// 🔴 Found the same day: it had no gate and ran PageSpeed against whatever `website` the request
// body named, writing that score onto the record it looked up by auditId. Audit IDs travel in the
// report URLs we send leads, so a stranger could have published a score measured on a site that is
// not the lead's — a fabricated number inside a client-facing report.
{
  const p = path.join(SITE, "netlify/functions/fga-pagespeed-background.js");
  if (!fs.existsSync(p)) {
    bad("fga-pagespeed-background.js is gone — the FGA mobile score has no source");
  } else {
    const src = fs.readFileSync(p, "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    if (/body\.website/.test(code) || /const\s*\{[^}]*\bwebsite\b[^}]*\}\s*=\s*body/.test(code)) {
      bad("fga-pagespeed-background reads `website` from the REQUEST BODY — the caller can choose "
        + "which site we measure and whose report we write the score into");
    }
    if (!/fields\?\.\["Website"\]/.test(code)) {
      bad("fga-pagespeed-background no longer reads the website from the Airtable record — "
        + "the score would be attributed to a URL we did not take from the thing we are writing to");
    }
    if (!/INTERNAL_FN_SECRET/.test(code) || !/x-internal-secret/.test(code)) {
      bad("fga-pagespeed-background does not require the internal secret — it spends PageSpeed quota "
        + "on our key for anyone who posts to it");
    }
    // 🔑 A background function answers 202 BEFORE the handler runs, so its gate cannot be observed
    // from outside. That is exactly why it has to be asserted here instead.
    if (!/statusCode: 401/.test(code)) {
      bad("fga-pagespeed-background has no 401 path — nothing refuses an unauthenticated invocation");
    }
  }
}

console.log(fail
  ? `\n🔴 ${fail} way(s) an audit or a stranger could write.`
  : `\n✅ ${drivers} production-clicking script(s) refuse mutations at the network layer; the FGA score measures the record's own URL.`);
process.exit(fail ? 1 : 0);
