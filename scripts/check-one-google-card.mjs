#!/usr/bin/env node
// check-one-google-card.mjs — every Google step draws ONE card, in the portal AND in admin, in the approved format
// (google_card_best_v1 + admin_google_card_v1, 2026-10-16): the STATE is the card's light tint + a thin border in its colour
// (green ok · blue rga · amber you · grey wait) — never a thick edge inside the step; ONE status line with a DRAWN icon
// (never a text glyph); the title; content; "why"; proof last; the card's buttons UNDER it. Drawn for real in a browser
// with the real CSS, every state, both sides — and the two sides must compute the same colours. Admin's Google rows take
// their card's state too: the marker (drawn icon), the pill and the outline.
//
// 🔒 WHY. 10-16: Chris compared two cards and picked the tinted one ("Option B"), then approved my refinement of it "for
// all", then the admin version, then: "the blue and grey icons need work" (⏱ and ↻ were text glyphs: an emoji and an
// off-centre arrow), and "whats this white circle" (the admin row marker said nothing about its card).
// (Before 10-16 this gate enforced one_google_card_v1: white inside, never tinted. That format was replaced.)
// 2026-10-30 night fixer: every portal Google step drawn here is a client card system step (old 6/7/9/10/11 = client 2/4/7/9/8), so the
// portal side is measured as the SYSTEM card inside a .pm-cs row (its CSS is row-scoped) after the seat passes: tone, thin border in the
// tone's line, the band's tint + ink + drawn state icon (client_card_system_v1 tokens), rows white, Maps in the foot, buttons under.
import fs from "node:fs";
import { planCardKit } from "./lib/plan-card-kit.mjs";
import { csBlock } from "./lib/portal-cs.mjs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = []; const fail = (m) => F.push(m);
const portal = read("portal/portal.js"), pcss = read("portal/portal.css"), admin = read("admin/admin.js"), acss = read("admin/admin.css");
const strip = (s) => s.replace(/^[ \t]*\/\/.*$/gm, "");
// 🔑 start at the BODY's brace (") {"): a default parameter like `opts = {}` has braces of its own
const picker = (src) => (re) => { const m = re.exec(src); if (!m) return ""; let d = 0; for (let k = src.indexOf(") {", m.index) + 2; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) return src.slice(m.index, k + 1); } } return ""; };
const liner = (src) => (n) => (new RegExp(`^const ${n} = .*;$`, "m").exec(src) || [""])[0];
const pp = picker(portal), pl = liner(portal), ap = picker(admin), al = liner(admin);

// ── 1 · one producer, every Google renderer draws through it ──
if ((portal.match(/^function googleCardHtml\(/gm) || []).length !== 1) fail("the portal has no single googleCardHtml");
const push = strip(pp(/^function gbpPushHtml\(/m)), hours = strip(pp(/^function hoursCardHtml\(/m)), gv = strip(pp(/^function gvProfileHtml\(/m));
if (!push || !hours || !gv) { console.error("⚠️  INDETERMINATE — a Google card renderer moved"); process.exit(2); }
if (/class="(?:tl2|pm-turned|pm-hc"|pm-gv-obj)/.test(push + hours + gv) || !/^const GC_ICON = \{ ok: `<svg[^`]*`, you: `<svg[^`]*`, rga: `<svg[^`]*`, wait: `<svg[^`]*` \};$/m.test(portal) || !/^const G_ICON = \{ ok: `<svg[^`]*`, you: `<svg[^`]*`, rga: `<svg[^`]*`, wait: `<svg[^`]*` \};$/m.test(admin)) fail("a state icon isn't drawn (a text glyph renders as an emoji / off-centre), or a Google step draws its own card");
if (!/<\/div>\$\{act \? `<div class="gcard-act">\$\{act\}<\/div>` : ""\}`;/.test(portal) || !/<\/div>\$\{act \? `<div class="ob-gcard-act">\$\{act\}<\/div>` : ""\}`;/.test(admin)) fail("the card's buttons aren't UNDER the card");
if (false) fail("a Google step still draws its own card (tl2 / pm-turned / pm-hc / pm-gv-obj) instead of the shared one");
const facts2 = strip(pp(/^function factsCardV2\(/m) || "");
// 🔄 10-23 (approved steps_1_4_clean_v1): client step 4 (business on Google, factsCardV2) moved to THE PLAN CARD (pcCard — one band,
// rows with drawn marks, actions under); the other Google steps keep the shared Google card until their own redesign is approved
if ((push.match(/return googleCardHtml\(/g) || []).length < 2 || !/return `<div class="pm-k5">\$\{csCard\(\{ tone: "rga"/.test(facts2) || !/return `<div class="pm-k5">\$\{csCard\(\{ tone: "ok"/.test(facts2) || !/return factsCardV2\(step, taskState, g, opts\.move \|\| null\);/.test(push) || !/return `<div class="pm-k5">\$\{csCard\(\{ tone: "ok", head: appt \? "By appointment only, on Google" : "Your hours are on Google"/.test(hours) || !/return googleCardHtml\(/.test(gv) || !/if \(kind === "yes"\) \{[\s\S]{0,1200}return csCard\(\{ tone: "ok", head: "Verified by Google"/.test(gv)) fail("steps 6 / 9 / 10 / 11 don't all draw the shared Google card, or client steps 2 (verified) / 4 / 7 aren't the system card");
// 🔄 2026-10-29 (client_card_system_v1): client steps 2–9 draw the SYSTEM card (csCard) — the verified one never offers Check again,
// a Google "no" on a system step is the red card with the blue "Fix it" under it
{ const y = gv.slice(gv.indexOf('if (kind === "yes") {'), gv.indexOf('if (CS_STEPS.has("m1.gbp.verify"))'));
  if (!y || /data-step-recheck|Check again/.test(y)) fail("client step 2's verified card offers Check again (RGA re-checks every night)");
  if (!/if \(g\.state === "needs_client" && CS_STEPS\.has\(step\.id\)\) \{\s*return `<div class="pm-k5">\$\{csCard\(\{ tone: "bad",[^\n]*\n[^\n]*foot: csFoot\(\) \}\)\}\$\{pcActs\(`<button type="button" class="pm-commit" data-gcard-fix>Fix it<\/button>`\)\}<\/div>`;/.test(push)) fail("a Google \"no\" on a system step isn't the red card with the blue Fix it under it"); }
// 🔑 10-16 (step11_details_v1): 10 and 11 draw their own cards; their Change opens Editing (data-step-edit), never a write
if (!/const attrsCard = step\.id === "m1\.gbp\.attributes" && isDone && taskState\?\.google_push\?\.state === "on_google";/.test(portal) || !/const act = pcActs\(`<button type="button" class="pm-amend" data-step-edit="\$\{escapeAttribute\(step\.id\)\}">Change something<\/button>`\);/.test(portal) || !/&& !ownGoogleCard\n/.test(portal) || /gcardAct/.test(strip(portal))) fail("steps 10 / 11's Change isn't the card's own action (Editing, under the card)");
if (!/<div class="pm-row-actions"\$\{step\.id === "m1\.gbp\.verify" && isDone && !month2Only \? " hidden" : ""\}>/.test(portal)) fail("step 6's Check again / How verification works still sit under the card");
if (!/e\.target\.closest\("\[data-gcard-how\]"\)/.test(portal) || !/e\.target\.closest\("\[data-gcard-fix\]"\)/.test(portal)) fail("the card's How verification works / Fix it do nothing");
// the state is the TINT + a thin border, never a thick edge inside the step (two stripes)
if (!/^\.gcard \{[^}]*background:var\(--state-ok-bg\); border:1px solid var\(--state-ok-line\);/m.test(pcss) || !/^\.ob-gcard \{[^}]*background:var\(--state-ok-bg\); border:1px solid var\(--state-ok-line\);/m.test(acss) || /^\.(?:ob-)?gcard[^{]*\{[^}]*border-left:\s*4px/m.test(pcss + "\n" + acss)) fail("a Google card's state isn't its tint + thin border (or a thick edge is back inside the step)");
// admin rows say their card's state: one marker producer, the pill, the outline
if (!/const obMarker = \(num, kind, gs\) => gs\s*\? `<span class="ob-num g-\$\{gs\}">\$\{G_ICON\[gs\]\}<\/span>/.test(admin) || (admin.match(/data-g="\$\{gs[DAQ] \|\| ""\}"/g) || []).length !== 3 || !/^\.ob-step\[data-g="rga"\]/m.test(acss)) fail("admin's Google rows don't take their card's state (marker / pill / outline)");
if (!/return adminGoogleCardHtml\(\{ state: "you", small: "Changed on Google"/.test(admin) || !/data\.admin\.gstate === k/.test(admin)) fail("a change on Google, or the Your action card, isn't drawn in the Google format");
if (/^\.pm-hc \{/m.test(pcss) || /^\.pm-gv-obj/m.test(pcss)) fail("the old step-9 green card / step-6 card styles are back");
if ((pcss.match(/^\.gcard \{/gm) || []).length !== 1 || (acss.match(/^\.ob-gcard \{/gm) || []).length !== 1) fail("the Google card's class is styled in more than one place (grep a class before using it)");
// admin: every Google status branch is the card
if ((admin.match(/^function adminGoogleCardHtml\(/gm) || []).length !== 1) fail("admin has no single adminGoogleCardHtml");
const gseg = strip(admin.slice(admin.indexOf("    const gHtml = !g ? \"\""), admin.indexOf("    return `<div class=\"ob-in\"><p class=\"ob-in-head\">")));
if (!gseg || gseg.length > 6000) { console.error("⚠️  INDETERMINATE — admin's Google status moved"); process.exit(2); }
if (/ob-in-note/.test(gseg) || (gseg.match(/adminGoogleCardHtml\(/g) || []).length < 8) fail("admin's Google status isn't the Google card on every state (an ob-in-note line is back)");
if (!/if \(step\?\.flowId === "m1\.gbp\.verify" && task\?\.status === "done" && task\?\.detected\?\.verdict\) \{/.test(admin)) fail("admin's step 6 doesn't show the same Google card");

// ── 2 · drawn for real, both sides, every state ──
const pLift = [pp(/^function escapeHtml\(/m), pp(/^function escapeAttribute\(/m), pl("GOOGLE_G"), pl("GC_ICON"), pp(/^function googleCardHtml\(/m), pl("gcardMaps"), pl("GV_STORE"), pp(/^function gvProfileHtml\(/m),
  pl("_editingSteps"), pl("FACT_WORDS"), pl("siteShow"), pp(/^function factsSummary\(/m), pp(/^function fmtDateTimeDot\(/m), pp(/^function hoursCardHtml\(/m), pp(/^function hoursSummary\(/m), pl("placeName"), pp(/^function factsLocked\(/m), pp(/^function factsEditorHtml\(/m), pp(/^function factsCardV2\(/m), pp(/^function gbpPushHtml\(/m), pl("EDIT_IN_PLACE"), pl("BK_NOUN"), pp(/^function bookingCardHtml\(/m), pp(/^function attrsCardHtml\(/m), pp(/^function bookingFormHtml\(/m),
  pl("GBP_STEPS"), pl("GBP_THING"), pl("GBP_DAY"), pl("hm12"), pl("monthDay"),
  portal.slice(portal.indexOf("const PC_TICK = "), portal.indexOf("\n", portal.indexOf("const pcActs = "))), pl("KW_SPIN"), pl("GV_SHIELD")];
pLift.push(planCardKit(portal, pLift.join("\n")), pp(/^function svcCardHtml\(/m));
pLift.push(csBlock(portal, pLift.join("\n")));   // 10-29: the client card system (steps 2–9 draw csCard)   // 10-23: the plan card's shared pieces (steps_6_20_clean_v1)
pLift.push(pl("csCardOf"), pl("csFootOf"), pp(/^function upgradeCsCards\(/m), pp(/^function seatCsSt\(/m));   // 10-30: the seat passes the portal's observer runs
const aLift = [ap(/^function escapeHtml\(/m), ap(/^function escapeAttribute\(/m), al("OL_G"), al("G_ICON"), ap(/^function adminGoogleCardHtml\(/m), ap(/^function adminGcardWhen\(/m), ap(/^function adminGcardMaps\(/m)];
if (pLift.some((x) => !x) || aLift.some((x) => !x)) { console.error(`⚠️  INDETERMINATE — a helper moved (portal ${pLift.findIndex((x) => !x)}, admin ${aLift.findIndex((x) => !x)})`); process.exit(2); }
let puppeteer = null; try { ({ default: puppeteer } = await import("puppeteer")); } catch { puppeteer = null; }
if (!puppeteer) { console.error("⚠️  INDETERMINATE — puppeteer is missing"); process.exit(2); }
// the icon disc's colour (the state) and the card's tint (the state's -bg token)
const EDGE = { ok: "rgb(12, 81, 50)", rga: "rgb(36, 87, 230)", you: "rgb(180, 83, 9)", wait: "rgb(91, 107, 138)" };   // Chris 10-30: the waiting card is the client system's blue-grey in both portals
const TINT = { ok: "rgb(227, 241, 223)", rga: "rgb(235, 243, 255)", you: "rgb(255, 241, 227)", wait: "rgb(238, 241, 246)" };
const look = (sel) => [...document.querySelectorAll(sel)].map((c) => { const s = getComputedStyle(c), sm = c.querySelector(".gcard-st, .ob-gcard-st"), tiles = [...c.querySelectorAll(".pm-hc-day:not(.off), .pm-hc-hol")];
  return { cls: c.className, bg: s.backgroundColor, edge: s.borderLeftColor, edgeW: s.borderLeftWidth, head: sm ? getComputedStyle(sm).color : null, logo: !!c.querySelector("svg path[fill='#4285F4']"),
    tinted: tiles.filter((t) => { const b = getComputedStyle(t); return b.backgroundColor !== "rgb(255, 255, 255)" || /12, 81, 50|207, 230, 200/.test(b.borderColor); }).length,
    act: c.nextElementSibling && /(ob-)?gcard-act/.test(c.nextElementSibling.className) ? c.nextElementSibling.innerText.trim() : "", primary: !!(c.nextElementSibling && c.nextElementSibling.querySelector(".pm-commit")), icon: (() => { const ic = c.querySelector(".gcard-ic, .ob-gcard-ic"); return ic ? { bg: getComputedStyle(ic).backgroundColor, svg: !!ic.querySelector("svg path, svg circle"), text: ic.textContent.trim() } : null; })(), border: s.borderTopColor + " " + s.borderTopWidth + " " + s.borderLeftWidth, st: sm ? sm.innerText.replace(/\s+/g, " ").trim() : "", when: (c.querySelector(".gcard-when, .ob-gcard-when") || {}).innerText || "", whenUnderTitle: !!c.querySelector(".gcard-th > .gcard-t + .gcard-when, .ob-gcard-th > .ob-gcard-t + .ob-gcard-when"), meta: [...c.querySelectorAll(".gcard-st, .ob-gcard-st, .gcard-meta, .ob-gcard-meta, .gcard-proof, .ob-gcard-proof")].map((x) => x.innerText).join(" | ").replace(/\s+/g, " ").trim() }; });
const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
let P, A;
try {
  const page = await browser.newPage();
  await page.setContent("<html><body><div id=h></div></body></html>");
  await page.addStyleTag({ content: pcss });
  await page.addScriptTag({ content: pLift.join("\n") });
  P = await page.evaluate((lookSrc) => {
    const o = { open: "09:00", close: "18:00" }, days = { mon: o, tue: o, wed: o, thu: o, fri: o, sat: { closed: true }, sun: { closed: true } };
    const at = "2026-10-16T15:45:47Z", maps = "https://maps.google.com/?cid=1", f = { title: "Rocket Growth Agency", phone: "(424) 242-2040", mapsUri: maps };
    const cards = {
      "9 done": gbpPushHtml({ id: "m1.gbp.hours_attributes" }, { status: "done", client_input_at: at, google_push: { state: "on_google", at, after: days, special: { sent: [{ date: "2026-11-26", name: "Thanksgiving", yearly: true }] } } }, { maps }),
      // 🔑 10-16 (step10_booking_link_v1): step 10 draws its own Change link (Editing, no write); step 11's comes from the row
      "10 done": gbpPushHtml({ id: "m1.gbp.booking_link" }, { status: "done", google_push: { state: "on_google", at, after: ["https://calendly.com/x?utm_source=gbp"], link: "https://calendly.com/x", platform: "Calendly", link_type: "url_appointment" } }, { maps }),
      "11 done": gbpPushHtml({ id: "m1.gbp.attributes" }, { status: "done", google_push: { state: "on_google", at, after: ["a"], labels: { a: "Online appointments", b: "Appointment required" } } }, { maps }),
      "7 with RGA": gbpPushHtml({ id: "m1.gbp.business_facts" }, { status: "in_progress", google_push: { state: "with_rga", at, rga: [{ fact: "area", add: ["Mar Vista, CA", "Palms, CA"] }], maps_uri: maps } }),
      // 🔄 10-23 night: steps 7–9 done are plan cards now, so a plain Google card WITH a time keeps the "time under the title" rule tested
      "card with a time": googleCardHtml({ state: "ok", small: "On Google", side: "checked Oct 16", title: "A Google fact" }),
      "11 with RGA": gbpPushHtml({ id: "m1.gbp.attributes" }, { status: "in_progress", google_push: { state: "with_rga", error: "403" } }),
      "10 Google said": gbpPushHtml({ id: "m1.gbp.booking_link" }, { status: "pending", google_push: { state: "needs_client", said: "This link doesn't open.", fix: "Paste the public link." } }),
      "6 verified": gvProfileHtml(f, "yes", "✓ Verified by Google", [["Checked", "Oct 16, 6:03 AM"]]),
      "6 code": gvProfileHtml(f, "wait", "Waiting for your code", [["Way", "Code by text"]], { code: true }),
      "6 reviewing": gvProfileHtml(f, "wait", "Google is reviewing it", [["Way", "Video"]]),
      "6 not verified": gvProfileHtml(f, "no", "Not verified yet", [["On Maps", "Hidden until it's verified"]]),
    };
    // 🔑 2026-10-30: a system step's styles are scoped to its row (.pm-cs) — draw each card inside one, as the client sees it, then run the
    // seat passes the portal's observer runs (upgradeCsCards · seatCsSt). "card with a time" is the old shared card (non-system steps).
    const h = document.getElementById("h"); h.innerHTML = Object.entries(cards).map(([k, v]) => k === "card with a time" ? `<section data-k="${k}">${v}</section>` : `<section data-k="${k}"><div class="pm-step-row pm-cs">${v}</div></section>`).join("");
    upgradeCsCards(h); seatCsSt(h);
    const L = eval(`(${lookSrc})`);
    const out = Object.fromEntries([...h.querySelectorAll("section")].map((s) => [s.dataset.k, L.call(null, `section[data-k="${s.dataset.k}"] > .gcard`)[0] || null]));
    // the SYSTEM card (client_card_system_v1): the tone class, a white card with a thin border in the tone's line, the band in the tone's
    // tint + ink with a DRAWN state icon (never a topic icon / Google logo), rows that stay white, the status row, the foot, what's under it
    const t = (e) => (e ? e.innerText.replace(/\s+/g, " ").trim() : "");
    const csl = (k) => { const sec = h.querySelector(`section[data-k="${k}"]`), c = sec && sec.querySelector(".pm-cs-card"); if (!c) return null;
      const cs = getComputedStyle(c), b = c.querySelector(":scope > .pm-k5-h"), bs = b ? getComputedStyle(b) : null, ic = b && b.querySelector(":scope > svg"), st = c.querySelector(":scope > .pm-cs-st"), acts = c.nextElementSibling && c.nextElementSibling.matches(".pm-k5-acts") ? c.nextElementSibling : null;
      return { tone: ["ok", "rga", "you", "wait", "bad", "off"].filter((x) => c.classList.contains(x)).join(" "), bg: cs.backgroundColor, line: cs.borderTopColor, edgeW: cs.borderLeftWidth, topW: cs.borderTopWidth,
        band: bs && bs.backgroundColor, ink: bs && bs.color, icon: ic ? { svg: !!ic.querySelector("path, circle"), color: getComputedStyle(ic).color } : null, head: t(b && b.querySelector(":scope > b")), side: t(b && b.querySelector(":scope > span")),
        logo: !!c.querySelector("svg path[fill='#4285F4'], .gcard-logo, .gcard-g, .gcard-i"), typed: /[✓✔⏱↻]/.test(c.textContent),
        tinted: [...c.querySelectorAll(":scope > .pm-pc-f, :scope > .pm-cs-ev, :scope > .pm-cs-chips, :scope > .pm-cs-note")].filter((r) => !/^(rgba\(0, 0, 0, 0\)|rgb\(255, 255, 255\))$/.test(getComputedStyle(r).backgroundColor)).length,
        st: st ? { kind: ["rga", "you", "bad", "wait", "ok"].find((x) => st.classList.contains(x)) || "", b: t(st.querySelector("b")), svg: !!st.querySelector(":scope > svg path, :scope > svg circle") } : null,
        maps: [...c.querySelectorAll(":scope > .pm-cs-foot a.lk")].map((a) => a.getAttribute("href")).join("|"), mapsUnder: !!(acts && /Google Maps/.test(acts.textContent)),
        under: t(acts), primary: !!(acts && acts.querySelector(".pm-commit")), inCard: [...c.querySelectorAll("button")].map(t).filter((x) => !/^How this step works/.test(x)).join("|"),
        rgaChips: [...c.querySelectorAll(".pm-cs-chip.rga")].map(t), recheck: !!sec.querySelector("[data-step-recheck]") }; };
    out.__cs = Object.fromEntries(Object.keys(cards).filter((k) => k !== "card with a time").map((k) => [k, csl(k)]));
    return out;
  }, look.toString());
  const apage = await browser.newPage();
  await apage.setContent("<html><body><div id=h></div></body></html>");
  await apage.addStyleTag({ content: acss });
  await apage.addScriptTag({ content: `var state = { onboardingData: { tasks: { "m1.gbp.business_facts": { google_push: { maps_uri: "https://maps.google.com/?cid=1" } } } } };\n${aLift.join("\n")}` });
  A = await apage.evaluate((lookSrc) => {
    const h = document.getElementById("h");
    h.innerHTML = ["ok", "rga", "you", "wait"].map((st) => `<section data-k="${st}">${adminGoogleCardHtml({ state: st, small: "Heading", side: "checked Oct 16", title: "Title", proof: adminGcardMaps(), act: "<button class=\"admin-button\">Act</button>" })}</section>`).join("");
    const L = eval(`(${lookSrc})`);
    const cards = Object.fromEntries(["ok", "rga", "you", "wait"].map((k) => [k, L.call(null, `section[data-k="${k}"] > .ob-gcard`)[0] || null]));
    // 🔑 10-16: drawn INSIDE admin's own row markup — admin's .ob-step.queued / .active.is-wait marker rules and the input box's
    // link colour beat the first build (an orange ↻ marker, a pale ! marker, a blue button with invisible text)
    const rows = document.createElement("div");
    rows.innerHTML = [["queued", "you"], ["active", "rga"], ["active is-wait", "rga"], ["done", "ok"]].map(([cls, g]) => `<div class="ob-step ${cls}" data-g="${g}"><div class="ob-row"><span class="ob-num g-${g}">${G_ICON[g]}</span></div></div>`).join("")
      + `<div class="ob-in"><div class="ob-gcard-act"><a class="admin-button ob-gcard-go" href="#">Open Google Business Profile ↗</a></div></div>`;
    document.body.appendChild(rows);
    const mk = [...rows.querySelectorAll(".ob-num")].map((n) => getComputedStyle(n).backgroundColor);
    const go = rows.querySelector(".ob-gcard-go"), gs = getComputedStyle(go);
    return { ...cards, _rows: { markers: mk, goText: gs.color, goBg: gs.backgroundColor } };
  }, look.toString());
} finally { await browser.close(); }

// 🔄 2026-10-30 night fixer (client_card_system_v1 + client_step02/04/07/08/09, approved 10-29): every portal Google step in this gate is a
// SYSTEM step now (old 6 = client step 2 verify · old 7 = client step 4 facts · old 9 = client step 7 hours · old 10 = client step 9
// booking link · old 11 = client step 8 details), so "the shared Google card" on the portal is the system card. Same intent: the state is
// the tint + a thin border, a DRAWN state icon in the state's colour, rows stay white, buttons under the card. The tokens are the mockup's.
const CS_BAND = { ok: "rgb(227, 241, 223)", rga: "rgb(235, 243, 255)", you: "rgb(255, 241, 227)", wait: "rgb(238, 241, 246)", bad: "rgb(254, 233, 232)" };
const CS_INK = { ok: "rgb(12, 81, 50)", rga: "rgb(28, 68, 189)", you: "rgb(180, 83, 9)", wait: "rgb(91, 107, 138)", bad: "rgb(142, 11, 33)" };
const CS_LINE = { ok: "rgb(207, 230, 200)", rga: "rgb(207, 220, 251)", you: "rgb(240, 220, 196)", wait: "rgb(217, 223, 234)", bad: "rgb(243, 205, 201)" };
// mockup states: step 8 "RGA is on it" = rga · step 9 Google said no = bad ("A problem") · step 2 code / reviewing = wait · not verified = you
const want = { "11 with RGA": "rga", "10 Google said": "bad", "6 code": "wait", "6 reviewing": "wait", "6 not verified": "you" };
const MONTH = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d/;
const csCardOk = (k, c, st) => {
  if (!c) { fail(`portal "${k}" isn't the system card`); return false; }
  if (c.tone !== st) fail(`portal "${k}" isn't the ${st} card (${c.tone})`);
  if (c.bg !== "rgb(255, 255, 255)" || c.band !== CS_BAND[st]) fail(`portal "${k}" isn't the ${st} tint in its band on a white card (card ${c.bg}, band ${c.band})`);
  if (c.edgeW !== "1px" || c.topW !== "1px" || c.line !== CS_LINE[st]) fail(`portal "${k}" has a thick edge or a border not in the ${st} line (${c.edgeW} / ${c.topW} ${c.line}), not a thin border`);
  if (c.logo) fail(`portal "${k}" draws a Google logo / topic icon (the band carries the STATE icon only)`);
  if (!c.icon || !c.icon.svg || c.icon.color !== CS_INK[st] || c.typed) fail(`portal "${k}" state icon isn't the drawn ${st} icon (${JSON.stringify(c.icon)}${c.typed ? ", a typed glyph" : ""})`);
  if (c.ink !== CS_INK[st]) fail(`portal "${k}" band isn't the ${st} colour (${c.ink})`);
  if (c.tinted) fail(`portal "${k}" has ${c.tinted} tinted row(s) inside (what you read or pick stays white)`);
  // 🔒 10-20 (Chris, step 6 v2.1 → every card): the band's words say only WHAT IT IS; the time sits on its own (the band's right)
  if (MONTH.test(c.head) || /·\s*(?:checked|confirmed|last|saved|sent|built)\b/i.test(c.head)) fail(`portal "${k}" puts a time in its band's words ("${c.head}") — it goes on the band's right`);
  return true; };
{ const v6 = P.__cs["6 verified"];
  if (csCardOk("6 verified", v6, "ok") && (v6.head !== "Verified by Google" || !/^checked Oct 16\b/.test(v6.side) || v6.maps !== "https://maps.google.com/?cid=1" || v6.under || v6.inCard || v6.recheck)) fail(`client step 2 verified isn't "Verified by Google · checked <date>" with Maps in the foot and no Check again (RGA re-checks every night): ${JSON.stringify(v6)}`); }
{ const pc = P.__cs["7 with RGA"];
  // client_step04 "RGA is adding places": the blue card, RGA's adds as blue chips, one blue status row, Maps in the foot, Change something under
  if (csCardOk("7 with RGA", pc, "rga") && (pc.rgaChips.join("|") !== "Mar Vista|Palms" || pc.st?.kind !== "rga" || !pc.st.svg || pc.maps !== "https://maps.google.com/?cid=1" || pc.under !== "Change something" || pc.inCard)) fail(`client step 4's RGA card isn't right: RGA's adds as blue chips, a drawn blue status row, Maps in the foot, Change something under (${JSON.stringify(pc)})`); }
for (const [k, st] of Object.entries(want)) csCardOk(k, P.__cs[k], st);
// a time on the OLD shared card's status line (non-system steps keep that card)
for (const [k, c] of Object.entries(P)) if (c && c.st !== undefined && (MONTH.test(c.st) || /·\s*(?:checked|confirmed|last|saved|sent|built)\b/i.test(c.st))) fail(`portal "${k}" puts a time on its status line ("${c.st}") — it goes under the title`);
// client_step07 / 09 / 08 "Done · on Google": the green card, "<what> on Google · checked <date>", Maps in the foot, ONE "Change something" under the card
const DONE_WANT = { "9 done": /^Your hours are on Google$/, "10 done": /^Your booking link is on Google$/, "11 done": /^1 detail on Google$/ };
for (const [k, head] of Object.entries(DONE_WANT)) { const c = P.__cs[k];
  if (!csCardOk(k, c, "ok")) continue;
  if (!head.test(c.head) || !/^checked Oct 1[56]$/.test(c.side) || c.under !== "Change something" || c.inCard || c.maps !== "https://maps.google.com/?cid=1" || c.mapsUnder) fail(`portal "${k}" isn't "<what> · checked <date>" with Change something under the card and Maps in its foot (${c.head} · ${c.side} | ${c.under} | maps ${c.maps || "none"})`); }
// the shared Google card still draws on the steps not on the system: its Google logo stays
if (P["card with a time"] && !P["card with a time"].logo) fail("the shared Google card (steps not on the card system) has no Google logo");
if (!P["card with a time"] || !/^Last checked Oct 16\b/.test(P["card with a time"].when) || !P["card with a time"].whenUnderTitle) fail(`a Google card doesn't say "Last checked …" on its own line under the title ("${P["card with a time"]?.when}")`);
// a refusal: the blue Fix it, UNDER the card, and nothing else
{ const g = P.__cs["10 Google said"]; if (g && (g.under !== "Fix it" || !g.primary || g.inCard || g.st?.kind !== "bad")) fail(`a refusal's card has no blue Fix it under it, or no red status row (${g.under} · ${JSON.stringify(g.st)})`); }
if (A._rows) {
  const want4 = [EDGE.you, EDGE.rga, EDGE.rga, EDGE.ok];
  if (JSON.stringify(A._rows.markers) !== JSON.stringify(want4)) fail(`admin's Google row markers don't take their card's colour inside real rows (${A._rows.markers.join(" | ")})`);
  if (A._rows.goText === A._rows.goBg) fail(`the blue "Open Google Business Profile" button's text is the same colour as the button (${A._rows.goText})`);
}
for (const st of ["ok", "rga", "you", "wait"]) if (A[st] && (MONTH.test(A[st].st) || A[st].when !== "Last checked Oct 16" || !A[st].whenUnderTitle)) fail(`admin "${st}" card puts the time on its status line, or not on its own line under the title ("${A[st].st}" / "${A[st].when}")`);
for (const st of ["ok", "rga", "you", "wait"]) {
  const a = A[st];
  if (!a) { fail(`admin's ${st} card doesn't draw`); continue; }
  const p = Object.entries(want).find(([, s]) => s === st); const pc = p && P.__cs[p[0]];
  if (a.bg !== TINT[st] || a.edgeW !== "1px" || !a.logo || !a.icon || a.icon.bg !== EDGE[st] || !a.icon.svg || a.icon.text) fail(`admin's ${st} card isn't the portal's (bg ${a.bg}, edge ${a.edgeW}, icon ${JSON.stringify(a.icon)})`);
  // 🔄 10-30: the portal's card of the same state is the system card — the same state reads in the same colours on both sides:
  // admin's tint = the portal band's tint, admin's status colour = the portal band's ink, admin's border = the portal card's line
  if (pc && (a.bg !== pc.band || a.head !== pc.ink || a.border.split(" ").slice(0, 3).join(" ") !== pc.line)) fail(`admin's ${st} card differs from the portal's (tint ${a.bg} vs ${pc.band}; status ${a.head} vs ${pc.ink}; border ${a.border} vs ${pc.line})`);
  if (!/See it on Google Maps ↗/.test(a.meta) || a.act !== "Act") fail(`admin's ${st} card has no Maps proof, or its buttons aren't under it`);
}

if (F.length) { console.error("🔴 The Google steps aren't one card:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ one Google card on every Google step, portal and admin alike: the portal's system steps are the client_card_system_v1 card (tone, thin border, the band's tint + ink + drawn state icon, rows white, Maps in the foot, Change something / blue Fix it under the card), the other steps the shared Google card (google_card_best_v1); admin's card computes the same colours per state; admin rows take their card's state (marker, pill, outline), drift and Your action too");
