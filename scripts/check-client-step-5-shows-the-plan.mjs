#!/usr/bin/env node
// check-client-step-5-shows-the-plan.mjs — 2026-10-20, approved step5_keyword_plan_client_v2. Chris: "we spent a lot of time on
// step 5… we tested it and confirmed it works for any business in the USA — why did this get lost?" It wasn't lost: the plan
// was proven on the ADMIN side and the client card was never built (project_done_steps_show_nothing). This RUNS the card on a
// plumber in Denver (not RGA) — any trade, any city — and checks it reads the ONE locked plan, honestly.
// 🔒 2026-10-29 client_step05_keyword_plan_v1 (the card system, Chris approved): ranked rows (.pm-cs-rank), "too specific to count",
// "Measured in" chips, a "Where you start" meter, foot "Locked by RGA" + the card's own "Why these 5" fold, Looks right + Change
// something under; NO map pin on a row any more (the mockup dropped it — who holds the map stays in the fold); a change asked = ONE
// status row with Cancel; the draft has nothing to press; building = three event rows.
//   exit 0 holds · 1 the client card regressed · 2 code moved
import fs from "node:fs";
import vm from "node:vm";
import { csBlock } from "./lib/portal-cs.mjs";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const P = read("portal/portal.js"), PB = read("data/playbooks/playbooks.json");
const F = [], fail = (m) => F.push(m);
const lift = (n) => { const at = P.search(new RegExp(`\\nfunction ${n}\\(`)); if (at < 0) { console.error(`⚠️  ${n} moved`); process.exit(2); } let d = 0; for (let i = P.indexOf("{", P.indexOf(")", at)); i < P.length; i++) { if (P[i] === "{") d++; else if (P[i] === "}") { d--; if (!d) return P.slice(at + 1, i + 1); } } };
const ctx = vm.createContext({ escapeHtml: (x) => String(x ?? "").replace(/</g, "&lt;"), escapeAttribute: (x) => String(x ?? ""), monthDay: (x) => String(x || "").slice(5, 10),
  googleCardHtml: (o) => `<card state="${o.state}">${[o.small, o.side, o.title, o.body, o.act].filter(Boolean).join(" ¦ ")}</card>`, Number, String, Array, Date, KW_ICON: "", seeStepText: () => "See step 5 →" });   // the number comes from the playbook in the browser
for (const c of ["KW_PIN", "KW_LOCK", "KW_SPIN", "KW_TICK", "KW_DOWN"]) { const m = P.match(new RegExp(`^const ${c} = \`[^\`]*\`;$`, "m")); if (!m) { console.error(`⚠️  ${c} moved`); process.exit(2); } vm.runInContext(m[0].replace(/^const /, "var "), ctx); }
for (const c of ["pcActs", "pcDate"]) { const m = P.match(new RegExp(`^const ${c} = [^\\n]*;$`, "m")); if (!m) { console.error(`⚠️  ${c} moved`); process.exit(2); } vm.runInContext(m[0].replace(/^const /, "var "), ctx); }
vm.runInContext(csBlock(P), ctx);
vm.runInContext("var doneNoRecordHtml = (t, o) => `<record>${o.title} ¦ ${(o.rows || []).map((r) => r.join(' ')).join(' ')}</record>`;", ctx);
vm.runInContext(lift("keywordPlanCardHtml"), ctx); vm.runInContext(lift("kwNoteHtml"), ctx);
const plan = { status: "done", completed_at: new Date().toISOString(), outcome_data: {
  draft: "keywords:\n  - term: emergency plumber denver\n    why: >\n      Implicit-local buyer phrase optimised for the map pack.\n",
  demand: [{ term: "emergency plumber denver", volume: 880, pack: true, pack_top: [{ name: "Joe's Plumbing", reviews: 210 }, { name: "Mile High Rooter", reviews: 95 }] },
    { term: "water heater repair", volume: 1300, pack: false }, { term: "plumber capitol hill denver", volume: 10, pack: true }, { term: "sewer line camera inspection", volume: null, pack: false },
    { term: "plumber near me", volume: 4400, pack: true }],
  locations: [{ ok: true, place: "Capitol Hill", reach: 52000 }, { ok: true, place: "Highland", reach: 38000 }, { ok: false, place: "Atlantis" }, { ok: true, place: "Baker", reach: 21000 }] } };
const grid = { outcome_data: { market: "Denver, CO", measured_at: "2026-10-06T23:41:58Z", points: 25, per_keyword: [1, 2, 3, 4, 5].map((i) => ({ points: 25, ranked: i === 1 ? 3 : 0, measured: true })) } };
const run = (t, tasks = { "m1.audit.grid_baseline": grid }) => { ctx.__t = t; ctx.__T = tasks; return vm.runInContext(`keywordPlanCardHtml({ id: "m1.strategy.keywords_locations" }, __t, __T)`, ctx); };
const h = run(plan);
// 🔒 v3 (approved step5_keyword_plan_clean_v3, 10-23): one line per search, the full why in a fold — the SAME facts as v2
if (!/<span class="lock">[^]*?Locked by RGA<\/span>/.test(h) || (h.match(/class="pm-cs-rank"/g) || []).length !== 5 || !/<div class="pm-k5-plan pm-cs-card ok">/.test(h) || !/Your 5 keywords · locked by RGA/.test(h)) fail(`a locked plan isn't the green system card "Your 5 keywords · locked by RGA" with its 5 ranked searches and "Locked by RGA" in the foot (${h.slice(0, 140)})`);
if (!/<b>880<\/b>\/mo/.test(h) || !/<b>4,400<\/b>\/mo/.test(h)) fail("measured volumes aren't shown as searches a month");
if ((h.match(/<span class="r">too specific to count<\/span>/g) || []).length !== 2 || /\b10<\/b>\/mo|null/.test(h)) fail("a volume at Google's floor (10) or missing reads as a number, not \"too specific to count\"");
if (!/"Too specific to count" means Google doesn't count searches that small/.test(h)) fail("the fold doesn't say what \"too specific to count\" means");
// client_step05_keyword_plan_v1 dropped the map pin on a row (who holds the map is in the fold instead)
if (/title="Shows Google's map"/.test(h)) fail("a search row carries the old map pin again (the approved card has none)");
{ const tag = (t) => (h.match(new RegExp(`<small>${t}</small>`, "g")) || []).length;
  if (tag("Ready to hire nearby") !== 1 || tag("Your town") !== 1 || tag("Your area") !== 1 || tag("Your service") !== 2) fail(`the 2–3-word whys aren't by search type, for THEIR town and areas (near me ${tag("Ready to hire nearby")}/1 · town ${tag("Your town")}/1 · area ${tag("Your area")}/1 · service ${tag("Your service")}/2)`); }
if (!/<details class="pm-cs-howb pm-cs-own"><summary>Why these 5<\/summary><div class="pm-k5-why">[^]*In the map now: Joe's Plumbing \(210\) · Mile High Rooter \(95\)/.test(h) || !/<button type="button" class="how" data-cs-how aria-expanded="false">Why these 5 /.test(h)) fail("who holds the map now isn't in the card's own \"Why these 5\" fold (opened from the foot)");
// 🔒 the full why lines are the APPROVED owner-words lines by search type, in the fold — any trade, any city
{ const near = (h.match(/Someone ready to hire, asking Google for the closest business like yours/g) || []).length;
  const town = (h.match(/Your service plus your town: a Denver customer ready to buy|Your service plus your town: a Capitol Hill customer ready to buy|The way local buyers type a search when they want someone genuinely local/g) || []).length;
  const svc = (h.match(/Names the service you sell; the person searching already knows what they want/g) || []).length;
  if (near !== 1 || town !== 2 || svc !== 2) fail(`the fold's why lines aren't the approved owner-words lines by search type (near me ${near}/1 · names their town or an area ${town}/2 · the service ${svc}/2)`);
  if (/Shows Google's map, where your Business Profile can win it|Shows regular results, where your website/.test(h)) fail("the generic fact lines are back in place of the approved why lines");
  const broadH = run({ ...plan, outcome_data: { ...plan.outcome_data, demand: [{ term: "roofing companies", volume: 900, pack: false }] } });
  if (!/Shopping around/.test(broadH) || !/Reaches people who know what they need but haven't picked who to call yet/.test(broadH)) fail("a broad \"…companies\" search doesn't get its own why"); }
if (/optimis|Implicit-local/i.test(h)) fail("the admin draft's prose (or British spelling) reaches the client");
if (/Atlantis/.test(h) || !/<span class="k">Measured in<\/span><div class="pm-cs-chipw"><span class="pm-cs-chip dot">Capitol Hill<\/span>/.test(h) || !/Baker/.test(h)) fail("an area Google didn't verify is shown, or a real one isn't (\"Measured in\" chips)");
if (!/<div class="pm-cs-meter"><span class="big">3<small> \/ 125<\/small>/.test(h) || !/Where you start/.test(h) || !/around Denver/.test(h)) fail("the starting line isn't summed over every keyword the scan measured (3 of 5 × 25 = 125), around THEIR town");
if (!/<div class="pm-k5-acts"><button type="button" class="pm-commit" data-kw-ok="m1\.strategy\.keywords_locations">Looks right<\/button><button type="button" class="pm-amend" data-step-wrong="m1\.strategy\.keywords_locations">Change something<\/button><\/div>/.test(h) || /Something's not right\? Tell us/.test(h)) fail("the locked plan lacks Looks right + Change something under the card (one word for every step)");
const rev = run({ ...plan, status: "in_progress", completed_at: null });
if (!/<div class="pm-k5-plan pm-cs-card rga">[^]*<b>Draft · RGA is reviewing it<\/b>/.test(rev) || !/<b>880<\/b>\/mo/.test(rev) || /Looks right|<button/.test(rev)) fail("a drafted plan isn't the blue \"Draft · RGA is reviewing it\" card with nothing to press");
const empty = run({ status: "pending" });
if (!/RGA is building your keyword plan/.test(empty) || (empty.match(/class="pm-cs-ev"/g) || []).length !== 3 || !/Real search data/.test(empty) || /\/mo|<button/.test(empty)) fail("no plan yet isn't the \"building\" card: three event rows, nothing to press");
const veto = run({ ...plan, client_flagged: { at: "2026-10-07T10:00:00Z", note: "Can we add Highland?" } });
if (!/You asked: “Can we add Highland\?”/.test(veto) || (veto.match(/class="pm-cs-st /g) || []).length !== 1 || !/data-step-unflag="m1\.strategy\.keywords_locations">Cancel<\/button>/.test(veto) || !/The current plan is still measured until then/.test(veto)) fail("the client's change request isn't ONE status row (their words · Cancel · the current plan still measured)");
if (!/You told us something's not right/.test(run({ ...plan, client_flagged: { at: "2026-10-07T10:00:00Z" } }))) fail("a change request with no words doesn't say \"You told us something's not right\"");
const okd = run({ ...plan, client_ok_at: "2026-10-07T10:00:00Z" });
if (!/<b>You said it looks right<\/b><small>10-07<\/small>/.test(okd) || !/<details class="pm-cs-more"><summary>\+ 3 more ›<\/summary>/.test(okd) || /data-kw-ok=/.test(okd) || !/data-step-wrong="m1\.strategy\.keywords_locations">Change something/.test(okd)) fail("after Looks right, the list doesn't fold to the top 2 with the client's yes on record (and Change something under)");
if (!/record>Your keyword plan/.test(run({ status: "done" }))) fail("a done step 5 with no plan on record isn't the honest done record");
if (!/const CARD_OWNS_INTRO = new Set\(\["m1\.strategy\.keywords_locations"\]\)/.test(P) || !/&& !CARD_OWNS_INTRO\.has\(step\.id\) \? splitAskWhy/.test(P)) fail("step 5's row repeats the intro paragraph above its own card");
ctx.__T2 = { "m1.strategy.keywords_locations": plan }; if (!/data-kw-note/.test(vm.runInContext("kwNoteHtml(__T2)", ctx))) fail("a freshly locked plan has no top note");
ctx.__T3 = { "m1.strategy.keywords_locations": { ...plan, completed_at: "2026-01-01T00:00:00Z" } }; if (vm.runInContext("kwNoteHtml(__T3)", ctx)) fail("the top note outlives 7 days");
if (!/"m1\.tracking\.form_setup", "m1\.strategy\.keywords_locations"\]\);/.test(P) || !/if \(step\.id === "m1\.strategy\.keywords_locations"\) return keywordPlanCardHtml\(step, t, tasks \|\| \{\}\);/.test(P)) fail("step 5 isn't a record card (a done step 5 would be blank again)");
if (!/"clientLabel": "Your keyword plan"/.test(PB)) fail("step 5's title isn't \"Your keyword plan\" (v3)");
if (F.length) { console.error("🔴 client step 5 doesn't show the plan the approved way:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ client step 5 shows the locked plan for any business: searches a month (floor → too specific to count), who holds the map in Why these 5, local terms by THEIR city, verified areas only, the summed starting line, a veto — never the admin's prose");
