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
if (!fn) { console.error("⚠️  INDETERMINATE — structuredHtml not found."); process.exit(2); }
const ctx = vm.createContext({});
try {
  vm.runInContext(`const escapeHtml=(s)=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");`
    + fn + ";globalThis._h = structuredHtml;", ctx);
} catch (e) { console.error(`⚠️  INDETERMINATE — structuredHtml did not evaluate: ${e.message}`); process.exit(2); }

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
<body>${html}</body></html>`, { waitUntil: "load" });

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

console.log("");
if (bad) {
  console.error(`🔴 ${bad} difference(s) from reports/mockups/admin_keyword_volume_v1.html`);
  process.exit(1);
}
console.log("✅ the keyword card matches its approved mockup, and a floor can never pass for a measurement");
