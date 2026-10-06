#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — THE STEP'S MEASUREMENT BLOCKS MATCH THEIR APPROVED MOCKUP
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Chris, 2026-10-06: *"too wordy, no design elements here."* Four measurements were four bare `<p>`
 * tags, and the "what winning costs" panel was built by REGEX-SCRAPING the sentence the step wrote.
 * Mockup approved the same day: reports/mockups/admin_step_notes_v1.html
 *
 * This renders the REAL `obSurfaceBlockHtml` / `obPlacesBlockHtml` / `obNarrowedBlockHtml` from
 * admin.js against the REAL admin.css, and diffs `getComputedStyle` against the mockup element by
 * element. Nothing here re-implements the markup, so the gate cannot pass a card it has not drawn.
 * → feedback_how_design_work_gets_done_first_time · project_attach_the_fact_to_the_thing
 *
 * Exit 0 pass · 1 the live render has drifted from the approved design · 2 could not run.
 */
import fs from "node:fs";
import puppeteer from "puppeteer";
import { liftAdmin } from "./_lift-admin.mjs";

const diffs = [];

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const CSSP = `${SITE}/admin/admin.css`;
const MOCKP = `${SITE}/reports/mockups/admin_step_notes_v1.html`;
for (const f of [CSSP, MOCKP]) {
  if (!fs.existsSync(f)) { console.error(`⚠️  INDETERMINATE — missing ${f}`); process.exit(2); }
}
const CSS = fs.readFileSync(CSSP, "utf8");
const MOCK = fs.readFileSync(MOCKP, "utf8");

const lifted = liftAdmin(["obSurfaceBlockHtml", "obPlacesBlockHtml", "obNarrowedBlockHtml", "obStripMarker"]);

// The record the mockup was drawn from — the real measured run, 2026-10-06.
const D = {
  surface_at: "Culver City, California, United States",
  geo: { canonicalName: "California,United States" },
  demand: [
    { term: "seo company near me", volume: 2400, pack: true, reviews: 39 },
    { term: "local seo services", volume: 880, pack: true, reviews: 5 },
    { term: "google business profile optimization", volume: 590, pack: false, reviews: null },
    { term: "local seo agency Culver City CA", volume: null, pack: true, reviews: 32 },
    { term: "seo company Los Angeles", volume: 1300, pack: true, reviews: 25 },
  ],
  locations: [
    { place: "Mar Vista", ok: true, targetType: "Neighborhood", reach: 110000, canonicalName: "Mar Vista,California,United States" },
    { place: "Palms", ok: true, targetType: "Neighborhood", reach: 196000, canonicalName: "Palms,California,United States" },
    { place: "Marina del Rey", ok: true, targetType: "City", reach: 63000, canonicalName: "Marina del Rey,California,United States" },
  ],
  floor_kept: [{ term: "local seo agency Culver City CA", suggestions: 4 }],
  service_fit_note: "ℹ️ 20 candidates dropped for not matching what this business sells (Google Business Profile Optimization, Google Maps Local SEO, Website Support for Local SEO).",
};

// 🔴 THE GUARD MUST NOT NAME A CLASS. Pinning it to `ob-subloc` meant that renaming that class —
// exactly the regression the collision check exists to catch — tripped "cannot run" first, and the
// gate went INDETERMINATE over its own finding. The precondition is that each renderer produced
// markup, which is true whatever the classes are called.
const parts = ["obSurfaceBlockHtml", "obPlacesBlockHtml", "obNarrowedBlockHtml"]
  .map((f) => [f, String(lifted.call(f, [D]) || "")]);
const empty = parts.filter(([, h]) => h.trim().length < 40).map(([f]) => f);
if (empty.length) {
  console.error(`⚠️  INDETERMINATE — ${empty.join(", ")} produced no markup; re-pin this gate.`);
  process.exit(2);
}
const html = parts.map(([, h]) => h).join("");

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴🔴 A NEW BLOCK NEEDS A NAME NOTHING ELSE ANSWERS TO — checked, not assumed.
//
// Two class collisions in one afternoon. `.ob-note` was declared twice, so a bordered note box fifty
// lines below had been handing the notes fold its ink and font size. Then these blocks shipped using
// `.ob-place` / `.ob-places`, which the draft's own LOCATIONS list has used since long before — so
// the new rules, being later in the stylesheet, silently restyled a component nobody was touching.
//
// 🔑 THE RENDER DIFF CANNOT SEE THIS. It renders the new blocks alone, so a collision that damages
// the OTHER component leaves the new one matching its mockup perfectly. The check has to be on NAMES.
//
// 🔴 AND THE LIST OF NAMES IS READ OUT OF THE MARKUP, NEVER WRITTEN HERE. A hand-kept list made the
// gate go BLIND the moment a class was renamed — it reported "cannot run" over exactly the
// regression it exists to catch. → feedback_a_lift_list_is_a_promise_somebody_will_remember
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
{
  const JS = fs.readFileSync(`${SITE}/admin/admin.js`, "utf8");
  // 🔑 A CLASS IS "OURS" ONLY IF THIS BLOCK'S OWN CSS SECTION DECLARES IT. The blocks deliberately
  // reuse the shared panel chrome (`ob-panel`, `ob-panel-h`, `ob-panel-b`, `ob-note`) — consuming a
  // shared class is correct and must not be reported as a collision. Declaring one twice is the bug.
  const SECTION = CSS.slice(Math.max(0, CSS.indexOf("STEP OUTPUT — the measurements")));
  const emitted = new Set([...html.matchAll(/class="([^"]+)"/g)]
    .flatMap((m) => m[1].split(/\s+/)).filter((c) => /^ob-/.test(c)));
  const OWN = [...emitted].filter((c) => new RegExp(`(^|\\n)\\.${c}[\\s{.:]`).test(SECTION));
  if (OWN.length < 4) {
    console.error(`⚠️  INDETERMINATE — only ${OWN.length} block class(es) harvested from the markup.`);
    process.exit(2);
  }
  // admin.js with the three renderers blanked out — everything else that emits a class
  const mine = (() => {
    let t = JS;
    for (const f of ["obSurfaceBlockHtml", "obPlacesBlockHtml", "obNarrowedBlockHtml"]) {
      const i2 = t.indexOf(`function ${f}(`);
      if (i2 < 0) continue;
      const o = t.indexOf("{", i2);
      let d = 0, end = o;
      for (let k = o; k < t.length; k++) {
        if (t[k] === "{") d++;
        else if (t[k] === "}") { d--; if (!d) { end = k + 1; break; } }
      }
      t = t.slice(0, i2) + " ".repeat(end - i2) + t.slice(end);
    }
    return t;
  })();
  for (const c of OWN) {
    if (new RegExp(`class="[^"]*\\b${c}\\b`).test(mine)) {
      diffs.push(`the class "${c}" is also emitted elsewhere in admin.js — these blocks' CSS comes `
        + `later in the stylesheet, so it silently restyles that other component`);
    }
    const defs = (CSS.match(new RegExp(`(^|\\n)\\.${c}\\s*\\{`, "g")) || []).length;
    if (defs > 1) {
      diffs.push(`".${c}" is declared ${defs} times in admin.css — the later rule wins, and whichever `
        + `component did not expect it is the one that breaks`);
    }
  }
}

const PROPS = ["display", "gridTemplateColumns", "backgroundColor", "color", "fontSize", "fontWeight",
  "textAlign", "borderRadius", "fontVariantNumeric", "paddingTop", "paddingLeft"];

const PAIRS = [
  ["the surface row",        ".ob-crow",            ".row"],
  ["a map-pack badge",       ".ob-crow .surf.pack", ".surf.pack"],
  ["a page badge",           ".ob-crow .surf.page", ".surf.page"],
  ["the cost figure",        ".ob-crow .v",         ".row .v"],
  ["the split bar",          ".ob-split",           ".split"],
  ["the legend",             ".ob-legend",          ".legend"],
  ["a sub-location row",     ".ob-subloc",          ".place"],
  ["a sub-location pill",    ".ob-subloc .pill",     ".place .pill"],
  ["the verified tick",      ".ob-subloc .tick",     ".place .tick"],
  ["a context row",          ".ob-ctx-row",         ".ctx-row"],
  ["a context label",        ".ob-ctx-row .k",      ".ctx-row .k"],
  ["a context tag",          ".ob-ctx-row .tag",    ".ctx-row .tag"],
  // 🔴 THE FOLD ITSELF, because it is the FALLBACK path — every draft stored before these blocks
  // shipped still renders its notes as paragraphs inside it. `.ob-note` was declared TWICE in
  // admin.css (this fold, and a bordered note box 50 lines later that sets its own size and ink),
  // and source order handed the box's text styles to the fold. My blocks state their own colour so
  // they survived it; the paragraphs inside the fold did not, and nothing was watching.
  // → feedback_fix_the_class_not_the_instance
  ["the notes fold",         "details.ob-note",     "details.note"],
];

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴🔴 THE SAME THREE PLACES RENDERED TWICE ON ONE CARD (2026-10-06). The draft's own LOCATIONS list
// printed them with the model's reason, and the new SUB-LOCATIONS block printed them again with the
// type and reach. I had attached the verification to a COPY of the thing instead of to the thing —
// which is the exact mistake this whole design set out to fix.
// 🔑 ONE LIST, CARRYING BOTH: the reason is the strategy, the type and reach are the evidence.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
{
  const code3 = fs.readFileSync(`${SITE}/admin/admin.js`, "utf8")
    .replace(/^[ \t]*\/\/.*$/gm, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
  if (!/obPlaceEvidenceHtml\(verified\.get\(/.test(code3)) {
    diffs.push("the draft's own location rows do not carry the verification — so it can only appear in "
      + "a second list, and the same places print twice on one card");
  }
  if (!/draftHasPlaces\s*\?\s*""\s*:\s*obPlacesBlockHtml\(/.test(code3)) {
    diffs.push("the standalone sub-location block renders even when the draft already lists those "
      + "places — the same three places twice");
  }
  if (!/function obVerifiedPlaces\(/.test(code3) || !/replace\(\/\[\^a-z0-9\]\+\/g/.test(code3)) {
    diffs.push("the verification is not matched to a place by a NORMALISED name — a client whose draft "
      + "capitalises or punctuates a place differently would silently lose its evidence");
  }
}

const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
try {
  const read = (page, sel) => page.evaluate((s, props) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const c = getComputedStyle(el);
    const o = {};
    for (const p of props) o[p] = c[p];
    return o;
  }, sel, PROPS);

  // 🔑 THE SHELL MUST MATCH, OR THE DIFF REPORTS THE HARNESS. The mockup's body sets a base font and
  // ink colour that every block inherits; a bare test page defaults to 16px and black, and the diff
  // then blames the design for a difference this gate introduced.
  // → feedback_the_harness_i_wrote_to_check_my_work_can_lie
  const SHELL = `margin:0;width:828px;color:#303030;`
    + `font:15px/1.55 "Inter",-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,Arial,sans-serif;`;
  const live = await browser.newPage();
  await live.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head>`
    + `<body style="${SHELL}"><div class="ob-wrap">${html}</div></body></html>`,
    { waitUntil: "load" });
  // the mockup's folded block is open by default there, so open ours too before measuring
  await live.evaluate(() => { document.querySelectorAll("details").forEach((d) => (d.open = true)); });

  const mockPage = await browser.newPage();
  await mockPage.setContent(MOCK, { waitUntil: "load" });
  await mockPage.evaluate(() => { document.querySelectorAll("details").forEach((d) => (d.open = true)); });

  let compared = 0;
  for (const [label, liveSel, mockSel] of PAIRS) {
    const a = await read(live, liveSel);
    const b = await read(mockPage, mockSel);
    if (!b) { diffs.push(`${label}: not present in the MOCKUP (${mockSel})`); continue; }
    if (!a) { diffs.push(`${label}: not rendered by the admin (${liveSel})`); continue; }
    for (const p of PROPS) {
      // 🔑 A `1fr` TRACK IS A PROPERTY OF THE CONTAINER, NOT OF THE DESIGN. Its computed pixel width
      // follows whatever the page is wide; only the FIXED tracks are a design decision.
      if (p === "gridTemplateColumns" && a[p] && b[p]) {
        const fixed = (t) => String(t).trim().split(/\s+/).slice(1).join(" ");
        if (fixed(a[p]) !== fixed(b[p])) {
          diffs.push(`${label} · fixed grid tracks: admin "${fixed(a[p])}" vs mockup "${fixed(b[p])}"`);
        } else compared++;
        continue;
      }
      if (a[p] !== b[p]) diffs.push(`${label} · ${p}: admin "${a[p]}" vs mockup "${b[p]}"`);
      else compared++;
    }
  }

  // 🔴 A GUARD AGAINST A BROKEN HARNESS THAT MUST NOT ALSO HIDE A BROKEN PRODUCT: if almost nothing
  // was found on either side, the selectors are wrong, not the design.
  if (diffs.filter((x) => /not present in the MOCKUP|not rendered by the admin/.test(x)).length >= PAIRS.length - 1) {
    console.error("⚠️  INDETERMINATE — almost no element matched on either side; re-pin the selectors.");
    process.exit(2);
  }

  if (diffs.length) {
    console.error("🔴 the step's measurement blocks have drifted from the approved mockup:");
    for (const d of diffs) console.error(`   · ${d}`);
    console.error(`\n   mockup: ${MOCKP}`);
    await browser.close();
    process.exit(1);
  }
  console.log(`✅ the surface, sub-location and narrowed blocks match the approved mockup — `
    + `${compared} computed properties identical across ${PAIRS.length} elements`);
} catch (e) {
  console.error(`⚠️  INDETERMINATE — the gate itself threw: ${e.message}`);
  await browser.close().catch(() => {});
  process.exit(2);
}
await browser.close();
