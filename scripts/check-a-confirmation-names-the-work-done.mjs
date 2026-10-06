#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — EVERY STEP'S CONFIRMATION DESCRIBES THE WORK THAT STEP ACTUALLY DID
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Chris, on the banner after running the GRID step (2026-10-06):
 *   *"why does it say 5 keywords drafted? isn't this step 25?"*
 *
 *     Step 26 · Run the geo-grid map-rank baseline
 *     Partly done — 5 keywords drafted.
 *
 * Right title, wrong sentence. The grid had just started scanning the five LOCKED keywords and
 * stored them as `outcome_data.keywords`; `bannerSentence` counted them and said "drafted", because
 * the verb was decided by the FIELD NAME rather than by the work.
 *
 * Audited across every executor feeding this producer, TWO of six sentences were wrong for that one
 * reason — the grid's started scan, and the monthly rank tracker ("2 keywords drafted" for a step
 * that tracks them). The function's own comment already said *"the verb belongs to the work; a scan
 * is not a draft"*, and the code decided it from the field name anyway.
 *
 * 🔑 THE RUNNER NAMES ITS OWN VERB (`outcome_data.action`), and `started: true` is its own shape —
 * nothing produced yet, so nothing may be reported as produced.
 * → feedback_a_message_needs_a_shape · feedback_a_client_message_must_agree_with_itself
 *
 * Runs the REAL bannerSentence over every outcome_data shape the executors can store.
 * Exit 0 pass · 1 a confirmation misdescribes its step · 2 could not run.
 */
import fs from "node:fs";
import vm from "node:vm";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
let src, flow;
try {
  src = fs.readFileSync(`${SITE}/admin/admin.js`, "utf8");
  flow = fs.readFileSync(`${SITE}/netlify/functions/flow-execute.js`, "utf8");
} catch { console.error("⚠️  INDETERMINATE — cannot read the sources"); process.exit(2); }

function lift(name) {
  const m = src.match(new RegExp(`^function ${name}\\s*\\(`, "m"));
  if (!m) return "";
  const lp = src.indexOf("(", m.index);
  let pd = 0, ap = -1;
  for (let i = lp; i < src.length; i++) {
    if (src[i] === "(") pd++;
    else if (src[i] === ")") { pd--; if (!pd) { ap = i + 1; break; } }
  }
  const o = src.indexOf("{", ap);
  let d = 0;
  for (let i = o; i < src.length; i++) {
    if (src[i] === "{") d++;
    else if (src[i] === "}") { d--; if (!d) return src.slice(m.index, i + 1); }
  }
  return "";
}
const fn = lift("bannerSentence");
if (!fn) { console.error("⚠️  INDETERMINATE — bannerSentence did not lift."); process.exit(2); }
const ctx = vm.createContext({});
try { vm.runInContext(`${lift("obPlaceLabel")}\n${fn}\nglobalThis.B = bannerSentence;`, ctx); }
catch (e) { console.error(`⚠️  INDETERMINATE — could not evaluate bannerSentence: ${e.message}`); process.exit(2); }
const B = (od, summary = "A sentence.") => ctx.B({ outcome_data: od, summary });

const fail = [];
const ok = (c, m) => { if (!c) fail.push(m); };

// ── THE SHAPES THE EXECUTORS ACTUALLY STORE ─────────────────────────────────────────────────────
const plan = B({ demand: [1, 2, 3, 4, 5], locations: [1, 2, 3], geo: { canonicalName: "California,United States" } });
ok(/5 keywords and 3 locations drafted/.test(plan), `the keyword plan reads ${JSON.stringify(plan)}`);
ok(!/California,United/.test(plan),
  `the confirmation prints a raw canonical name (${JSON.stringify(plan)}) — "California,United States" `
  + "with no space reads as a typo");

// 🔴 THE ONE CHRIS CAUGHT.
const started = B({ keywords: ["a", "b", "c", "d", "e"], started: true });
ok(!/drafted/.test(started),
  `a STARTED scan is announced as a draft: ${JSON.stringify(started)} — nothing has been produced yet, `
  + "and the step that drafts keywords is a different step entirely");
ok(/start/i.test(started) && /again/i.test(started),
  `a started scan should say it started and what to do next; got ${JSON.stringify(started)}`);

ok(/81-point grid scanned/.test(B({ keyword: "a", points: 81 })), "a recorded grid no longer reads as scanned");
ok(/3 competitors captured/.test(B({ competitors: [1, 2, 3] })), "the competitor snapshot lost its verb");
ok(/2 of 4 complete/.test(B({ complete: 2, total: 4 })), "a progress count lost its shape");

// 🔑 THE RUNNER'S OWN VERB WINS.
const tracked = B({ action: "tracked", keywords: ["a", "b"] });
ok(/2 keywords tracked/.test(tracked),
  `a runner that names its verb is overridden by the field-name guess: ${JSON.stringify(tracked)}`);

// ── AND THE RUNNER THAT NEEDED IT SETS IT ───────────────────────────────────────────────────────
{
  const f = flow.replace(/^[ \t]*\/\/.*$/gm, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
  ok(/outcome_data: \{ action: "tracked", keywords: byKw\.size/.test(f),
    "the monthly rank tracker does not name its verb, so its confirmation says it DRAFTED the keywords "
    + "it only measured");
  ok(/started: true/.test(f), "no runner reports a started-but-unfinished scan, so the started shape is dead");
}

// ── AND MARKING A STEP DONE PUTS THE READER IN FRONT OF THE NEXT ONE ────────────────────────────
{
  const a = src.replace(/^[ \t]*\/\/.*$/gm, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
  const mi = a.indexOf("async function markOnboardingStep");
  const body = mi >= 0 ? a.slice(mi, mi + 4000) : "";
  ok(/scrollIntoView/.test(body),
    "the banner says \"the next step is unlocked\" and leaves the page on the step just finished — in a "
    + "list of 61 rows the next one is usually below the fold");
  ok(/if \(!isReset\)/.test(body),
    "reopening a step also yanks the page elsewhere — the reader just chose to work on THAT step");
}

if (fail.length) {
  console.error("🔴 a confirmation misdescribes the work its step did:");
  for (const f of fail) console.error(`   · ${f}`);
  process.exit(1);
}
console.log("✅ all six executor shapes produce a sentence that matches the work: a started scan says it "
  + "started, a tracked keyword is not drafted, a runner's own verb wins, and marking a step done scrolls "
  + "to the next actionable one");
