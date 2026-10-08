#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// THE GOOGLE BUSINESS PROFILE v4 PARENT IS BUILT IN ONE PLACE
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴🔴🔴 THE DEFECT THIS EXISTS FOR (2026-10-08). The v4 parent is `accounts/*/locations/*`, and we
// store the two halves in separate columns. `v2-gbp-profile` built the URL from the LOCATION ALONE.
// Google answers an error, its `fetchJson` returns null on any non-ok, and every caller does
// `|| {}` — so it reported **0 photos, 0 posts and no reviews for every client**, silently, as if it
// had measured them. Nothing was red. It surfaced only because step 31 claimed "0 of 20 photos" for
// a profile that has one.
//
// 🔑 FIVE OTHER CALL SITES HAD IT RIGHT. That is what makes it a class, not a typo — and why the fix
// is one producer, `_gbp-parent.js`, rather than a sixth correct copy.
// → feedback_fix_the_class_not_the_instance · feedback_an_absence_must_never_be_readable_as_a_value
//
// Exit 0 healthy · 1 a call site assembles its own parent · 2 INDETERMINATE

import fs from "node:fs";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const fails = [];
const F = (m) => fails.push(m);

// 🔴 line comments FIRST, then blocks → feedback_a_comment_stripper_in_the_wrong_order_deletes_code
const strip = (src) => src.split("\n").map((l) => l.replace(/^\s*\/\/.*$/, "").replace(/\s\/\/\s.*$/, "")).join("\n")
  .replace(/\/\*[\s\S]*?\*\//g, "");

// ═══ 1 — THE PRODUCER EXISTS AND IS CORRECT ══════════════════════════════════════════════════
const modPath = `${SITE}/netlify/functions/_gbp-parent.js`;
if (!fs.existsSync(modPath)) {
  console.error("⚠️  INDETERMINATE — netlify/functions/_gbp-parent.js is gone; re-read how the parent is built now.");
  process.exit(2);
}
let gbpParent;
try { ({ gbpParent } = createRequire(import.meta.url)(modPath)); }
catch (e) { console.error(`⚠️  INDETERMINATE — _gbp-parent.js does not load: ${e.message}`); process.exit(2); }

for (const [input, want, why] of [
  [{ gbp_account_id: "accounts/1", gbp_location_id: "locations/2" }, "accounts/1/locations/2", "the two halves join"],
  [{ gbp_location_id: "accounts/1/locations/2" }, "accounts/1/locations/2", "a location that already carries its account is left alone"],
  // 🔴 THE HEART OF IT: a bare location must NOT become a URL. Returning it would rebuild the bug.
  [{ gbp_location_id: "locations/2" }, null, "a bare location is NOT a parent"],
  [{ gbp_account_id: "accounts/1" }, null, "an account alone is not a parent"],
  [{}, null, "nothing in, nothing out"],
]) {
  const got = gbpParent(input);
  if (got !== want) F(`gbpParent(${JSON.stringify(input)}) returned ${JSON.stringify(got)}, expected ${JSON.stringify(want)} — ${why}`);
}

// ═══ 2 — AND NO FUNCTION ASSEMBLES ITS OWN ═══════════════════════════════════════════════════
const dir = `${SITE}/netlify/functions`;
let files;
try { files = fs.readdirSync(dir).filter((f) => f.endsWith(".js")); }
catch { console.error("⚠️  INDETERMINATE — cannot list netlify/functions"); process.exit(2); }

let callSites = 0, usesProducer = 0;
for (const f of files) {
  if (f === "_gbp-parent.js") continue;
  const src = strip(fs.readFileSync(`${dir}/${f}`, "utf8"));
  // 🔑 CAPTURE THE WHOLE PARENT, NOT THE FIRST `${…}`. The first version stopped at the first
  // closing brace, so `v4/${accountId}/${locationId}/reviews` looked like a lone `${accountId}` and
  // it accused a correct call site. A regex that reads less than the thing it judges is a regex that
  // judges something else. → feedback_a_literal_grep_misses_computed_writes
  const urls = src.match(/mybusiness\.googleapis\.com\/v4\/[^`'"]+/g) || [];
  if (!urls.length) continue;
  callSites += urls.length;
  const viaProducer = /gbpParent\s*\(/.test(src);
  for (const u of urls) {
    // everything between `v4/` and the resource segment is the parent
    const parent = u.slice(u.indexOf("/v4/") + 4).split(/\/(?=[a-zA-Z]+(?:\?|$|\/))/)[0];
    // 🔑 A NAME IS NOT AN ASSIGNMENT. `v2-fetch-reviews` and `v2-push-gbp-content` both pass a
    // variable called `locationPath` — and both ASSIGN it `${account}/${location}`, correctly.
    // Judging the identifier accused two correct files. Resolve what it holds.
    // → feedback_a_symbol_name_is_a_claim_about_the_codebase
    const resolve = (expr) => {
      const id = (/^\s*\$\{\s*([A-Za-z_$][\w$]*)\s*\}\s*$/.exec(expr) || [])[1];
      if (!id) return expr;
      const asg = new RegExp(`(?:const|let|var)\\s+${id}\\s*=\\s*([^;\\n]+)`).exec(src);
      return asg ? asg[1] : expr;
    };
    const resolved = resolve(parent);
    const hasAccount = /account/i.test(resolved);
    const hasLocation = /location/i.test(resolved);
    const built = /gbpParent/.test(parent) || /gbpParent/.test(src.slice(Math.max(0, src.indexOf(u) - 400), src.indexOf(u)));
    if (built || viaProducer) { usesProducer++; continue; }
    // 🔴 THE BUG, EXACTLY: a location in the parent position with no account beside it.
    if (hasLocation && !hasAccount) {
      F(`${f} builds the v4 parent from the location alone (\`${resolved.trim().slice(0, 70)}\`) — Google answers an `
        + "error and the caller reads it as an empty profile. Use gbpParent().");
    }
  }
}
if (!callSites) {
  console.error("⚠️  INDETERMINATE — no v4 call sites found at all; this gate guards nothing until re-read.");
  process.exit(2);
}

console.log(`  ${callSites} v4 call site(s) · ${usesProducer} built by gbpParent()`);

if (fails.length) {
  console.error("🔴 a Google Business Profile read can silently return zeros:");
  for (const f of fails) console.error("   · " + f);
  process.exit(1);
}
console.log("✅ the v4 parent is built in one place, and a bare location never becomes a URL");
