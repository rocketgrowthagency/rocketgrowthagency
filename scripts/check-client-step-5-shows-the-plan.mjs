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
if (!/state="ok"/.test(h) || !/✓ Locked/.test(h) || !/Your 5 keywords \+ 3 areas/.test(h)) fail(`a locked plan isn't the Locked card with "Your 5 keywords + 3 areas" (${h.slice(0, 140)})`);
if (!/880 a month/.test(h) || !/4,400 a month/.test(h)) fail("measured volumes aren't shown as searches a month");
if ((h.match(/Too specific to measure/g) || []).length !== 2 || /\b10 a month\b|null a month/.test(h)) fail("a volume at Google's floor (10) or missing reads as a number, not \"Too specific to measure\"");
if ((h.match(/Shows a map/g) || []).length !== 3) fail("the searches that show Google's map aren't tagged");
if (!/In the map now:<\/b> Joe's Plumbing \(210 reviews\) · Mile High Rooter \(95 reviews\)/.test(h)) fail("who holds the map now isn't shown");
// 🔒 the why lines are the APPROVED v2 owner-words lines, chosen by what the search is (restored 10-23) — any trade, any city
{ const near = (h.match(/Someone ready to hire, asking Google for the closest business like yours/g) || []).length;
  const town = (h.match(/Your service plus your town: a Denver customer ready to buy|The way local buyers type a search when they want someone genuinely local/g) || []).length;
  const svc = (h.match(/Names the service you sell; the person searching already knows what they want/g) || []).length;
  if (near !== 1 || town !== 2 || svc !== 2) fail(`the why lines aren't the approved owner-words lines by search type (near me ${near}/1 · names their town or an area ${town}/2 · the service ${svc}/2)`);
  if (/Shows Google's map, where your Business Profile can win it|Shows regular results, where your website/.test(h)) fail("the generic fact lines are back in place of the approved why lines");
  const broadH = run({ ...plan, outcome_data: { ...plan.outcome_data, demand: [{ term: "roofing companies", volume: 900, pack: false }] } });
  if (!/Reaches people who know what they need but haven't picked who to call yet/.test(broadH)) fail("a broad \"…companies\" search doesn't get its own why line"); }
// 🔒 one lock line, one veto: step 5's card owns its lock (no generic lock bar on top), and a typed ✓ never doubles the drawn icon
if (!/const CARD_OWNS_LOCK = new Set\(\["m1\.strategy\.keywords_locations"\]\)/.test(P) || !/if \(!lk \|\| CARD_OWNS_LOCK\.has\(stepId\)\) return "";/.test(P)) fail("step 5 gets the generic lock bar on top of its own Locked card (two lock lines, two veto buttons)");
if (!/<span class="gcard-sw">\$\{String\(small \|\| ""\)\.replace\(\/\^✓\\s\*\/, ""\)\}<\/span>/.test(P)) fail("a card's typed ✓ shows beside its drawn check (two checks)");
if (/optimis|Implicit-local/i.test(h)) fail("the admin draft's prose (or British spelling) reaches the client");
if (/Atlantis/.test(h) || !/Capitol Hill <i>· reach 52,000<\/i>/.test(h)) fail("an area Google didn't verify is shown, or a real one isn't");
if (!/In Google's map results at 3 of the 125 points we checked around Denver/.test(h)) fail("the starting line isn't summed over every keyword the scan measured (5 × 25 = 125)");
if (!/data-step-wrong="m1\.strategy\.keywords_locations">Something's not right\? Tell us/.test(h)) fail("the client has no way to say the plan isn't right");
const rev = run({ ...plan, status: "in_progress", completed_at: null });
if (!/state="rga"/.test(rev) || !/RGA is reviewing it/.test(rev) || !/880 a month/.test(rev)) fail("a drafted plan isn't shown while RGA reviews it");
const empty = run({ status: "pending" });
if (!/Building your keyword plan/.test(empty) || /a month/.test(empty)) fail("no plan yet isn't \"Building your keyword plan\"");
const veto = run({ ...plan, client_flagged: { at: "2026-10-07T10:00:00Z" } });
if (!/Changing your keyword plan/.test(veto) || !/state="rga"/.test(veto)) fail("the client's \"not right\" doesn't move it to RGA");
ctx.__T2 = { "m1.strategy.keywords_locations": plan }; if (!/data-kw-note/.test(vm.runInContext("kwNoteHtml(__T2)", ctx))) fail("a freshly locked plan has no top note");
ctx.__T3 = { "m1.strategy.keywords_locations": { ...plan, completed_at: "2026-01-01T00:00:00Z" } }; if (vm.runInContext("kwNoteHtml(__T3)", ctx)) fail("the top note outlives 7 days");
if (!/"m1\.tracking\.form_setup", "m1\.strategy\.keywords_locations"\]\);/.test(P) || !/if \(step\.id === "m1\.strategy\.keywords_locations"\) return keywordPlanCardHtml\(step, t, tasks \|\| \{\}\);/.test(P)) fail("step 5 isn't a record card (a done step 5 would be blank again)");
if (!/"clientLabel": "Your keyword plan: 5 searches \+ 3 areas"/.test(PB)) fail("step 5's title isn't \"Your keyword plan: 5 searches + 3 areas\"");
if (F.length) { console.error("🔴 client step 5 doesn't show the plan the approved way:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ client step 5 shows the locked plan for any business: searches a month (floor → too specific), map tags + who holds the map, local terms by THEIR city, verified areas only, the summed starting line, a veto — never the admin's prose");
