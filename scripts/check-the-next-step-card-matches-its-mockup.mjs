#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — THE PORTAL'S NEXT-STEP CARD HAS FOUR STATES, AND EACH MATCHES ITS APPROVED MOCKUP
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Chris, 2026-10-05: *"can we update the clients side card at top saying Your next step is to pick a
 * time for kickoff call, when the client did and now is waiting on RGA. so the card shoudl refelct
 * this."* And then: *"must match mockup exactly."*
 *
 * His dashboard said **Pick a time for your kickoff call** while the Setup page, on the same account,
 * showed **Requested · Thursday, October 8 at 11:30 AM**. Both branches were already written and
 * correct — this card was reading the LAGGING store, and had no "we could not check" state at all.
 *
 * 🔑 WHAT THIS PINS, as properties rather than spellings:
 *   1. Four states exist, and whose-move-it-is is carried by the STRIPE, the EYEBROW and the BUTTON
 *      WEIGHT together — all three, or a client reads "with RGA" in the amber of their own turn.
 *   2. The requested state names the time in a CHIP, and its sentence does NOT also name it.
 *   3. `kickoffFacts` puts UNKNOWN FIRST and lets the LEDGER beat the stamp.
 *   4. Every computed property of all four states matches the approved mockup.
 *
 * It lifts the REAL `buildPortalNextActionHtml` out of portal.js, renders its output against the REAL
 * portal.css, and diffs getComputedStyle against the mockup. Nothing here re-implements the markup.
 *
 * 🔴 A lift that cannot run is INDETERMINATE (exit 2), never a pass and never a product failure.
 * → feedback_a_gate_that_throws_is_not_a_gate_that_fails · feedback_how_design_work_gets_done_first_time
 *
 * Exit 0 pass · 1 the card drifted from its mockup · 2 could not run.
 */
import fs from "node:fs";
import vm from "node:vm";
import puppeteer from "puppeteer";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const JS = `${SITE}/portal/portal.js`;
const CSSP = `${SITE}/portal/portal.css`;
const MOCKP = `${SITE}/reports/mockups/portal_next_step_kickoff_states.html`;

for (const f of [JS, CSSP, MOCKP]) {
  if (!fs.existsSync(f)) { console.error(`⚠️  INDETERMINATE — missing ${f}`); process.exit(2); }
}
const src = fs.readFileSync(JS, "utf8");
const CSS = fs.readFileSync(CSSP, "utf8");
const MOCK = fs.readFileSync(MOCKP, "utf8");

const fail = [];

// ── 0 · THE DATA RULE, READ FROM THE SOURCE ─────────────────────────────────────────────────────
// 🔑 Pin the ORDER, not the words: unknown is tested before anything else, and a ledger answer is
// preferred to the stamp. Those two are the whole fix; the copy is cosmetic next to them.
{
  const facts = (() => {
    const m = src.match(/^function kickoffFacts\s*\(/m);
    if (!m) return null;
    const open = src.indexOf("{", src.indexOf(")", m.index));
    let d = 0;
    for (let i = open; i < src.length; i++) {
      if (src[i] === "{") d++;
      else if (src[i] === "}") { d--; if (!d) return src.slice(m.index, i + 1); }
    }
    return null;
  })();
  if (!facts) {
    console.error("⚠️  INDETERMINATE — kickoffFacts is gone or unbalanced; this gate cannot read the rule it exists to pin.");
    process.exit(2);
  }
  const code = facts.replace(/^\s*\/\/.*$/gm, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
  const iUnknown = code.search(/_kickoffUnknown\s*\.\s*has\s*\(/);
  const iLedger = code.search(/_kickoffMine\s*\.\s*get\s*\(/);
  const iStampReturn = code.lastIndexOf("return");
  if (iUnknown < 0) fail.push("kickoffFacts no longer consults _kickoffUnknown — a failed ledger lookup would read as 'you have not booked'");
  if (iLedger < 0) fail.push("kickoffFacts no longer consults the holds ledger — it is back to trusting the best-effort onboarding stamp");
  if (iUnknown >= 0 && iLedger >= 0 && iUnknown > iLedger) {
    fail.push("kickoffFacts checks the ledger BEFORE unknown — unknown must outrank every other reading");
  }
  if (iLedger >= 0 && iStampReturn >= 0 && iLedger > iStampReturn) {
    fail.push("the stamp fallback is returned before the ledger is consulted — the lagging store would win");
  }
  // 🔴 And UNKNOWN must be a POSITIVE flag, never inferred from an empty map — "has not loaded yet"
  // and "has no booking" look identical from the outside.
  if (!/status\s*!==\s*undefined/.test(code)) {
    fail.push("kickoffFacts no longer distinguishes 'the ledger answered' from 'the ledger has not answered' — an empty map would read as an answer");
  }
}

// ── 1 · THE REBUILD IS WIRED, AND NOT GATED BEHIND THE PILL ─────────────────────────────────────
// 🔴 A gate that only proves the refresher EXISTS is not a gate that it RUNS. The whole defect was a
// correct function nothing called for this surface. → feedback_a_gate_that_it_exists_is_not_a_gate_that_it_works
{
  const m = src.match(/^function markKickoffWaitingOnRga\s*\(/m);
  if (!m) {
    console.error("⚠️  INDETERMINATE — markKickoffWaitingOnRga is gone; cannot tell whether the banner is refreshed.");
    process.exit(2);
  }
  const open = src.indexOf("{", src.indexOf(")", m.index));
  let d = 0, end = -1;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") d++;
    else if (src[i] === "}") { d--; if (!d) { end = i + 1; break; } }
  }
  const body = src.slice(m.index, end);
  const iRefresh = body.search(/refreshKickoffNextStepBanner\s*\(/);
  const iEarlyReturn = body.search(/if\s*\(\s*!\s*pill\s*\)\s*return/);
  if (iRefresh < 0) {
    fail.push("the kickoff banner is never rebuilt when the ledger answers — it would stay frozen on its first-paint answer");
  } else if (iEarlyReturn >= 0 && iRefresh > iEarlyReturn) {
    fail.push("the banner rebuild sits AFTER the `if (!pill) return` — a surface with no pill would never get it");
  }
  if (!/function refreshKickoffNextStepBanner\s*\(/.test(src)) {
    fail.push("refreshKickoffNextStepBanner is called but not defined");
  }
  // 🔴 The refresher must stay NARROW. Rebuilding every stage re-runs the contract branch with the
  // empty `contracts` array, and a stage-1 client loses "Contract signed — awaiting RGA review".
  const rm = src.match(/function refreshKickoffNextStepBanner[\s\S]{0,1200}/);
  if (rm && !/stage_4_onboarding/.test(rm[0])) {
    fail.push("the kickoff refresher no longer scopes itself to stage_4 banners — it would rebuild other stages from incomplete inputs");
  }
}

// ── 2 · LIFT THE REAL RENDERER ──────────────────────────────────────────────────────────────────
function lift(name) {
  const m = src.match(new RegExp(`^function ${name}\\s*\\(`, "m"));
  if (!m) throw new Error(`cannot find function ${name}`);
  // 🔴 NOT THE FIRST `{`. `kickoffPhase({ … } = {})` opens with a DESTRUCTURING brace that closes
  // immediately; matching from there lifts two words and every assertion fails against code it never
  // read. Walk the parameter list to its closing paren first.
  const lp = src.indexOf("(", m.index);
  let pd = 0, afterParams = -1;
  for (let i = lp; i < src.length; i++) {
    if (src[i] === "(") pd++;
    else if (src[i] === ")") { pd--; if (!pd) { afterParams = i + 1; break; } }
  }
  if (afterParams < 0) throw new Error(`unbalanced parameter list for ${name}`);
  const open = src.indexOf("{", afterParams);
  let d = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") d++;
    else if (src[i] === "}") { d--; if (!d) return src.slice(m.index, i + 1); }
  }
  throw new Error(`unbalanced body for ${name}`);
}

const SVC = `[
  { key: "gbp", name: "Business Profile", why: "x", detect: () => true },
  { key: "ga4", name: "Analytics", why: "x", detect: () => true },
  { key: "gsc", name: "Search Console", why: "x", detect: () => true },
  { key: "youtube", name: "YouTube", why: "x", detect: () => true },
]`;
const prelude = `
const _nextStepBannerInputs = new Map();
const _kickoffMine = new Map(), _kickoffWhen = new Map(), _kickoffUnknown = new Set(), _kickoffTz = new Map();
const PORTAL_GOOGLE_SERVICES = ${SVC};
function escapeHtml(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
function escapeAttribute(s){return escapeHtml(s);}
`;
const ctx = { console };
vm.createContext(ctx);
try {
  const parts = ["buildPortalNextActionHtml", "kickoffFacts", "kickoffPhase", "countSetupGaps", "svcSetupState"].map(lift);
  vm.runInContext(`${prelude}\n${parts.join("\n\n")}\n`
    + `globalThis.B=buildPortalNextActionHtml;globalThis.M=_kickoffMine;`
    + `globalThis.W=_kickoffWhen;globalThis.U=_kickoffUnknown;globalThis.TZ=_kickoffTz;`, ctx);
} catch (e) {
  console.error(`⚠️  INDETERMINATE — could not lift the renderer: ${e.message}`);
  console.error("   The dependency set changed. Fix the lift, do not assume the product broke.");
  process.exit(2);
}

const ISO = "2026-10-08T18:30:00.000Z";          // Thu Oct 8, 11:30 AM Los Angeles
const CID = "gate-client";
ctx.TZ.set(CID, "America/Los_Angeles");
const stamp = { data: { kickoff_invite: { requested_start: ISO } } };
const booked = { data: { kickoff_invite: { event_id: "e1", start: ISO } } };

function render(setup, onboarding) {
  ctx.M.clear(); ctx.W.clear(); ctx.U.clear();
  setup();
  return ctx.B("stage_4_onboarding", {}, onboarding, [], CID, "active", "brand");
}
const STATES = {
  none: render(() => {}, { data: {} }),
  waiting: render(() => {
    ctx.M.set(CID, "requested");
    ctx.W.set(CID, { startMs: new Date(ISO).getTime(), mins: 30, recapSentAt: null });
  }, stamp),
  event: render(() => {
    ctx.M.set(CID, "booked");
    ctx.W.set(CID, { startMs: new Date(ISO).getTime(), mins: 30, recapSentAt: null });
  }, booked),
  unknown: render(() => { ctx.U.add(CID); }, stamp),
};

if (!STATES.none || !STATES.waiting || !STATES.unknown) {
  console.error("⚠️  INDETERMINATE — the renderer returned nothing for a state the gate must measure.");
  process.exit(2);
}

// ── 3 · THE STRUCTURAL CLAIMS, BEFORE ANY PIXEL ─────────────────────────────────────────────────
// 🔑 Whose move it is must be carried by all THREE signals. Pinned per state as a set, so a future
// tone can be added without this gate reading it as a removal.
const WANT = {
  none:    { cls: null,          btn: "brand", eyebrow: /your next step/i },
  waiting: { cls: "is-waiting",  btn: "sec",   eyebrow: /waiting on rga/i },
  event:   { cls: "is-event",    btn: "brand", eyebrow: /next up/i },
  unknown: { cls: "is-unknown",  btn: "sec",   eyebrow: /couldn.t check/i },
};
for (const [name, w] of Object.entries(WANT)) {
  const html = STATES[name];
  if (w.cls && !html.includes(w.cls)) fail.push(`the "${name}" state no longer carries .${w.cls} — its stripe would read as another state`);
  if (w.cls === null && /is-waiting|is-unknown|is-event/.test(html)) fail.push(`the "${name}" state picked up a tone class it should not have`);
  const m = html.match(/class="pm-btn ([a-z]+)"/);
  if (!m) fail.push(`the "${name}" state has no button — the escape hatch must stay in every state`);
  else if (m[1] !== w.btn) fail.push(`the "${name}" state's button is "${m[1]}", expected "${w.btn}" — the weight says whose move it is`);
  const e = html.match(/class="eyebrow">([^<]*)</);
  if (!e) fail.push(`the "${name}" state has no eyebrow`);
  else if (!w.eyebrow.test(e[1])) fail.push(`the "${name}" state's eyebrow reads "${e[1]}", which does not match ${w.eyebrow}`);
}
// 🔴 ONE COPY OF ONE FACT. The chip carries the time, so the sentence must not name it too.
{
  const html = STATES.waiting;
  if (!/class="pm-nextstep-when"/.test(html)) fail.push("the requested state no longer shows the time in a chip");
  if (!/Requested/.test(html)) fail.push("the chip no longer labels the time as Requested");
  if (!/October 8/.test(html)) fail.push("the chip does not carry the requested time");
  const desc = (html.match(/data-nextstep-desc>([^<]*)</) || ["", ""])[1];
  if (/October|11:30|Thursday/.test(desc)) {
    fail.push("the requested state names the time in BOTH the sentence and the chip — two copies of one fact will drift");
  }
  // 🔴 And it must come from the LEDGER even when the stamp is missing entirely — that is the defect.
  const noStamp = render(() => {
    ctx.M.set(CID, "requested");
    ctx.W.set(CID, { startMs: new Date(ISO).getTime(), mins: 30, recapSentAt: null });
  }, { data: {} });
  if (/Pick a time/.test(noStamp)) {
    fail.push("with a hold in the ledger but NO onboarding stamp, the card still says 'Pick a time' — this is the exact defect Chris reported");
  }
  // 🔴 AND A HOLD WE CANNOT PUT A TIME ON IS STILL A HOLD. `_kickoffWhen` is cleared while the picker
  // is open over a standing hold; with no stamp either, there is no instant ANYWHERE — and the card
  // used to fall all the way through to "Pick a time" while the ledger said "requested".
  const noTime = render(() => { ctx.M.set(CID, "requested"); }, { data: {} });
  if (/Pick a time/.test(noTime)) {
    fail.push("a ledger hold with no resolvable time renders as 'Pick a time' — not knowing WHEN is never a reason to ask for a time again");
  }
  if (!/Waiting on RGA/.test(noTime)) {
    fail.push("a ledger hold with no resolvable time does not say it is waiting on RGA");
  }
  if (/class="pm-nextstep-when"/.test(noTime)) {
    fail.push("a ledger hold with no resolvable time renders an empty time chip");
  }
  // 🔴 And a BOOKED ledger hold with no instant must not read as a request either.
  const bookedNoTime = render(() => { ctx.M.set(CID, "booked"); }, { data: {} });
  if (/Waiting on RGA|Pick a time/.test(bookedNoTime)) {
    fail.push("a BOOKED ledger hold with no resolvable time reads as requested or unbooked");
  }
}
// 🔴 A chipless state must render NO empty chip box.
for (const n of ["none", "unknown"]) {
  if (/class="pm-nextstep-when"/.test(STATES[n])) fail.push(`the "${n}" state renders a time chip with no time in it`);
}

// ── 4 · THE RENDER DIFF ─────────────────────────────────────────────────────────────────────────
let browser;
try { browser = await puppeteer.launch({ headless: "new" }); }
catch (e) { console.error(`⚠️  INDETERMINATE — no browser: ${e.message}`); process.exit(2); }

const PROPS = ["backgroundColor", "borderLeftWidth", "borderLeftStyle", "borderLeftColor",
  "borderTopWidth", "borderTopColor", "borderRadius", "boxShadow", "padding",
  "fontSize", "fontWeight", "lineHeight", "color", "letterSpacing", "textTransform",
  "display", "alignItems", "justifyContent", "gap", "minHeight", "marginTop"];

const read = (page, sel) => page.evaluate((s, props) => {
  const el = document.querySelector(s);
  if (!el) return null;
  const c = getComputedStyle(el);
  const o = {};
  for (const p of props) o[p] = c[p];
  return o;
}, sel, PROPS);

// 🔴 THE SAME VIEWPORT ON BOTH PAGES, AND WIDE ENOUGH TO CLEAR THE BREAKPOINT. The first run of this
// gate reported 12 "differences" in alignItems and fontSize that were entirely its own: the default
// 800px viewport put the LIVE card inside portal.css's 860px media query, so a stacked card was being
// compared against a row. A harness that measures two different layouts reports drift that is not
// there. → feedback_the_harness_i_wrote_to_check_my_work_can_lie
const VIEW = { width: 1200, height: 900 };

const live = await browser.newPage();
await live.setViewport(VIEW);
await live.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head>`
  + `<body style="padding:24px">${STATES.none}${STATES.waiting}${STATES.event}${STATES.unknown}</body></html>`,
  { waitUntil: "load" });

const mockPage = await browser.newPage();
await mockPage.setViewport(VIEW);
await mockPage.setContent(MOCK, { waitUntil: "load" });

// The mockup lays the four proposed states out in order after the "on screen now" example, so the
// LIVE nth card maps to the mockup's (n+1)th .pm-nextstep.
const PAIRS = [
  ["card · nothing picked",  ".pm-nextstep:nth-of-type(1)",                ".pm-nextstep:nth-of-type(2)"],
  ["card · requested",       ".pm-nextstep.is-waiting",                    ".pm-nextstep.is-waiting"],
  ["card · confirmed",       ".pm-nextstep.is-event",                      ".pm-nextstep.is-event"],
  ["card · couldn't check",  ".pm-nextstep.is-unknown",                    ".pm-nextstep.is-unknown"],
  ["eyebrow · requested",    ".pm-nextstep.is-waiting .eyebrow",           ".pm-nextstep.is-waiting .eyebrow"],
  ["eyebrow · confirmed",    ".pm-nextstep.is-event .eyebrow",             ".pm-nextstep.is-event .eyebrow"],
  ["eyebrow · unknown",      ".pm-nextstep.is-unknown .eyebrow",           ".pm-nextstep.is-unknown .eyebrow"],
  ["title · requested",      ".pm-nextstep.is-waiting h3",                 ".pm-nextstep.is-waiting h3"],
  ["body · requested",       ".pm-nextstep.is-waiting p",                  ".pm-nextstep.is-waiting p"],
  ["chip",                   ".pm-nextstep-when",                          ".pm-nextstep-when"],
  ["chip pill",              ".pm-nextstep-when .st",                      ".pm-nextstep-when .st"],
  ["chip time",              ".pm-nextstep-when b",                        ".pm-nextstep-when b"],
  ["button · ghost",         ".pm-nextstep.is-waiting .pm-btn",            ".pm-nextstep.is-waiting .pm-btn"],
  ["button · filled",        ".pm-nextstep:nth-of-type(1) .pm-btn",        ".pm-nextstep:nth-of-type(2) .pm-btn"],
];

const diffs = [];
for (const [label, liveSel, mockSel] of PAIRS) {
  const a = await read(live, liveSel);
  const b = await read(mockPage, mockSel);
  if (!a) { diffs.push(`${label}: not present in the LIVE render (${liveSel})`); continue; }
  if (!b) { diffs.push(`${label}: not present in the MOCKUP (${mockSel})`); continue; }
  for (const p of PROPS) {
    if (a[p] !== b[p]) diffs.push(`${label} · ${p}: live "${a[p]}" vs mockup "${b[p]}"`);
  }
}
await browser.close();

// 🔴 A selector that matched nothing on BOTH sides is a harness failure dressed as a pass.
if (diffs.filter((d) => /not present in the MOCKUP/.test(d)).length >= PAIRS.length - 1) {
  console.error("⚠️  INDETERMINATE — almost nothing matched in the mockup; the gate is reading the wrong file or the wrong selectors.");
  process.exit(2);
}

if (diffs.length) fail.push(...diffs.map((d) => `render diff — ${d}`));

if (fail.length) {
  console.error("🔴 the portal's next-step card does not match its approved mockup:");
  for (const f of fail) console.error("   · " + f);
  console.error(`\n   mockup: ${MOCKP}`);
  process.exit(1);
}
console.log("✅ four states, each carrying stripe + eyebrow + button weight together; the ledger beats the stamp, unknown outranks both, and every rendered property matches the mockup");
