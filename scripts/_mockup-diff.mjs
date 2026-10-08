// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// DIFF A LIVE RENDER AGAINST ITS APPROVED MOCKUP, PROPERTY BY PROPERTY.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴🔴 Step 4 of feedback_how_design_work_gets_done_first_time, and the step I kept skipping. A COUNT
// IS NOT A DIFF: rendering a component and checking it has three rows proves nothing about surface,
// size, colour or spacing.
//
// 🔴🔴🔴 WHICH PROPERTIES COUNT IS READ OFF THE CSS, NOT CHOSEN BY ME.
//
// The run strip's first honest diff was three properties — `fontSize` 15px vs 14.5px and `color`
// #303030 vs #3D434B — and every one was INHERITED: the mockup declared neither on either element,
// and no visible text read them. They differed only because a mockup is a standalone page whose
// `body` differs from the admin's card body.
//
// The tempting fix was to delete `color` and `fontSize` from the list. That is how a gate stops
// being able to fail: the next REAL colour difference is excused by the same line.
//
// So the comparison set is derived, per element, as the UNION of what each side DECLARES:
//   · declared in the mockup, wrong live    → the design was not built          🔴
//   · declared live, never asked for        → the build invented something      🔴
//   · declared in neither (pure inheritance) → the host page's business, not a design decision
// The day a mockup pins `color` on a wrapper, every gate using this starts checking it with no edit.
// → feedback_a_chosen_property_list_is_a_claim_about_what_i_looked_at
// → feedback_a_gate_must_pin_the_property_not_the_spelling

// 🔑 THE PROPERTIES A READER ACTUALLY SEES. Not all 340 — a diff of everything is noise nobody
// reads, and noise is how a real difference gets skipped.
// 🔴 `gridTemplateColumns` AND `alignItems` WERE MISSING, and a mutation found it: changing the
// approved two-column list to ONE column was NOT CAUGHT, because the gate compared `display:grid`
// and never the thing that makes a grid a grid. The same shape as the border-radius shorthand miss
// — a property nobody listed is a property nobody checks.
// → feedback_a_chosen_property_list_is_a_claim_about_what_i_looked_at
export const PROPS = ["display", "gridTemplateColumns", "flexBasis", "flexGrow", "flexWrap",
  "alignItems", "gap", "paddingTop", "paddingBottom",
  "paddingLeft", "marginTop", "marginBottom",
  "borderTopStyle", "borderTopWidth", "borderBottomStyle", "borderBottomWidth",
  "fontSize", "fontWeight", "letterSpacing", "textTransform", "color", "backgroundColor",
  "borderRadius", "maxWidth", "height"];

// Walks the page's own stylesheets and returns every property DECLARED on the first element
// matching `sel` — shorthands expand to longhands, which is what the CSSOM enumerates.
const DECLARED = `(sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const out = new Set();
  const walk = (r) => {
    if (r.media) {
      let on = true;
      try { on = window.matchMedia(r.conditionText || r.media.mediaText).matches; } catch { on = true; }
      if (on) for (const x of r.cssRules) walk(x);
      return;
    }
    if (r.cssRules && !r.selectorText) { for (const x of r.cssRules) walk(x); return; }
    if (!r.selectorText || !r.style) return;
    const hit = r.selectorText.split(",").some((t) => { try { return el.matches(t.trim()); } catch { return false; } });
    if (!hit) return;
    for (let i = 0; i < r.style.length; i++) out.add(r.style[i]);
  };
  for (const sheet of document.styleSheets) {
    let rules; try { rules = sheet.cssRules; } catch { continue; }   // a cross-origin sheet is unreadable
    for (const r of rules) walk(r);
  }
  // 🔴🔴 A SHORTHAND IS ENUMERATED AS ITS LONGHANDS, AND THE SHORTHAND NAME NEVER APPEARS.
  // 'border-radius: 9px' puts border-top-left-radius … border-bottom-left-radius into rule.style
  // and NOT "border-radius", so a comparison set keyed on "borderRadius" never contained it and the
  // corner radius was never compared at all. Found by a mutation that changed 9px to 3px and was
  // NOT CAUGHT — which is the entire reason these suites exist.
  // Map the longhands back to the shorthand the comparison asks about.
  const GROUPS = {
    "border-radius": ["border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius"],
    "gap": ["row-gap", "column-gap"],
    "flex-basis": ["flex-basis"], "flex-grow": ["flex-grow"],
  };
  for (const [short, longs] of Object.entries(GROUPS)) {
    if (longs.some((l) => out.has(l))) out.add(short);
  }
  return [...out];
}`;

const camel = (k) => k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

export const declaredOn = async (page, sel) => {
  const list = await page.evaluate(`(${DECLARED})(${JSON.stringify(sel)})`);
  return list === null ? null : new Set(list.map(camel));
};

export const readProps = async (page, sel, props = PROPS) => page.evaluate((s, ps) => {
  const el = document.querySelector(s);
  if (!el) return null;
  const cs = getComputedStyle(el);
  const out = {};
  for (const p of ps) out[p] = cs[p];
  return out;
}, sel, props);

/**
 * `pairs` is [name, mockSelector, liveSelector][] — ONE table, both selectors.
 *
 * 🔑 Two parallel object literals let a pair drift apart silently: the run strip's live chip was
 * read as `.ob-hrun .delta` against the mockup's `.delta.up`, so a FLAT chip live was compared with
 * an UP chip in the design and only the skipped colours hid it.
 *
 * Returns { diffs, compared, inherited, missingInMock } — the CALLER decides what is fatal, because
 * "the mockup has no such element" is an INDETERMINATE (the gate's premise moved), while "the live
 * card has no such element" is a real defect.
 */
// 🔴🔴 A GRID'S COLUMNS RESOLVE TO PIXELS, AND PIXELS ARE THE CONTAINER'S WIDTH, NOT THE DESIGN.
// `1fr 1fr` computes to "382.5px 382.5px" in a 1040px mockup and "294.5px 294.5px" in the admin
// card. Comparing those strings reports a difference on a design that matches perfectly — while
// comparing nothing at all (the first version) let a two-column list become one column uncaught.
//
// 🔑 SO COMPARE THE STRUCTURE THE DESIGNER CHOSE: how many tracks, and their ratio. Two equal
// columns stay equal at any width; one column is a different answer at every width.
const normalize = (prop, value) => {
  if (prop !== "gridTemplateColumns" || typeof value !== "string") return value;
  const t = value.trim().split(/\s+/).map((x) => parseFloat(x)).filter((x) => Number.isFinite(x));
  if (!t.length) return value;                       // "none", "auto", a named-line template
  const min = Math.min(...t);
  return `${t.length} track(s) ${t.map((x) => (x / min).toFixed(2)).join(":")}`;
};

export async function comparePairs(mockPage, livePage, pairs, props = PROPS) {
  const diffs = [], missingInMock = [];
  let compared = 0, inherited = 0;
  for (const [part, mockSel, liveSel] of pairs) {
    const w = await readProps(mockPage, mockSel, props);
    if (!w) { missingInMock.push(`${part} (${mockSel})`); continue; }
    const g = await readProps(livePage, liveSel, props);
    if (!g) { diffs.push(`${part}: missing from the live render entirely (${liveSel})`); continue; }

    const dm = await declaredOn(mockPage, mockSel);
    const dl = await declaredOn(livePage, liveSel);
    const check = props.filter((p) => dm.has(p) || dl.has(p));
    inherited += props.length - check.length;
    compared += check.length;
    for (const p of check) {
      if (normalize(p, w[p]) !== normalize(p, g[p])) {
        const who = dm.has(p)
          ? (dl.has(p) ? "both declare it" : "the mockup declares it, the build does not")
          : "the build declares it, the mockup never asked for it";
        diffs.push(`${part}.${p}: mockup ${w[p]} · live ${g[p]}  (${who})`);
      }
    }
  }
  return { diffs, compared, inherited, missingInMock };
}
