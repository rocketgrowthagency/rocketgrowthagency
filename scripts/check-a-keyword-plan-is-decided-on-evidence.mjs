#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — THE PLAN'S FIVE SLOTS GO TO FIVE DIFFERENT SEARCHERS, AND AT LEAST ONE CARRIES A NUMBER
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Chris, reading his own locked plan on 2026-10-05:
 *   *"1 of 5 carry measurable demand — strongest is 'seo company near me' at 2,400 searches/mo.
 *     you sure that we made this the best?"*
 *
 * He had found two faults at once, and they compounded:
 *
 * 1 · THE DEDUPE SPLIT ONE SEARCHER INTO TWO. Measured by running the real `coreOf` over his plan, it
 *     reported SIX distinct intents from six terms:
 *         "local seo services culver city"      → core "local provider seo"
 *         "local seo optimization culver city"  → core "local seo"
 *     The same person, same town, same job — kept apart by the word "services". The 10-02 fix had
 *     mapped agency/company/services to one `provider` class on the rule "dedupe on what the searcher
 *     WANTS, not which noun they reached for", and then left the noun in the key.
 *
 * 2 · FOUR OF FIVE TERMS RESTED ON AUTOCOMPLETE ALONE. Fixing the floor misreading was right — an
 *     unsized term is not a dead term — but a plan with one measured term has no baseline to report
 *     against and no way to tell a client what the work is worth.
 *
 * 🔑 Both selectors are lifted out of flow-execute.js and RUN. Nothing here re-implements the rule,
 * and the headline case is Chris's own stored plan.
 * → feedback_fix_the_class_not_the_instance · project_the_keyword_plan_audit
 *
 * Exit 0 pass · 1 the plan can waste slots or ship unreportable · 2 could not run.
 */
import fs from "node:fs";
import vm from "node:vm";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
let src;
try { src = fs.readFileSync(`${SITE}/netlify/functions/flow-execute.js`, "utf8"); }
catch { console.error("⚠️  INDETERMINATE — cannot read flow-execute.js"); process.exit(2); }

/** Brace-match a top-level `function NAME(…)`. */
function liftFn(name) {
  const m = src.match(new RegExp("^function " + name + "\\s*\\(", "m"));
  if (!m) return "";
  const lp = src.indexOf("(", m.index);
  let pd = 0, ap = -1;
  for (let i = lp; i < src.length; i++) {
    if (src[i] === "(") pd++;
    else if (src[i] === ")") { pd--; if (!pd) { ap = i + 1; break; } }
  }
  if (ap < 0) return "";
  const o = src.indexOf("{", ap);
  let d = 0;
  for (let i = o; i < src.length; i++) {
    if (src[i] === "{") d++;
    else if (src[i] === "}") { d--; if (!d) return src.slice(m.index, i + 1); }
  }
  return "";
}
/** Brace-match an indented `const NAME = (…) => { … };` out of the handler. */
function liftArrow(name) {
  const m = src.match(new RegExp("^\\s*const " + name + " = \\(", "m"));
  if (!m) return "";
  const o = src.indexOf("{", src.indexOf("=>", m.index));
  let d = 0;
  for (let i = o; i < src.length; i++) {
    if (src[i] === "{") d++;
    else if (src[i] === "}") { d--; if (!d) return src.slice(m.index, i + 1).trim() + ";"; }
  }
  return "";
}

const fail = [];
const ok = (c, msg) => { if (!c) fail.push(msg); };

// ═══ PART 1 · THE DEDUPE — ONE SEARCHER IS ONE SLOT ════════════════════════════════════════════
{
  const SYN = (src.match(/const SYN = \[[\s\S]*?\]\];/) || [""])[0];
  const coreOf = liftArrow("coreOf");
  if (!SYN || !coreOf) {
    console.error("⚠️  INDETERMINATE — cannot lift SYN / coreOf from flow-execute.js; re-pin this gate.");
    process.exit(2);
  }
  const ctx = vm.createContext({});
  try {
    vm.runInContext(`const NEAR = /\\b(near me|nearby|near by)\\b/g;
const geoTokens = ["culver", "city", "california", "united", "states"];
${SYN}
${coreOf}
globalThis.C = coreOf;`, ctx);
  } catch (e) {
    console.error(`⚠️  INDETERMINATE — could not evaluate the lifted dedupe: ${e.message}`);
    process.exit(2);
  }
  const core = (t) => ctx.C(t);
  const same = (a, b) => core(a) === core(b);

  // Chris's own plan: three slots went to one searcher.
  ok(same("local seo services culver city", "local seo optimization culver city"),
    `"local seo services culver city" (core "${core("local seo services culver city")}") and `
    + `"local seo optimization culver city" (core "${core("local seo optimization culver city")}") are treated `
    + "as different intents — that is the same person in the same town wanting the same work, and it cost "
    + "Chris's plan three of its five slots");
  ok(same("seo agency culver city", "seo company culver city")
    && same("seo agency culver city", "seo consultant culver city")
    && same("seo agency culver city", "seo specialists culver city"),
    "agency / company / consultant / specialists in the same town are not collapsed — the provider noun "
    + "is not what the searcher is choosing between");
  // 🔴 AND IT MUST NOT OVER-MERGE. Different places and different jobs stay different slots.
  ok(!same("la seo company", "local seo agency los angeles"),
    `"la seo company" (core "${core("la seo company")}") and "local seo agency los angeles" `
    + `(core "${core("local seo agency los angeles")}") were merged — a metro term and a city term are `
    + "different targets, and over-merging empties the plan as surely as under-merging wastes it");
  ok(!same("google business profile optimization culver city", "local seo services culver city"),
    "a GBP-specific term and a general local SEO term are merged — they are different jobs on different surfaces");
  ok(!same("emergency plumber culver city", "water heater repair culver city"),
    "two different services in one town are merged — this would collapse a plumber's whole plan into one slot");
}

// ═══ PART 2 · THE MEASURABLE ANCHOR ════════════════════════════════════════════════════════════
{
  const amin = src.match(/^const ANCHOR_MIN = \d+;$/m);
  const fn = liftFn("chooseAnchorSwap");
  if (!amin || !fn) {
    console.error("⚠️  INDETERMINATE — cannot lift ANCHOR_MIN / chooseAnchorSwap; re-pin this gate.");
    process.exit(2);
  }
  const ctx = vm.createContext({});
  try { vm.runInContext(`${amin[0]}\n${fn}\nglobalThis.A = chooseAnchorSwap; globalThis.MIN = ANCHOR_MIN;`, ctx); }
  catch (e) { console.error(`⚠️  INDETERMINATE — could not evaluate the lifted selector: ${e.message}`); process.exit(2); }
  const A = ctx.A;
  ok(ctx.MIN >= 2, `ANCHOR_MIN is ${ctx.MIN} — a plan needs at least two terms with reportable volume for the `
    + "monthly report to have anything to compare");

  const atFloor = (v) => v === null || v === undefined || v <= 10;
  const GEO = /culver city|los angeles|\bla\b|palms|mar vista|austin|round rock/i;
  const NEARME = /\bnear me\b/i;
  const isLocal = (t) => GEO.test(t) || NEARME.test(t);
  const mk = (term, volume, sugg) => ({ term, volume, sugg });
  const ev = (x) => (x.sugg === null || x.sugg === undefined ? -1 : x.sugg);
  const call = (keep, pool, o = {}) => A({ keep, pool, atFloor, evidenceOf: ev, isLocal,
    sameCore: o.sameCore || (() => false), fits: o.fits || (() => true) });

  // Chris's stored 6:50 PM plan, verbatim.
  const chris = () => [mk("local seo services culver city", null, 1),
    mk("google business profile optimization culver city", null, 4),
    mk("local seo agency los angeles", 10, 6),
    mk("seo company near me", 2400, null),
    mk("local seo optimization culver city", null, 2)];
  const pool = [mk("la seo company", 1300), mk("seo agency los angeles", 880), mk("best seo companies", 390)];

  const r = call(chris(), pool);
  ok(!!r, "Chris's own plan — one measured term out of five — is left as it is. It has no baseline to "
    + "report against, which is the state he rejected");
  ok(r && r.victim.term === "local seo services culver city",
    `the anchor swap gives up "${r && r.victim.term}" — it must give up the WEAKEST evidence, which here is `
    + "the term autocomplete suggested only once");
  ok(r && r.pick.term === "la seo company",
    `the anchor buys "${r && r.pick.term}" instead of the highest-volume fitting candidate`);

  // An UNCHECKED term is the weakest evidence of all: it survived on a conservative default, not a finding.
  {
    const k = chris(); k[4] = { ...k[4], sugg: null };
    const r2 = call(k, pool);
    ok(r2 && r2.victim.term === "local seo optimization culver city",
      "a term whose demand could not be checked AT ALL is not given up first — it is the only term in the "
      + "plan with no positive evidence of any kind behind it");
  }
  // It must not fire when it is not needed, and must never cost the plan its local shape.
  {
    const k = chris(); k[2] = { ...k[2], volume: 880 };
    ok(call(k, pool) === null, "the anchor swaps even though the plan already has two measured terms");
  }
  ok(call([mk("plumber culver city", null, 3), mk("emergency plumber culver city", null, 2), mk("drain cleaning", 2400, null)], pool) === null,
    "the anchor spends a local term when only two remain — a local plan whose terms are not local is not a plan");
  ok(call(chris(), [mk("seo", null), mk("x", 10)]) === null,
    "the anchor 'buys' a candidate that is itself at or below the floor — that is not an anchor");
  ok(call(chris(), pool, { fits: () => false }) === null,
    "the anchor takes a candidate the business does not sell — volume over fit is the opposite of this step's job");
  ok(call(chris(), pool, { sameCore: () => true }) === null,
    "the anchor takes a candidate that duplicates an intent already in the plan");
  ok(call([mk("a", null, 1), mk("b", null, 1)], pool) === null,
    "a short plan is rewritten — with fewer than three terms every slot is load-bearing");
  ok(call([mk("a", 100, null), mk("b", 200, null), mk("c", 300, null)], pool) === null,
    "the anchor fires over a plan with nothing at the floor");
  {
    const dup = [mk("seo company near me", 2400), ...pool];
    const r3 = call(chris(), dup);
    ok(r3 && r3.pick.term === "la seo company",
      "the anchor 'buys' a term the plan already holds");
  }
}

// ═══ PART 3 · THE STEP WIRES BOTH, AND CLEANS UP AFTER ITSELF ═══════════════════════════════════
{
  const code = src.replace(/^[ \t]*\/\/.*$/gm, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
  // 🔴 A LIVE CALL, NOT A MENTION. `const chosen = null && chooseAnchorSwap({…})` satisfied a bare
  // `/chooseAnchorSwap\(\{/` and the gate passed over a selector that could never run.
  // → feedback_a_literal_grep_misses_computed_writes
  ok(/=\s*chooseAnchorSwap\(\{/.test(code),
    "nothing CALLS chooseAnchorSwap as a live expression — the selector exists and the plan never consults "
    + "its answer");

  // ═════════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 SCOPE THE CLEAN-UP ASSERTIONS TO THE ANCHOR BLOCK. Checked against the whole file, deleting
  // the anchor's `floorKeptBy.delete(…)` still passed — the map-pack swap further down has one of its
  // own, and a file-wide search cannot tell two call sites apart. A gate that cannot say WHERE a line
  // is cannot notice it moving. → feedback_a_gate_window_measured_in_characters_will_lie
  // ═════════════════════════════════════════════════════════════════════════════════════════════
  const ai = code.indexOf("chooseAnchorSwap({");
  let block = "";
  if (ai >= 0) {
    // brace-match from the enclosing `if (chosen) {`
    const ci = code.indexOf("if (chosen)", ai);
    const o = code.indexOf("{", ci);
    if (ci >= 0 && o >= 0) {
      let d = 0;
      for (let i = o; i < code.length; i++) {
        if (code[i] === "{") d++;
        else if (code[i] === "}") { d--; if (!d) { block = code.slice(o, i + 1); break; } }
      }
    }
  }
  if (!block || block.length < 200) {
    console.error("⚠️  INDETERMINATE — cannot isolate the anchor swap's block in flow-execute.js; re-pin this gate.");
    process.exit(2);
  }
  ok(/floorKeptBy\.delete\(/.test(block),
    "the anchor swap does not remove the dropped term from floorKeptBy — the volume chip and the floor "
    + "note would go on describing a keyword that is no longer in the plan");
  // 🔴 THE SPLICE AND THE LOOKUP THAT FEEDS IT. Pinning only `floorKept.splice(` passed a mutation
  // that changed `floorKept.findIndex(…)` to `[].findIndex(…)`: the index was then always -1, the
  // splice never ran, and the assertion never noticed because the splice line was untouched.
  // 🔑 A REMOVAL IS TWO STATEMENTS, AND A GATE ON ONE OF THEM GUARDS NEITHER.
  ok(/floorKept\.(?:splice|findIndex)\(/.test(block) && /floorKept(?:Out)?\.splice\(/.test(block)
     && /floorKept(?:Out)?\.findIndex\(/.test(block),
    "the anchor swap does not look the dropped term up in the floor-kept list AND remove it — the note "
    + "would count a term the plan dropped");
  ok(/seenCore\.delete\(/.test(block),
    "the anchor swap does not release the dropped term's intent from seenCore — its replacement's slot "
    + "stays blocked");
  ok(/swaps\.push\(/.test(block),
    "the anchor swap is not disclosed as a swap — the plan silently differs from what the model proposed");
  ok(/take\(/.test(block),
    "the anchor swap never adds the replacement to the plan — it drops a term and puts nothing back");
  ok(/anchor_note:/.test(code),
    "the anchor decision is not written to outcome_data, so the record cannot say why the plan looks as it does");
  ok(/s2\.replace\(\/\\bprovider\\b\/g/.test(code) || /replace\(\/\\bprovider\\b\/g,\s*" "\)/.test(code),
    "coreOf no longer strips the provider token after mapping the synonyms — mapping agency/company/services "
    + "to one word and then keeping that word in the key is the bug this fixed");
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴🔴🔴 RUN AGAIN WAS REWRITING THE LOCK (2026-10-06). This step's own subtitle is "Sets this month's
// targets — every other task points at these." Measured across two runs ninety minutes apart, with
// nothing about the business changed, ONE term of five survived:
//
//   08:51  seo company near me · local seo services · google business profile optimization ·
//          local seo agency Culver City CA · seo company Los Angeles
//   10:53  local seo services near me · google business profile optimization ·
//          local seo agency culver city · seo company culver city ca ·
//          search engine optimization agencies
//
// The model drafted from scratch every time because it was never shown the plan already locked.
// 🔑 A SECOND RUN IS A RE-MEASUREMENT, NOT A SECOND OPINION.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
{
  const flow = src.replace(/^[ \t]*\/\/.*$/gm, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
  ok(/readLockedPlan\(recs0\)/.test(flow) || /const locked = readLockedPlan\(/.test(flow),
    "the step never reads the plan this client already has locked — every run drafts from a blank page, "
    + "so pressing Run again silently replaces this month's targets");
  ok(/lockedNote/.test(flow) && /\$\{lockedNote\}/.test(flow),
    "the locked plan is read and never reaches the model's context — reading it changes nothing");
  // 🔴 ANCHOR ON THE ASSIGNMENT, NOT THE DECLARATION. `indexOf("lockedNote = ")` found
  // `let lockedNote = "";` and the 900-char window then covered the guard above the seed — so
  // deleting the sub-locations line from the seed still matched `locked.locations` in the `if`.
  // → feedback_a_gate_window_measured_in_characters_will_lie
  const li = flow.indexOf("lockedNote = `");
  const note = li >= 0 ? flow.slice(li, li + 1100) : "";
  ok(li >= 0, "cannot find where the locked-plan seed is built; re-pin this gate");
  ok(/locked\.keywords/.test(note) && /locked\.locations/.test(note),
    "the seed names only half the lock — keywords AND sub-locations are both this step's output");
  // 🔴 BOTH SIDES. A bare search for "keep" passed a mutation that replaced the keep instruction with
  // "Rewrite freely." — because a LATER sentence still said "the ones you keep". One word appearing
  // somewhere is not an instruction. → feedback_a_literal_grep_misses_computed_writes
  ok(/\b(keep|retain)\b/i.test(note),
    "the seed hands the model the old plan without telling it to KEEP it, which is an invitation to "
    + "rewrite rather than refine");
  ok(!/\b(rewrite|start over|from scratch|ignore the (existing|current|previous))\b/i.test(note),
    "the seed tells the model it may rewrite the plan — that is the behaviour this fix exists to stop, "
    + "and it would silently replace this month's targets on every press of Run");
  // 🔑 UNIVERSAL: a client with nothing locked must still draft freely.
  ok(/catch \(_\)/.test(note) || /if \(locked &&/.test(note),
    "a client with no locked plan is not handled — the first run for every new client would break or "
    + "be seeded with nothing");
}

if (fail.length) {
  console.error("🔴 the keyword plan is not decided on evidence:");
  for (const f of fail) console.error(`   · ${f}`);
  process.exit(1);
}
console.log("✅ one searcher gets one slot (and different searchers keep theirs), the plan is required to "
  + "carry a reportable anchor, the weakest evidence is what it gives up, and the swap cleans up every "
  + "record that described the term it dropped");
