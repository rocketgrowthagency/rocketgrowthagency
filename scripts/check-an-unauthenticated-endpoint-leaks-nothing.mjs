#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-an-unauthenticated-endpoint-leaks-nothing.mjs
//
// 🔴 WHY (audit, 2026-09-22). `portal-hint` runs on the LOGIN page, so it cannot require auth — and
// it returned the client's FULL email address to anyone who passed a `slug`. Portal slugs are
// derived from business names, so they are guessable: anyone could walk /portal/?slug=<guess> and
// harvest owner contact addresses one client at a time.
//
// It had survived two prior security passes because both audited whether endpoints were GATED. This
// one is unauthenticated BY DESIGN and correctly so; the defect was not a missing gate, it was what
// an intentionally public endpoint chose to say. "Is it authenticated?" and "what does it disclose
// when it isn't?" are different questions, and only the first was ever asked.
//
// 🔑 WHAT IT ASSERTS: the handful of endpoints that must stay public never return a raw email,
// phone, token or address field. A masked hint is fine — recognising your own inbox needs one
// character, not the whole string.
//
// exit 0 = nothing leaks · exit 1 = a public endpoint returns PII · exit 2 = cannot tell
// → project_security_audit_2026-09-11 · feedback_an_excluded_classification_is_a_claim
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const FN = join(SITE, "netlify", "functions");

// Endpoints that are unauthenticated ON PURPOSE, each with the reason. Anything added here is a
// decision on the record — the same contract as the gate-wiring excuse list.
const PUBLIC_BY_DESIGN = {
  "portal-hint.js": "runs on the login page, before anyone can be authenticated",
  "admin-config.js": "serves the publishable/anon keys the login page needs before auth exists",
};

// Field names that must never appear as a returned KEY on a public endpoint. `_hint`/`_masked`
// suffixes are explicitly allowed: that is the fix, not the defect.
const PII_KEYS = /\b(portal_email|primary_contact_email|owner_email|email_address|phone|phone_number|primary_phone|access_token|refresh_token|magic_link|street_address|address_line)\b/;

if (!existsSync(FN)) {
  console.error("⚠️  INDETERMINATE — netlify/functions not found; cannot judge.");
  process.exit(2);
}

const problems = [];
let checked = 0;

for (const [file, why] of Object.entries(PUBLIC_BY_DESIGN)) {
  const path = join(FN, file);
  if (!existsSync(path)) {
    console.error(`⚠️  INDETERMINATE — ${file} is gone; this gate no longer describes the system.`);
    process.exit(2);
  }
  checked++;
  const src = readFileSync(path, "utf8")
    .replace(/^\s*\/\/.*$/gm, "")        // comments explain the rule; they are not the rule
    .replace(/\/\*[\s\S]*?\*\//g, "");

  // Isolate what the handler actually RETURNS, not what it reads internally. Reading portal_email
  // in order to mask it is correct; returning it is the defect.
  for (const m of src.matchAll(/JSON\.stringify\(\s*\{([\s\S]{0,600}?)\}\s*\)/g)) {
    const body = m[1];
    for (const line of body.split("\n")) {
      const key = line.match(/^\s*([a-z_][a-z0-9_]*)\s*:/i);
      if (!key) continue;
      const name = key[1];
      if (/(_hint|_masked)$/.test(name)) continue;   // the fix, allowed by design
      if (PII_KEYS.test(name)) {
        problems.push(`${file} returns \`${name}\` from an endpoint that is public by design `
          + `(${why}). Return a masked hint instead — one leading character is enough to recognise `
          + `your own address, and a stranger learns nothing they can send to.`);
      }
    }
  }
}

// The masking helper must actually mask. A gate that only checks the KEY name would pass a
// `portal_email_hint` that returned the address unchanged.
{
  const hint = readFileSync(join(FN, "portal-hint.js"), "utf8");
  const fnBody = hint.match(/const maskEmail\s*=\s*\(([\s\S]{0,700}?)\n\s*\};/);
  if (!fnBody) {
    problems.push("portal-hint.js no longer defines maskEmail — the masked hint has no masker.");
  } else {
    let mask;
    try {
      mask = new Function(`const maskEmail = (${fnBody[1]}\n}; return maskEmail;`)();
    } catch (e) {
      problems.push(`portal-hint.js maskEmail could not be executed: ${String(e.message).slice(0, 80)}`);
    }
    if (mask) {
      const out = mask("hello@rocketgrowthagency.com");
      if (typeof out !== "string" || out.includes("hello@")) {
        problems.push(`maskEmail("hello@rocketgrowthagency.com") returned ${JSON.stringify(out)} — `
          + `the local part is still readable.`);
      }
      if (mask("a@b.com") === "a@b.com") {
        problems.push("maskEmail leaves a single-character local part unmasked.");
      }
      for (const junk of ["notanemail", "", null, undefined, "@nolocal.com"]) {
        if (mask(junk) !== null) {
          problems.push(`maskEmail(${JSON.stringify(junk)}) returned ${JSON.stringify(mask(junk))} — `
            + `malformed input must return null, never a passthrough.`);
        }
      }
    }
  }
}

if (!checked) {
  console.error("⚠️  INDETERMINATE — no public endpoints were examined.");
  process.exit(2);
}

if (problems.length) {
  console.error(`🔴 FAIL — ${problems.length} disclosure(s) from an unauthenticated endpoint:\n`);
  for (const p of problems) console.error(`   • ${p}\n`);
  process.exit(1);
}

console.log(`✅ ${checked} public-by-design endpoint(s) disclose no raw PII, and the email mask was `
  + `executed against real and malformed input.`);
process.exit(0);
