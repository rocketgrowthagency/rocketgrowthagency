#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — THE KEYWORD RESULT CARD MATCHES ITS APPROVED MOCKUP
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Approved 2026-10-02 → reports/mockups/admin_keyword_volume_v1.html
 *
 * Chris: *"what is the 2900/mo 10/mo?"* — the number had no unit, no subject and no place, and the
 * FLOOR value rendered identically to a measurement. *"'seo services near me' — make this design
 * better, like this IS the search term."* — it was set as a bold heading, which is what a title looks
 * like, not a string someone types into Google.
 *
 * 🔑 This renders the REAL admin.css against the markup `structuredHtml` builds and compares
 * getComputedStyle with the mockup, because the last banner shipped looking wrong while every word
 * in it was right. → feedback_how_design_work_gets_done_first_time
 *
 * Exit 0 pass · 1 fail · 2 indeterminate.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import puppeteer from "puppeteer";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const CSS = path.join(SITE, "admin", "admin.css");
const JS = path.join(SITE, "admin", "admin.js");
const MOCK = path.join(SITE, "reports", "mockups", "admin_keyword_volume_v1.html");
for (const f of [CSS, JS, MOCK]) if (!fs.existsSync(f)) { console.error(`⚠️  INDETERMINATE — ${path.basename(f)} missing.`); process.exit(2); }

// ── build the live markup with the REAL renderer ────────────────────────────────────────────────
const raw = fs.readFileSync(JS, "utf8");
const grab = (name) => {
  const i = raw.indexOf(`function ${name}(`);
  if (i < 0) return null;
  let d = 0;
  for (let k = raw.indexOf("{", i); k < raw.length; k++) {
    if (raw[k] === "{") d++;
    else if (raw[k] === "}") { d--; if (!d) return raw.slice(i, k + 1); }
  }
  return null;
};
const fn = grab("structuredHtml");
const panelFn = grab("measurementPanelHtml");
if (!fn) { console.error("⚠️  INDETERMINATE — structuredHtml not found."); process.exit(2); }
if (!panelFn) { console.error("⚠️  INDETERMINATE — measurementPanelHtml not found."); process.exit(2); }
// 🔴🔴 A HAND-WRITTEN LIFT LIST GOES STALE THE DAY THE PRODUCT GROWS A HELPER. `structuredHtml`
// began calling `obVerifiedPlaces` and `obPlaceEvidenceHtml`, and this gate THREW — a stack trace
// where a finding should be, which the sweep counts separately precisely because it is noise.
// 🔑 scripts/_lift-admin.mjs resolves its own dependency set. This file lifts by hand, so the two
// helpers are pulled in explicitly — and the next helper will break it again.
// → feedback_a_lift_list_is_a_promise_somebody_will_remember
const deps = ["obVerifiedPlaces", "obPlaceEvidenceHtml"]
  .map((n) => { const m = raw.match(new RegExp(`^function ${n}\\s*\\([\\s\\S]*?\\n\\}`, "m")); return m ? m[0] : ""; })
  .join("\n\n");
if (!deps.trim()) { console.error("⚠️  INDETERMINATE — structuredHtml's helpers did not lift."); process.exit(2); }
const ctx = vm.createContext({});
try {
  vm.runInContext(`const escapeHtml=(s)=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");const MEASURE_FLOOR=10;`
    + deps + fn + panelFn + ";globalThis._h = structuredHtml; globalThis._p = measurementPanelHtml;", ctx);
} catch (e) { console.error(`⚠️  INDETERMINATE — the lifted renderers did not evaluate: ${e.message}`); process.exit(2); }

// 🔑 The panel is built from outcome_data, so the gate feeds it outcome_data — not prose.
const PANEL = ctx._p({ auto_result: { outcome_data: {
  demand: [{ term: "a", volume: 2900 }, { term: "b", volume: 2900 }, { term: "c", volume: 1900 },
           { term: "d", volume: 10 }, { term: "e", volume: null }],
  geo: { canonicalName: "California,United States" },
  alternatives: [{ term: "digital marketing", volume: 18100 }],
} } });

// 🔴🔴 THE OLD STORED FORMAT. A card renders STORED text, so a draft written before this design
// still says `2900/mo` and `10/mo`. The first build classified on the WORDS, so an old `10/mo` — the
// value meaning Google cannot size the phrase — rendered GREEN. A renderer that only understands
// what it writes today lies about every card it wrote yesterday.
const LEGACY = ctx._h([{ head: "Keywords", count: 4, items: [
  { title: "a", fields: { searches: "2900/mo", why: "x" } },
  { title: "b", fields: { searches: "10/mo", why: "x" } },
  { title: "c", fields: { searches: "110/mo", why: "x" } },
  { title: "d", fields: { searches: "no data", why: "x" } },
] }]);
const legacyBands = [...LEGACY.matchAll(/<span class="ob-vol ([a-z]+)">([^<]*)</g)].map((m) => ({ band: m[1], text: m[2] }));

const html = ctx._h([{ head: "Keywords", count: 3, items: [
  { title: "seo services near me", fields: { searches: "2,900 searches/mo", why: "Ready to hire, not research." } },
  { title: "seo company Culver City", fields: { searches: "below Google's floor", why: "Too few type this exact phrase." } },
  { title: "gbp optimization Los Angeles", fields: { searches: "no data", why: "Below the reporting floor." } },
] }]);

let browser;
try { browser = await puppeteer.launch({ headless: "new" }); }
catch (e) { console.error(`⚠️  INDETERMINATE — no browser: ${e.message}`); process.exit(2); }

const live = await browser.newPage();
await live.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${fs.readFileSync(CSS, "utf8")}</style></head>
<body>${html}${PANEL}</body></html>`, { waitUntil: "load" });

const mock = await browser.newPage();
await mock.setContent(fs.readFileSync(MOCK, "utf8"), { waitUntil: "load" });

const PROPS = ["backgroundColor", "color", "fontSize", "fontWeight", "borderRadius", "whiteSpace", "textOverflow"];
const read = (page, sel) => page.evaluate((s, props) => {
  const el = document.querySelector(s);
  if (!el) return null;
  const c = getComputedStyle(el);
  const o = {}; for (const p of props) o[p] = c[p];
  o._text = (el.textContent || "").trim();
  return o;
}, sel, PROPS);

const liveQuery = await read(live, ".ob-q > span");
const liveOk = await read(live, ".ob-vol.ok");
const liveFloor = await read(live, ".ob-vol.floor");
const liveNone = await read(live, ".ob-vol.none");

const mockQuery = await read(mock, ".kw.v2 .q > span");
const mockOk = await read(mock, ".kw.v2 .vol:not(.floor):not(.none)");
const mockFloor = await read(mock, ".kw.v2 .vol.floor");
// 🔴 READ EVERYTHING BEFORE CLOSING. The panel checks were written after `browser.close()` and died
// with "Execution context was destroyed" — a harness failure that exits 1 and reads exactly like a
// product failure. → feedback_three_ways_i_broke_my_own_sweep
const panelFacts = await live.evaluate(() => {
  const h = document.querySelector(".ob-panel-h .m");
  return {
    header: h ? h.textContent.trim() : null,
    order: [...document.querySelectorAll(".ob-vd")].map((e) => e.className.replace("ob-vd", "").trim()),
    okText: (document.querySelector(".ob-vd.ok") || {}).textContent || "",
  };
});
await browser.close();

let bad = 0;
const cmp = (name, a, b, only) => {
  if (!a || !b) { console.error(`  ⚠️  INDETERMINATE — ${name} missing (live=${!!a} mock=${!!b})`); process.exit(2); }
  const keys = only || PROPS;
  const diffs = keys.filter((k) => a[k] !== b[k]);
  if (!diffs.length) { console.log(`  ✅ ${name}: all ${keys.length} properties match`); return; }
  bad += diffs.length;
  console.log(`  🔴 ${name}: ${diffs.length} difference(s)`);
  for (const k of diffs) console.log(`       ${k.padEnd(14)} live=${String(a[k]).slice(0, 30).padEnd(30)} mock=${String(b[k]).slice(0, 30)}`);
};

console.log("── the keyword card vs its approved mockup ──\n");
cmp("search term", liveQuery, mockQuery, ["fontSize", "fontWeight", "color", "whiteSpace", "textOverflow"]);
cmp("volume chip (figure)", liveOk, mockOk, ["backgroundColor", "color", "borderRadius"]);
cmp("volume chip (floor)", liveFloor, mockFloor, ["backgroundColor", "color", "borderRadius"]);

console.log("\n── three states exist and read differently ──");
for (const [n, el, want] of [["figure", liveOk, "searches/mo"], ["floor", liveFloor, "floor"], ["no data", liveNone, "no data"]]) {
  if (el && el._text.toLowerCase().includes(want)) console.log(`  ✅ ${n}: ${JSON.stringify(el._text)}`);
  else { bad++; console.log(`  🔴 ${n}: ${JSON.stringify(el && el._text)} — expected to contain ${JSON.stringify(want)}`); }
}
const same = liveOk && liveFloor && liveOk.backgroundColor === liveFloor.backgroundColor;
if (same) { bad++; console.log("  🔴 a floor renders in the same colour as a measurement — the defect this card exists to stop"); }
else console.log("  ✅ a floor is visually distinct from a measurement");

console.log("\n── the measurement panel ──");
{
  if (!panelFacts.header) { bad++; console.log("  🔴 no measurement panel rendered"); }
  else {
    const says = /California/.test(panelFacts.header) && /Keyword Planner/.test(panelFacts.header) && /searches a month/.test(panelFacts.header);
    if (says) console.log("  ✅ one header carries place, source and unit");
    else { bad++; console.log(`  🔴 header is missing place/source/unit: ${JSON.stringify(panelFacts.header)}`); }
  }
  if (panelFacts.order.join(",") === "ok,warn,info") console.log("  ✅ verdicts read good · needs action · context");
  else { bad++; console.log(`  🔴 verdict order is ${JSON.stringify(panelFacts.order)} — expected ok,warn,info`); }
  if (/3 of 5/.test(panelFacts.okText)) console.log("  ✅ the floor is excluded from the count (3 of 5, not 5 of 5)");
  else { bad++; console.log(`  🔴 count does not exclude the floor: ${JSON.stringify(panelFacts.okText.slice(0, 60))}`); }
}

console.log("\n── a stored draft from before this design still reads correctly ──");
{
  const want = [
    { band: "ok", has: "2,900 searches/mo" },
    { band: "floor", has: "below Google's floor" },
    { band: "low", has: "110 searches/mo" },
    { band: "none", has: "no data" },
  ];
  want.forEach((w, i) => {
    const got = legacyBands[i];
    if (got && got.band === w.band && got.text.includes(w.has)) {
      console.log(`  ✅ ${JSON.stringify(w.has)} → ${w.band}`);
    } else {
      bad++;
      console.log(`  🔴 expected ${w.band} / ${JSON.stringify(w.has)}, got ${JSON.stringify(got)}`);
    }
  });
  // The whole point: the floor must never wear the colour of real demand.
  const floorBand = legacyBands.find((x) => /floor/i.test(x.text));
  if (floorBand && floorBand.band === "ok") { bad++; console.log("  🔴 a legacy floor value renders as real demand"); }
}

console.log("");
if (bad) {
  console.error(`🔴 ${bad} difference(s) from reports/mockups/admin_keyword_volume_v1.html`);
  process.exit(1);
}
console.log("✅ the keyword card matches its approved mockup, and a floor can never pass for a measurement");
