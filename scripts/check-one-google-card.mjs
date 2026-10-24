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
import fs from "node:fs";
import { planCardKit } from "./lib/plan-card-kit.mjs";

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
if ((push.match(/return googleCardHtml\(/g) || []).length < 2 || !/return `<div class="pm-k5">\$\{pcCard\(\{ tone: "rga"/.test(facts2) || !/return `<div class="pm-k5">\$\{pcCard\(\{ tone: "ok"/.test(facts2) || !/return factsCardV2\(step, taskState, g\);/.test(push) || !/return `<div class="pm-k5">\$\{pcCard\(\{ tone: "ok", icon: CLOSE_CAL_ICON, head: appt \? "By appointment only, on Google" : "Your hours are on Google"/.test(hours) || !/return googleCardHtml\(/.test(gv) || !/if \(kind === "yes"\) \{[\s\S]{0,600}return pcCard\(\{ tone: "ok", icon: GV_SHIELD, head: "Verified by Google"/.test(gv)) fail("steps 6 / 9 / 10 / 11 don't all draw the shared Google card, or client steps 2 (verified) / 4 aren't the plan card");
// 🔑 10-16 (step11_details_v1): 10 and 11 draw their own cards; their Change opens Editing (data-step-edit), never a write
if (!/const attrsCard = step\.id === "m1\.gbp\.attributes" && isDone && taskState\?\.google_push\?\.state === "on_google";/.test(portal) || !/const act = pcActs\(`<button type="button" class="pm-amend" data-step-edit="\$\{escapeAttribute\(step\.id\)\}">Change details<\/button>`\);/.test(portal) || !/&& !ownGoogleCard\n/.test(portal) || /gcardAct/.test(strip(portal))) fail("steps 10 / 11's Change isn't the card's own action (Editing, under the card)");
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
  pl("_editingSteps"), pl("FACT_WORDS"), pl("siteShow"), pp(/^function factsSummary\(/m), pp(/^function fmtDateTimeDot\(/m), pp(/^function hoursCardHtml\(/m), pp(/^function hoursSummary\(/m), pl("placeName"), pp(/^function factsCardV2\(/m), pp(/^function gbpPushHtml\(/m), pl("EDIT_IN_PLACE"), pl("BK_NOUN"), pp(/^function bookingCardHtml\(/m), pp(/^function attrsCardHtml\(/m), pp(/^function bookingFormHtml\(/m),
  pl("GBP_STEPS"), pl("GBP_THING"), pl("GBP_DAY"), pl("hm12"), pl("monthDay"),
  portal.slice(portal.indexOf("const PC_TICK = "), portal.indexOf("\n", portal.indexOf("const pcActs = "))), pl("KW_SPIN"), pl("GV_SHIELD")];
pLift.push(planCardKit(portal, pLift.join("\n")), pp(/^function svcCardHtml\(/m));   // 10-23: the plan card's shared pieces (steps_6_20_clean_v1)
const aLift = [ap(/^function escapeHtml\(/m), ap(/^function escapeAttribute\(/m), al("OL_G"), al("G_ICON"), ap(/^function adminGoogleCardHtml\(/m), ap(/^function adminGcardWhen\(/m), ap(/^function adminGcardMaps\(/m)];
if (pLift.some((x) => !x) || aLift.some((x) => !x)) { console.error(`⚠️  INDETERMINATE — a helper moved (portal ${pLift.findIndex((x) => !x)}, admin ${aLift.findIndex((x) => !x)})`); process.exit(2); }
let puppeteer = null; try { ({ default: puppeteer } = await import("puppeteer")); } catch { puppeteer = null; }
if (!puppeteer) { console.error("⚠️  INDETERMINATE — puppeteer is missing"); process.exit(2); }
// the icon disc's colour (the state) and the card's tint (the state's -bg token)
const EDGE = { ok: "rgb(12, 81, 50)", rga: "rgb(36, 87, 230)", you: "rgb(180, 83, 9)", wait: "rgb(144, 153, 168)" };
const TINT = { ok: "rgb(227, 241, 223)", rga: "rgb(235, 243, 255)", you: "rgb(255, 241, 227)", wait: "rgb(236, 237, 237)" };
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
    const h = document.getElementById("h"); h.innerHTML = Object.entries(cards).map(([k, v]) => `<section data-k="${k}">${v}</section>`).join("");
    const L = eval(`(${lookSrc})`);
    const out = Object.fromEntries([...h.querySelectorAll("section")].map((s) => [s.dataset.k, L.call(null, `section[data-k="${s.dataset.k}"] > .gcard`)[0] || null]));
    // the plan card (client step 4): a thin border, the band in the rga tint, drawn marks (no typed glyph), the buttons under it
    const pc = h.querySelector('section[data-k="7 with RGA"] .pm-k5-plan'), band = pc && pc.querySelector(".pm-k5-h");
    out.__plan = pc ? { edgeW: getComputedStyle(pc).borderLeftWidth, band: getComputedStyle(band).backgroundColor, marks: pc.querySelectorAll(".pm-pc-f .c svg").length,
      typed: /[✓✔]/.test([...pc.querySelectorAll(".pm-pc-f .c")].map((c) => c.textContent).join("")), actsUnder: !!h.querySelector('section[data-k="7 with RGA"] .pm-k5-plan + .pm-k5-acts .pm-amend') } : null;
    const v6 = h.querySelector('section[data-k="6 verified"] .pm-k5-plan'), b6 = v6 && v6.querySelector(".pm-k5-h");
    out.__v6 = v6 ? { edgeW: getComputedStyle(v6).borderLeftWidth, band: getComputedStyle(b6).backgroundColor, marks: v6.querySelectorAll(".pm-pc-f .c svg").length, typed: /[✓✔]/.test(b6.textContent), recheck: !!h.querySelector('section[data-k="6 verified"] [data-step-recheck]') } : null;
    // 🔄 10-23 night (approved steps_6_20_clean_v1): steps 7 / 9 / 8 done (old 9 / 10 / 11) are PLAN CARDS now — "No Google tile,
    // status line and title stack; one band 'On Google · checked'": a thin border, the ok band, the date on the band, the action under
    out.__done = Object.fromEntries(["9 done", "10 done", "11 done"].map((k) => { const pc = h.querySelector(`section[data-k="${k}"] .pm-k5-plan`), b = pc && pc.querySelector(".pm-k5-h");
      return [k, pc ? { edgeW: getComputedStyle(pc).borderLeftWidth, band: getComputedStyle(b).backgroundColor, head: b.innerText.replace(/\s+/g, " ").trim(), logo: !!pc.querySelector(".gcard-logo, .gcard-g"),
        act: ((h.querySelector(`section[data-k="${k}"] .pm-k5-plan + .pm-k5-acts`) || {}).innerText || "").replace(/\s+/g, " ").trim(), maps: !!h.querySelector(`section[data-k="${k}"] a.gcard-maps[href="https://maps.google.com/?cid=1"]`) } : null]; }));
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

const want = { "11 with RGA": "rga", "10 Google said": "you", "6 code": "you", "6 reviewing": "wait", "6 not verified": "you" };
{ const v6 = P.__v6;
  if (!v6 || v6.edgeW !== "1px" || v6.band !== TINT.ok || v6.marks < 2 || v6.typed || v6.recheck) fail(`client step 2 verified isn't the plan card (thin border, the ok band, drawn marks): ${JSON.stringify(v6)}`); }
{ const pc = P.__plan;
  if (!pc) fail("client step 4 (7 with RGA) isn't drawn as the plan card");
  else if (pc.edgeW !== "1px" || pc.band !== TINT.rga || pc.marks < 3 || pc.typed || !pc.actsUnder) fail(`client step 4's plan card isn't right: thin border, the rga band, drawn marks, actions under (${JSON.stringify(pc)})`); }
for (const [k, st] of Object.entries(want)) {
  const c = P[k];
  if (!c) { fail(`portal "${k}" isn't the shared Google card`); continue; }
  if (c.bg !== TINT[st]) fail(`portal "${k}" isn't the ${st} tint (${c.bg})`);
  if (c.edgeW !== "1px") fail(`portal "${k}" has a thick edge (${c.edgeW}), not a thin border`);
  if (!c.logo) fail(`portal "${k}" has no Google logo`);
  if (!c.icon || c.icon.bg !== EDGE[st] || !c.icon.svg || c.icon.text) fail(`portal "${k}" status icon isn't the drawn ${st} icon (${JSON.stringify(c.icon)})`);
  if (c.tinted) fail(`portal "${k}" has ${c.tinted} tinted tile(s) inside (what you read or pick stays white)`);
  if (c.head !== EDGE[st] && !(st === "rga" && c.head === "rgb(28, 68, 189)") && !(st === "wait" && c.head === "rgb(95, 99, 104)")) fail(`portal "${k}" status line isn't the ${st} colour (${c.head})`);
}
// 🔒 10-20 (Chris, step 6 v2.1 → every card): the status line says only WHAT IT IS; the time is its own line under the title
const MONTH = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d/;
for (const [k, c] of Object.entries(P)) if (c && (MONTH.test(c.st) || /·\s*(?:checked|confirmed|last|saved|sent|built)\b/i.test(c.st))) fail(`portal "${k}" puts a time on its status line ("${c.st}") — it goes under the title`);
// 🔄 10-23 night (steps_6_20_clean_v1): the three done steps are plan cards — the date on the band, the change action under the card
const DONE_WANT = { "9 done": [/^Your hours are on Google checked Oct 1[56]$/, /^Change hours Something's not right\?$/, true], "10 done": [/^Your booking link is on Google checked Oct 1[56]$/, /^Change link See it on Google Maps ↗$/, true],
  "11 done": [/^1 detail on Google checked Oct 1[56]$/, /^Change details$/, false] };
for (const [k, [head, act, maps]] of Object.entries(DONE_WANT)) { const c = P.__done && P.__done[k];
  if (!c) { fail(`portal "${k}" isn't the plan card`); continue; }
  if (c.edgeW !== "1px" || c.band !== TINT.ok || c.logo) fail(`portal "${k}" isn't the plan card (thin border, the ok band, no Google tile): ${JSON.stringify(c)}`);
  if (!head.test(c.head) || !act.test(c.act) || (maps && !c.maps)) fail(`portal "${k}" isn't "<what> · checked <date>" with its action under the card${maps ? " and Maps" : ""} (${c.head} | ${c.act})`); }
if (!P["card with a time"] || !/^Last checked Oct 16\b/.test(P["card with a time"].when) || !P["card with a time"].whenUnderTitle) fail(`a Google card doesn't say "Last checked …" on its own line under the title ("${P["card with a time"]?.when}")`);
if (P["6 verified"] && P["6 verified"].when && !/^Last checked Oct 16\b/.test(P["6 verified"].when)) fail(`portal "6 verified" doesn't say when it was checked ("${P["6 verified"].when}")`);
// step 6 v2.1: no Check again on a verified profile — a note says RGA checks every night
if (P["6 verified"] && (P["6 verified"].act !== "" || !/^Verified by Google \| We check this every night\. [^|]*this step reopens[^|]* \| See it on Google Maps ↗ How verification works$/i.test(P["6 verified"].meta))) fail(`step 6's verified card has a Check again, or lacks "Verified by Google" + the every-night note + Maps + How (${P["6 verified"]?.meta} / act "${P["6 verified"]?.act}")`);
if (P["10 Google said"] && (P["10 Google said"].act !== "Fix it" || !P["10 Google said"].primary)) fail("a refusal's card has no blue Fix it under it");
if (A._rows) {
  const want4 = [EDGE.you, EDGE.rga, EDGE.rga, EDGE.ok];
  if (JSON.stringify(A._rows.markers) !== JSON.stringify(want4)) fail(`admin's Google row markers don't take their card's colour inside real rows (${A._rows.markers.join(" | ")})`);
  if (A._rows.goText === A._rows.goBg) fail(`the blue "Open Google Business Profile" button's text is the same colour as the button (${A._rows.goText})`);
}
for (const st of ["ok", "rga", "you", "wait"]) if (A[st] && (MONTH.test(A[st].st) || A[st].when !== "Last checked Oct 16" || !A[st].whenUnderTitle)) fail(`admin "${st}" card puts the time on its status line, or not on its own line under the title ("${A[st].st}" / "${A[st].when}")`);
for (const st of ["ok", "rga", "you", "wait"]) {
  const a = A[st];
  if (!a) { fail(`admin's ${st} card doesn't draw`); continue; }
  const p = Object.entries(want).find(([, s]) => s === st); const pc = p && P[p[0]];
  if (a.bg !== TINT[st] || a.edgeW !== "1px" || !a.logo || !a.icon || a.icon.bg !== EDGE[st] || !a.icon.svg || a.icon.text) fail(`admin's ${st} card isn't the portal's (bg ${a.bg}, edge ${a.edgeW}, icon ${JSON.stringify(a.icon)})`);
  if (pc && (a.head !== pc.head || a.border.split(" ").slice(0, 3).join(" ") !== pc.border.split(" ").slice(0, 3).join(" "))) fail(`admin's ${st} card differs from the portal's (status ${a.head} vs ${pc.head}; border ${a.border} vs ${pc.border})`);
  if (!/See it on Google Maps ↗/.test(a.meta) || a.act !== "Act") fail(`admin's ${st} card has no Maps proof, or its buttons aren't under it`);
}

if (F.length) { console.error("🔴 The Google steps aren't one card:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ one Google card on every Google step, portal and admin alike (google_card_best_v1): the state is the tint + a thin border (green · blue · amber · grey), one status line with a drawn icon, proof last, buttons under the card (Check again / Change hours / Change link / blue Fix it); admin rows take their card's state (marker, pill, outline), drift and Your action too");
