#!/usr/bin/env node
/**
 * check-orphan-functions.mjs — no Netlify function is built and then never invoked.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * 2026-09-05: `deep-assess-client.js` — a full multi-source client assessment — was built and called
 * by NOTHING for a day, while onboarding ran a homepage-only audit. Nobody noticed, because an
 * unused function does not fail. It just sits there looking finished.
 *
 * The same sweep then found `gbp-apply-change.js` in the identical state.
 *
 * 🔑 This is the function-level twin of `check-every-gate-is-wired.mjs`: **a capability nobody invokes
 * is indistinguishable from one that does not exist** — except that it cost real time to build and
 * everyone believes it is running.
 *
 * A function counts as invoked if it is referenced anywhere outside its own file: another function,
 * a runner script, a playbook task, a config, or the admin UI.
 *
 * 🔴 MANUAL_ONLY is the escape hatch, and it needs a REASON. "It's a tool I run by hand" is a valid
 * reason; silence is not. Same contract as NOT_PREFLIGHT.
 *
 * Exit 0 = every function is invoked or consciously excused. 1 = an orphan exists.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRAPER = path.resolve(HERE, "..");
const WEB = "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const FUNCS = path.join(WEB, "netlify", "functions");

// Deliberately invoked by hand. Each needs a reason on the record, so an orphan is a DECISION rather
// than an oversight. "It was easier" is never a reason — wire it or delete it.
const MANUAL_ONLY = {
  // (gbp-apply-change came off this list on 2026-09-05: apply-plan-automatable now invokes it, driven
  // by a stored prioritised plan. That was the precondition, and it is met.)
  "apply-plan-automatable.js":
    "the Tier-1 WRITE driver. Deliberately hand-run: it edits a client's PUBLIC listing, so a human " +
    "decides when it fires. It is dry by default and only ever acts on items a stored plan ranked " +
    "automatable. Wire it to a schedule only if Chris asks for unattended writes.",
};

// Files that are infrastructure, not capabilities.
// 🔴 A function can be invoked WITHOUT any code referencing it by name. My first version flagged 11
// at once — and a mass finding almost always means the PROBE is wrong, not the world. Two whole
// categories were invisible to it:
//
//   SCHEDULED — declared in netlify.toml, or exporting an in-file `schedule:` config. Netlify's cron
//               calls these; no code mentions them.
//   EXTERNAL  — webhooks, tracking pixels and form endpoints called by Stripe, a mail client or a
//               browser. By definition nothing in OUR repo references them.
//
// Treating either as an orphan would train everyone to ignore this check.
const EXTERNAL_ENTRY = {
  "stripe-webhook.js": "called by Stripe on payment events",
  "track-open.js": "email open pixel — requested by the recipient's mail client",
  "track-click.js": "email click redirect — requested by the recipient's browser",
  "unsubscribe-one-click.js": "RFC 8058 one-click unsubscribe — called by the mail client",
  "verify-turnstile.js": "called by the public site's form JS on submit",
  "ping-test.js": "manual reachability probe",
  "vertical-benchmark-lookup.js": "read endpoint queried by the admin UI and by hand",
  "vertical-benchmark-build.js": "build endpoint triggered on demand when a vertical needs refreshing",
};

const SKIP = /^(_|\.)|\.test\.js$/;

if (!fs.existsSync(FUNCS)) { console.error(`✗ functions dir not found: ${FUNCS}`); process.exit(2); }

const funcs = fs.readdirSync(FUNCS).filter((f) => f.endsWith(".js") && !SKIP.test(f));

// Search everywhere a call could legitimately originate.
const HAYSTACK_DIRS = [
  path.join(WEB, "netlify", "functions"),
  path.join(WEB, "admin"),
  path.join(WEB, "portal"),
  path.join(WEB, "data"),
  path.join(SCRAPER, "scripts"),
  path.join(SCRAPER, "config"),
  path.join(SCRAPER, "docs"),
];
const corpus = [];
for (const dir of HAYSTACK_DIRS) {
  if (!fs.existsSync(dir)) continue;
  const walk = (d, depth = 0) => {
    if (depth > 3) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      // 🔴 EXCLUDE THIS FILE. It lives in the haystack, and it NAMES every function in MANUAL_ONLY
      // and EXTERNAL_ENTRY — so without this, each allowlisted function matches the checker's own
      // allowlist and reads as "invoked in code". The check would validate itself and never fire.
      // Caught by grepping for a supposedly-invoked function and finding only this file.
      else if (/\.(js|mjs|sh|json|html)$/.test(e.name) && p !== fileURLToPath(import.meta.url)) {
        try { corpus.push({ path: p, text: fs.readFileSync(p, "utf8") }); } catch { /* unreadable */ }
      }
    }
  };
  walk(dir);
}

const orphans = [], excused = [], scheduled = [], external = [];
const toml = fs.existsSync(path.join(WEB, "netlify.toml")) ? fs.readFileSync(path.join(WEB, "netlify.toml"), "utf8") : "";
console.log("── netlify function invocation ──");

for (const f of funcs) {
  const base = f.replace(/\.js$/, "");
  const self = path.join(FUNCS, f);
  const callers = corpus.filter((c) => c.path !== self && c.text.includes(base));
  if (callers.length) continue;

  // Scheduled by Netlify: declared in netlify.toml, or exporting an in-file `schedule:` config.
  const scheduledInToml = new RegExp(`\\[functions\\."${base}"\\][\\s\\S]{0,200}?schedule`).test(toml);
  const scheduledInFile = /export\s+const\s+config\s*=|schedule\s*:\s*["']/.test(fs.readFileSync(self, "utf8"));
  if (scheduledInToml || scheduledInFile) { scheduled.push(base); continue; }
  if (EXTERNAL_ENTRY[f]) { external.push(f); continue; }
  if (MANUAL_ONLY[f]) { excused.push(f); continue; }
  orphans.push(base);
  console.log(`  🔴 ${base} — built, but nothing references it`);
}

for (const f of scheduled) console.log(`  🕐 ${f} — scheduled (Netlify cron)`);
for (const f of external) console.log(`  🌐 ${f.replace(/\.js$/, "")} — external entry: ${EXTERNAL_ENTRY[f]}`);
for (const f of excused) console.log(`  ▫️  ${f.replace(/\.js$/, "")} — manual-only: ${MANUAL_ONLY[f].slice(0, 90)}…`);

// An excuse for a file that no longer exists is stale bookkeeping that hides the next real orphan.
const stale = [...Object.keys(MANUAL_ONLY), ...Object.keys(EXTERNAL_ENTRY)].filter((f) => !fs.existsSync(path.join(FUNCS, f)));
for (const f of stale) { orphans.push(f); console.log(`  🔴 MANUAL_ONLY names ${f}, which does not exist — remove the stale excuse`); }

console.log("");
console.log(`  ${funcs.length} function(s) · ${funcs.length - orphans.length - excused.length - scheduled.length - external.length} invoked in code · ` +
  `${scheduled.length} scheduled · ${external.length} external · ${excused.length} manual-only · ${orphans.length} orphaned`);
if (orphans.length) {
  console.error(`\n🔴 ${orphans.length} orphaned function(s). Wire each one, or add it to MANUAL_ONLY with a reason.`);
  console.error(`   An unused function does not fail — it sits there looking finished while nobody runs it.`);
  process.exit(1);
}
console.log("\n✅ every function is invoked, or excused with a reason");
