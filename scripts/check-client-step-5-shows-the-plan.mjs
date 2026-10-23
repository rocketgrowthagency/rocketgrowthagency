#!/usr/bin/env node
// check-client-step-5-shows-the-plan.mjs — 2026-10-20, approved step5_keyword_plan_client_v2. Chris: "we spent a lot of time on
// step 5… we tested it and confirmed it works for any business in the USA — why did this get lost?" It wasn't lost: the plan
// was proven on the ADMIN side and the client card was never built (project_done_steps_show_nothing). This RUNS the card on a
// plumber in Denver (not RGA) — any trade, any city — and checks it reads the ONE locked plan, honestly.
//   exit 0 holds · 1 the client card regressed · 2 code moved
import fs from "node:fs";
import vm from "node:vm";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const P = read("portal/portal.js"), PB = read("data/playbooks/playbooks.json");
const F = [], fail = (m) => F.push(m);
const lift = (n) => { const at = P.search(new RegExp(`\\nfunction ${n}\\(`)); if (at < 0) { console.error(`⚠️  ${n} moved`); process.exit(2); } let d = 0; for (let i = P.indexOf("{", P.indexOf(")", at)); i < P.length; i++) { if (P[i] === "{") d++; else if (P[i] === "}") { d--; if (!d) return P.slice(at + 1, i + 1); } } };
const ctx = vm.createContext({ escapeHtml: (x) => String(x ?? "").replace(/</g, "&lt;"), escapeAttribute: (x) => String(x ?? ""), monthDay: (x) => String(x || "").slice(5, 10),
  googleCardHtml: (o) => `<card state="${o.state}">${[o.small, o.side, o.title, o.body, o.act].filter(Boolean).join(" ¦ ")}</card>`, Number, String, Array, Date, KW_ICON: "", seeStepText: () => "See step 5 →" });   // the number comes from the playbook in the browser
for (const c of ["KW_PIN", "KW_LOCK", "KW_SPIN", "KW_TICK", "KW_DOWN"]) { const m = P.match(new RegExp(`^const ${c} = \`[^\`]*\`;$`, "m")); if (!m) { console.error(`⚠️  ${c} moved`); process.exit(2); } vm.runInContext(m[0].replace(/^const /, "var "), ctx); }
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
if (!/Locked by RGA/.test(h) || (h.match(/class="pm-k5-kw"/g) || []).length !== 5) fail(`a locked plan isn't "Locked by RGA" with its 5 searches, one line each (${h.slice(0, 140)})`);
if (!/<b>880<\/b>\/mo/.test(h) || !/<b>4,400<\/b>\/mo/.test(h)) fail("measured volumes aren't shown as searches a month");
if ((h.match(/too specific/g) || []).length !== 2 || /\b10<\/b>\/mo|null/.test(h)) fail("a volume at Google's floor (10) or missing reads as a number, not \"too specific\"");
if ((h.match(/title="Shows Google's map"/g) || []).length !== 3) fail("the searches that show Google's map don't carry the map pin");
{ const tag = (t) => (h.match(new RegExp(`<small>${t}</small>`, "g")) || []).length;
  if (tag("Ready to hire nearby") !== 1 || tag("Your town") !== 1 || tag("Your area") !== 1 || tag("Your service") !== 2) fail(`the 2–3-word whys aren't by search type, for THEIR town and areas (near me ${tag("Ready to hire nearby")}/1 · town ${tag("Your town")}/1 · area ${tag("Your area")}/1 · service ${tag("Your service")}/2)`); }
if (!/In the map now: Joe's Plumbing \(210\) · Mile High Rooter \(95\)/.test(h) || !/<details class="pm-k5-fold">/.test(h)) fail("who holds the map now isn't in the fold");
// 🔒 the full why lines are the APPROVED owner-words lines by search type, in the fold — any trade, any city
{ const near = (h.match(/Someone ready to hire, asking Google for the closest business like yours/g) || []).length;
  const town = (h.match(/Your service plus your town: a Denver customer ready to buy|Your service plus your town: a Capitol Hill customer ready to buy|The way local buyers type a search when they want someone genuinely local/g) || []).length;
  const svc = (h.match(/Names the service you sell; the person searching already knows what they want/g) || []).length;
  if (near !== 1 || town !== 2 || svc !== 2) fail(`the fold's why lines aren't the approved owner-words lines by search type (near me ${near}/1 · names their town or an area ${town}/2 · the service ${svc}/2)`);
  if (/Shows Google's map, where your Business Profile can win it|Shows regular results, where your website/.test(h)) fail("the generic fact lines are back in place of the approved why lines");
  const broadH = run({ ...plan, outcome_data: { ...plan.outcome_data, demand: [{ term: "roofing companies", volume: 900, pack: false }] } });
  if (!/Shopping around/.test(broadH) || !/Reaches people who know what they need but haven't picked who to call yet/.test(broadH)) fail("a broad \"…companies\" search doesn't get its own why"); }
if (/optimis|Implicit-local/i.test(h)) fail("the admin draft's prose (or British spelling) reaches the client");
if (/Atlantis/.test(h) || !/<i aria-hidden="true"><\/i>Capitol Hill<\/span>/.test(h) || !/Baker/.test(h)) fail("an area Google didn't verify is shown, or a real one isn't");
if (!/3<small> \/ 125<\/small>/.test(h) || !/around Denver/.test(h)) fail("the starting line isn't summed over every keyword the scan measured (3 of 5 × 25 = 125), around THEIR town");
if (!/data-step-wrong="m1\.strategy\.keywords_locations">Something's not right\? Tell us/.test(h) || !/data-kw-ok="m1\.strategy\.keywords_locations">Looks right/.test(h)) fail("the locked plan lacks Looks right / Something's not right");
const rev = run({ ...plan, status: "in_progress", completed_at: null });
if (!/<b>Draft<\/b><span>RGA is reviewing it<\/span>/.test(rev) || !/<b>880<\/b>\/mo/.test(rev) || /Looks right/.test(rev)) fail("a drafted plan isn't shown as the Draft RGA is reviewing (with no Looks right yet)");
const empty = run({ status: "pending" });
if (!/Real search data/.test(empty) || !/Nothing needed from you/.test(empty) || /\/mo/.test(empty)) fail("no plan yet isn't the three-dot \"building\" stage");
const veto = run({ ...plan, client_flagged: { at: "2026-10-07T10:00:00Z" } });
if (!/You told us something's not right/.test(veto) || !/Current plan/.test(veto) || !/pm-k5-plan rga dim/.test(veto)) fail("the client's \"not right\" doesn't come first, with the current plan faded");
const okd = run({ ...plan, client_ok_at: "2026-10-07T10:00:00Z" });
if (!/You said it looks right · 10-07/.test(okd) || !/\+ 3 more · tap to see all/.test(okd) || /data-kw-ok=/.test(okd)) fail("after Looks right, the list doesn't fold to the top 2 with the client's yes on record");
if (!/record>Your keyword plan/.test(run({ status: "done" }))) fail("a done step 5 with no plan on record isn't the honest done record");
if (!/const CARD_OWNS_INTRO = new Set\(\["m1\.strategy\.keywords_locations"\]\)/.test(P) || !/&& !CARD_OWNS_INTRO\.has\(step\.id\) \? splitAskWhy/.test(P)) fail("step 5's row repeats the intro paragraph above its own card");
ctx.__T2 = { "m1.strategy.keywords_locations": plan }; if (!/data-kw-note/.test(vm.runInContext("kwNoteHtml(__T2)", ctx))) fail("a freshly locked plan has no top note");
ctx.__T3 = { "m1.strategy.keywords_locations": { ...plan, completed_at: "2026-01-01T00:00:00Z" } }; if (vm.runInContext("kwNoteHtml(__T3)", ctx)) fail("the top note outlives 7 days");
if (!/"m1\.tracking\.form_setup", "m1\.strategy\.keywords_locations"\]\);/.test(P) || !/if \(step\.id === "m1\.strategy\.keywords_locations"\) return keywordPlanCardHtml\(step, t, tasks \|\| \{\}\);/.test(P)) fail("step 5 isn't a record card (a done step 5 would be blank again)");
if (!/"clientLabel": "Your keyword plan"/.test(PB)) fail("step 5's title isn't \"Your keyword plan\" (v3)");
if (F.length) { console.error("🔴 client step 5 doesn't show the plan the approved way:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ client step 5 shows the locked plan for any business: searches a month (floor → too specific), map tags + who holds the map, local terms by THEIR city, verified areas only, the summed starting line, a veto — never the admin's prose");
