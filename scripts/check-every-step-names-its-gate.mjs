#!/usr/bin/env node
// check-every-step-names-its-gate.mjs — EVERY STEP HAS A SCHEDULED GATE AIMED AT IT (checkers build 11-11; master map approved by Chris:
// "every step with no checker gets one").
//
// GUARDS: no step of the product can regress with no automated check that names it. On 11-11 the checkers inventory found 13 steps no
// scheduled gate named (the ten end-of-service lines, admin 14 AI readiness, admin 30 the fix plan, Monthly 15 links and press) and
// two named by a single gate with no suite (admin 12 the on-page audit, Monthly 17 the keyword overlap check).
// HOLDS: every step id (website data/playbooks/playbooks.json Month 1 + Month 2+, the end-of-service lines in
// netlify/functions/_closing-list.js as offboarding.<key>, and the stage + managed ids in reports/master-audit/steps.json) appears,
// whole, in the source of at least one gate that a scheduled runner runs (daily-health-check.sh, overnight-pipeline.sh,
// nightly-full-check.sh, rehearse-night-run.sh, daily-deliverability-guard.sh, drip-content.sh). This gate does not count itself.
// THIN (named by one gate with no mutation suite and no self-test) is printed, not failed: the ratchet in check-every-gate-is-wired
// owns suites.
// Reads the runners and gates from SCRAPER_COPY_DIR when set and the website from APPROVAL_ARCHIVE_SITE_DIR, so its suite can unwire
// a gate, unname a step or add a step.
// Exit 0 = every step has a gate · 1 = a step has none · 2 = INDETERMINATE (no steps parsed).
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REAL = path.dirname(HERE);
const SCR = process.env.SCRAPER_COPY_DIR || REAL;
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const REAL_SITE = "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SELF = path.basename(fileURLToPath(import.meta.url));
const idk = (m) => { console.error(`⚠️  INDETERMINATE — ${m}`); process.exit(2); };
const scr = (rel) => { for (const b of [SCR, REAL]) { try { return fs.readFileSync(path.join(b, rel), "utf8"); } catch { /* next */ } } return null; };

// ── the steps ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
let PB;
try { PB = JSON.parse(fs.readFileSync(path.join(SITE, "data/playbooks/playbooks.json"), "utf8")); } catch (e) { idk(`playbooks.json: ${e.message}`); }
const ids = new Map();   // id → where it came from
for (const part of ["month1", "month2plus"]) for (const s of PB[part] || []) if (s && typeof s.id === "string") ids.set(s.id, `playbook ${part}`);
if (ids.size < 50) idk(`only ${ids.size} playbook steps parsed`);
try {
  const CL = createRequire(path.join(SITE, "netlify/functions/x.js"))("./_closing-list.js");
  const keys = (CL.closingState({ audit_log: [{ event: "cancel_notice", notice_on: "2026-11-02", ends_on: "2026-12-02" }] }, { today: "2026-11-10" }).items || []).map((i) => i.key);
  if (!keys.length) idk("the closing list has no lines");
  for (const k of keys) ids.set(`offboarding.${k}`, "end of service (_closing-list.js)");
} catch (e) { idk(`the closing list won't load: ${e.message}`); }
let MAP = null;
for (const b of [SITE, REAL_SITE]) { try { MAP = JSON.parse(fs.readFileSync(path.join(b, "reports/master-audit/steps.json"), "utf8")); break; } catch { /* next */ } }
if (!Array.isArray(MAP)) idk("reports/master-audit/steps.json is missing: the stage and managed ids can't be read");
for (const r of MAP) if (r && typeof r.id === "string" && !ids.has(r.id) && !/^offboarding\./.test(r.id)) ids.set(r.id, "the master map (steps.json)");

// ── the scheduled gates ────────────────────────────────────────────────────────────────────────────────────────────────────
const RUNNERS = ["daily-health-check.sh", "overnight-pipeline.sh", "nightly-full-check.sh", "rehearse-night-run.sh", "daily-deliverability-guard.sh", "drip-content.sh"];
const runnerCode = RUNNERS.map((r) => (scr(`scripts/${r}`) || "").split("\n").filter((l) => !/^\s*#/.test(l)).join("\n")).join("\n");
if (runnerCode.length < 10000) idk("the runners could not be read");
const gates = fs.readdirSync(path.join(REAL, "scripts")).filter((f) => /^check-[a-z0-9-]+\.mjs$/.test(f) && f !== SELF && runnerCode.includes(f));
const text = Object.fromEntries(gates.map((g) => [g, scr(`scripts/${g}`) || ""]));
const suites = new Set((() => { try { return fs.readdirSync(path.join(REAL, "scripts/mutations")).map((f) => f.replace(/\.json$/, ".mjs")); } catch { return []; } })());
const wired = scr("scripts/check-every-gate-is-wired.mjs") || "";
const selfProving = (g) => new RegExp(`"${g.replace(/\./g, "\\.")}":\\s*\\n?\\s*"`).test(wired.slice(wired.indexOf("const SELF_PROVING")));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const none = [], thin = [];
for (const [id, from] of ids) {
  const re = new RegExp(`${esc(id)}(?![a-z0-9_])`);
  const by = gates.filter((g) => re.test(text[g]));
  if (!by.length) none.push(`${id} (${from})`);
  else if (by.length === 1 && !suites.has(by[0]) && !selfProving(by[0])) thin.push(`${id}: only ${by[0]}, which has no mutation suite`);
}
if (thin.length) console.log(`ℹ️  ${thin.length} step(s) named by one gate with no suite:\n${thin.map((x) => `   · ${x}`).join("\n")}`);
if (none.length) {
  console.error(`🔴 ${none.length} step(s) have no scheduled gate naming them, so a regression there reaches no one:\n${none.map((x) => `   · ${x}`).join("\n")}`);
  console.error("   Name the id in a gate that exercises it (and wire that gate into a runner), or add a small targeted gate.");
  process.exit(1);
}
console.log(`✅ every step has a scheduled gate: ${ids.size} steps, each named by at least one of ${gates.length} scheduled gates`);
