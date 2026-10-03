#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — THE LIVE CONFIRMATION BANNER MATCHES ITS APPROVED MOCKUP
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Chris, 2026-10-02: *"these confirmation cards dont match mockup exactly. i told you before spend
 * the time matching to the mockup so i dont have to tell you and go back and forth."*
 *
 * He was right. I rewrote what the banner SAYS and never diffed what it LOOKS LIKE. A render diff
 * then found **thirteen** differences — padding, both font sizes, font weight, line-height, the
 * stripe width and colour, the box shadow, the icon tile's background and radius, the glyph, and a
 * countdown hairline the mockup had omitted. **Eyeballing the two screenshots had found none of
 * them**, which is the whole reason this is a gate and not a habit.
 *
 * 🔑 Measure the set · mockup · build · DIFF THE RENDER PROPERTY BY PROPERTY · re-diff.
 * → feedback_how_design_work_gets_done_first_time · project_admin_confirmation_card
 *
 * It renders the REAL admin.css against the banner markup setBanner builds, renders the approved
 * mockup, and compares getComputedStyle on both. Exit 0 pass · 1 fail · 2 indeterminate.
 */
import puppeteer from "puppeteer";
import fs from "node:fs";

const SITE = "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const CSS = fs.readFileSync(`${SITE}/admin/admin.css`, "utf8");
const MOCK = fs.readFileSync(`${SITE}/reports/mockups/admin_confirmation_card_v1.html`, "utf8");

if (!fs.existsSync(`${SITE}/reports/mockups/admin_confirmation_card_v1.html`)) {
  console.error("⚠️  INDETERMINATE — the approved mockup is missing.");
  process.exit(2);
}
let browser;
try { browser = await puppeteer.launch({ headless: "new" }); }
catch (e) { console.error(`⚠️  INDETERMINATE — no browser: ${e.message}`); process.exit(2); }

// ── the LIVE banner, built exactly as setBanner builds it ───────────────────────────────────────
const live = await browser.newPage();
await live.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head>
<body><div class="admin-banner is-success" id="b">
  <span class="admin-banner-icon">✓</span>
  <strong class="admin-banner-title">Step 26 · Lock 3-5 primary keywords + 3 sub-locations</strong>
  <span class="admin-banner-line">5 keywords and 3 locations drafted. Volume measured in California.</span>
  <span class="admin-banner-life"><i></i></span>
</div></body></html>`, { waitUntil: "load" });

const PROPS = ["backgroundColor", "borderLeftWidth", "borderLeftColor", "borderRadius", "boxShadow",
  "padding", "fontSize", "fontWeight", "color", "lineHeight"];
const read = (page, sel) => page.evaluate((s, props) => {
  const el = document.querySelector(s);
  if (!el) return null;
  const c = getComputedStyle(el);
  const o = {};
  for (const p of props) o[p] = c[p];
  o._text = (el.textContent || "").trim().slice(0, 60);
  return o;
}, sel, PROPS);

const liveCard = await read(live, "#b");
const liveTitle = await read(live, ".admin-banner-title");
const liveLine = await read(live, ".admin-banner-line");
const liveIcon = await read(live, ".admin-banner-icon");
const liveLife = await read(live, ".admin-banner-life");

// ── the MOCKUP's own toast ──────────────────────────────────────────────────────────────────────
const mock = await browser.newPage();
await mock.setContent(MOCK, { waitUntil: "load" });
const mockCard = await read(mock, ".toast:not(.now)");
const mockTitle = await read(mock, ".toast:not(.now) .t");
const mockLine = await read(mock, ".toast:not(.now) .s");
const mockIcon = await read(mock, ".toast:not(.now) .ic");
const mockLife = await read(mock, ".toast:not(.now):not(.run) .life");

await browser.close();

let bad = 0;
const cmp = (name, a, b, only) => {
  if (!a || !b) { console.error(`  ⚠️  INDETERMINATE — ${name} missing (live=${!!a} mock=${!!b})`); process.exit(2); }
  const keys = only || PROPS;
  const diffs = keys.filter((k) => a[k] !== b[k]);
  if (!diffs.length) { console.log(`  ✅ ${name}: all ${keys.length} properties match`); return; }
  bad += diffs.length;
  console.log(`  🔴 ${name}: ${diffs.length} difference(s)`);
  for (const k of diffs) console.log(`       ${k.padEnd(18)} live=${String(a[k]).slice(0, 34).padEnd(34)} mock=${String(b[k]).slice(0, 34)}`);
};

console.log("── LIVE banner vs APPROVED mockup ──\n");
cmp("card", liveCard, mockCard);
cmp("title", liveTitle, mockTitle, ["fontSize", "fontWeight", "color", "lineHeight"]);
cmp("body line", liveLine, mockLine, ["fontSize", "fontWeight", "color"]);
cmp("icon tile", liveIcon, mockIcon, ["backgroundColor", "color", "borderRadius"]);
cmp("countdown hairline", liveLife, mockLife, ["borderRadius", "backgroundColor"]);

if (liveIcon && mockIcon && liveIcon._text !== mockIcon._text) {
  bad++;
  console.log(`  🔴 icon glyph: live=${JSON.stringify(liveIcon._text)} mock=${JSON.stringify(mockIcon._text)}`);
} else console.log(`  ✅ icon glyph matches (${JSON.stringify(liveIcon && liveIcon._text)})`);

console.log("");
if (bad) {
  console.error(`🔴 ${bad} property difference(s) between the live banner and its approved mockup.`);
  console.error(`   Match the mockup, then re-run. Eyeballing two screenshots does not find these.`);
  process.exit(1);
}
console.log("✅ the live confirmation banner matches reports/mockups/admin_confirmation_card_v1.html");
