#!/usr/bin/env node
// check-every-service-key-function-checks-its-caller.mjs — the service-role auth pass, finished (2026-10-19).
// The service key bypasses every row-level policy, so a function holding it IS the access control. Pending tasks
// (2026-10-06) asked for a proper classification of all of them, not a heuristic: this gate makes the classification
// COMPLETE — every function that reaches the service key (directly, or through a helper that holds it) must show how it
// checks its caller, or be listed as public on purpose with the reason. What a public one may SAY is the sibling gate's
// job (check-an-unauthenticated-endpoint-leaks-nothing).
//   exit 0 = every one is classified · 1 = one reaches the key with no check and no recorded reason · 2 = can't read
import fs from "node:fs";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const FN = `${SITE}/netlify/functions`;
let toml; try { toml = fs.readFileSync(`${SITE}/netlify.toml`, "utf8"); } catch { console.error("⚠️  INDETERMINATE — no netlify.toml"); process.exit(2); }
const files = fs.readdirSync(FN).filter((f) => f.endsWith(".js"));
const src = Object.fromEntries(files.map((f) => [f, fs.readFileSync(`${FN}/${f}`, "utf8").replace(/^\s*\/\/.*$/gm, "")]));
// helpers that hold the key themselves: requiring one = reaching the key
const KEY = /SUPABASE_SERVICE_ROLE_KEY/;
const helpersWithKey = files.filter((f) => f.startsWith("_") && KEY.test(src[f])).map((f) => f.replace(/\.js$/, ""));
const reaches = (s) => KEY.test(s) || helpersWithKey.some((h) => s.includes(`require("./${h}")`) || s.includes(`require('./${h}')`));
// the ways a function checks its caller
const CHECKS = [
  [/require(?:User|Workspace\w*|PortalOwner\w*|InternalSecret|CronOrInternal)\(/, "an _auth helper"],
  [/\/auth\/v1\/user/, "a signed-in session (Supabase auth) + its own ownership query"],
  [/verifySignedReportToken\(|parseClientShareToken\(|verifyWebhook|constructEvent\(|stripe-signature|x-hub-signature|timingSafeEqual/, "a signed token / webhook signature"],
  // 🔴 INBOUND only: SENDING x-internal-secret to another function is not checking the caller (found 10-19 by mutation)
  [/(?:===|!==)\s*process\.env\.(?:INTERNAL_FN_SECRET|FGA_REPORT_INTERNAL_TOKEN|QUO_WEBHOOK_TOKEN)|process\.env\.(?:INTERNAL_FN_SECRET|FGA_REPORT_INTERNAL_TOKEN|QUO_WEBHOOK_TOKEN)\s*(?:===|!==)|token === INTERNAL_TOKEN|const token = process\.env\.FGA_REPORT_INTERNAL_TOKEN;[\s\S]{0,200}?!== token|(?:===|!==)\s*(?:INTERNAL_TOKEN|QUO_TOKEN|EXPECTED|expected|secret)\b/, "an internal secret (checked inbound)"],
  // a webhook secret counts only when it FAILS CLOSED (an unset secret must refuse, not wave everyone through)
  [/if \(!requiredSecret\) return/, "a webhook secret that fails closed"],
  // 11-12: an _auth helper INJECTED as handle()'s default (so a test can pass a fake), awaited on the request before anything else, its refusal
  // returned, and the live handler calling handle(event) with nothing that could replace it (admin-mid-note, portal-leads, 11-11)
  [/async function handle\(event, (?:deps = null, guard = require(?:User|Workspace\w*|PortalOwner\w*)\)[\s\S]{0,400}?const (\w+) = await guard\(event, clientId\); if \(\1\.error\) return \1\.error;|deps = \{ [^}]*\bauth: require(?:User|Workspace\w*|PortalOwner\w*)\b[^}]*\}\)[\s\S]{0,400}?const (\w+) = await deps\.auth\(event, clientId\);\s*if \(\2\.error\) return \2\.error;)[\s\S]*\nexports\.handler = \(event\) => handle\(event\);/, "an _auth helper, injected as handle()'s default and awaited first"],
];
// unauthenticated ON PURPOSE — a decision on the record, each with its reason
const PUBLIC_BY_DESIGN = {
  "portal-hint.js": "runs on the login page before anyone can sign in; returns a MASKED email (sibling gate)",
  "admin-config.js": "serves the publishable/anon keys the login page needs before auth exists",
};
const scheduled = (name) => new RegExp(`\\[functions\\."${name}"\\]\\s*\\n\\s*schedule\\s*=`).test(toml);
const F = [], tally = {};
for (const f of files) {
  if (f.startsWith("_") || !reaches(src[f])) continue;
  const name = f.replace(/\.js$/, "");
  // 11-6 night fixer: a thin endpoint can hand its request to a helper's handle(event, D) with the REAL _auth helpers injected
  // (portal-step3-go-ahead.js → _step3-go-ahead.js). It counts only when it passes Auth.require… AND that handle calls D.require…(event
  // and returns gate.error. A stub in D, or a handle that never calls it, still fails.
  const dm = src[f].match(/const \{ handle \} = require\("\.\/(_[a-z0-9-]+)"\)/), helper = dm && src[`${dm[1]}.js`];
  const hBody = helper && (helper.match(/async function handle\(event, D\) \{[\s\S]*?\n\}/) || [""])[0];
  const delegated = dm && /: Auth\.require(?:User|Workspace\w*|PortalOwner\w*)\b/.test(src[f]) && /await D\.require(?:User|Workspace\w*|PortalOwner\w*)\(event, clientId\)/.test(hBody) && /if \(gate\.error\) return gate\.error;/.test(hBody);
  const how = CHECKS.find(([re]) => re.test(src[f])) || (delegated ? [null, `an _auth helper, called in ${dm[1]}.js's handle`] : null);
  const why = how ? how[1] : PUBLIC_BY_DESIGN[f] ? "public by design" : scheduled(name) ? "scheduled only (Netlify refuses direct HTTP — 403, checked live 10-19)" : null;
  if (!why) F.push(`${f} reaches the service key and checks nobody — gate it, or record why it is public in PUBLIC_BY_DESIGN`);
  else tally[why] = (tally[why] || 0) + 1;
}
// (10-19) flow-execute-heavy-background used to ADD the real secret to whoever called it — now it checks the caller first,
// which the rule above sees; a forwarder without an inbound check fails there.
for (const f of Object.keys(PUBLIC_BY_DESIGN)) if (!files.includes(f)) F.push(`PUBLIC_BY_DESIGN names ${f}, which no longer exists — drop it (a stale excuse hides a new one)`);
if (F.length) { console.error("🔴 a function holds the service key without checking its caller:"); for (const m of F) console.error("   · " + m); process.exit(1); }
console.log(`✅ every service-key function checks its caller — ${Object.entries(tally).map(([k, v]) => `${v} by ${k}`).join(" · ")}`);
