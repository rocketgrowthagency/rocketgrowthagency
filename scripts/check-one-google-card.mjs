#!/usr/bin/env node
// check-one-google-card.mjs — every Google step draws ONE card, in the portal AND in admin: white inside, the Google logo,
// the state in the left edge + the heading (green on Google · blue RGA acts · amber the client acts · grey waiting on
// Google), the card's action top-right, checked + "See it on Google Maps ↗" in its bottom line. Drawn for real in a
// browser with the real CSS, each state, both sides — and the two sides must compute the same colours.
//
// 🔒 WHY (approved one_google_card_v1, 2026-10-16). Chris, looking at steps 6 and 9: "why is this border only green and
// inside white, and then this inside is green. Let's get consistency for all these." Step 6 was a white card with a check
// tile and its buttons under the card; step 9 a green-filled card; steps 7/10/11 a third look. Then: "make sure this is
// same for admin side also" — admin's Google status was an italic note with inline colours.
import fs from "node:fs";

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
if (/class="(?:tl2|pm-turned|pm-hc"|pm-gv-obj)/.test(push + hours + gv)) fail("a Google step still draws its own card (tl2 / pm-turned / pm-hc / pm-gv-obj) instead of the shared one");
if ((push.match(/return googleCardHtml\(/g) || []).length < 4 || !/return googleCardHtml\(/.test(hours) || !/return googleCardHtml\(/.test(gv)) fail("steps 6 / 7 / 9 / 10 / 11 don't all draw the shared Google card");
if (!/const gcardAct = isDone && GCARD_CHANGE\[step\.id\] && taskState\?\.google_push\?\.state === "on_google"/.test(portal) || !/act: gcardAct \}\)\}/.test(portal) || !/&& !hoursCard && !gcardAct\n/.test(portal)) fail("steps 10 / 11's Change isn't the card's own action (it sits under the card)");
if (!/<div class="pm-row-actions"\$\{step\.id === "m1\.gbp\.verify" && isDone && !month2Only \? " hidden" : ""\}>/.test(portal)) fail("step 6's Check again / How verification works still sit under the card");
if (!/e\.target\.closest\("\[data-gcard-how\]"\)/.test(portal) || !/e\.target\.closest\("\[data-gcard-fix\]"\)/.test(portal)) fail("the card's How verification works / Fix it do nothing");
// never a tinted fill
if (/^\.gcard[^{]*\{[^}]*background:\s*var\(--state-/m.test(pcss) || /^\.ob-gcard[^{]*\{[^}]*background:\s*var\(--state-/m.test(acss)) fail("a Google card is filled with a state tint");
if (/^\.pm-hc \{/m.test(pcss) || /^\.pm-gv-obj/m.test(pcss)) fail("the old step-9 green card / step-6 card styles are back");
if ((pcss.match(/^\.gcard \{/gm) || []).length !== 1 || (acss.match(/^\.ob-gcard \{/gm) || []).length !== 1) fail("the Google card's class is styled in more than one place (grep a class before using it)");
// admin: every Google status branch is the card
if ((admin.match(/^function adminGoogleCardHtml\(/gm) || []).length !== 1) fail("admin has no single adminGoogleCardHtml");
const gseg = strip(admin.slice(admin.indexOf("    const gHtml = !g ? \"\""), admin.indexOf("    return `<div class=\"ob-in\"><p class=\"ob-in-head\">")));
if (!gseg || gseg.length > 6000) { console.error("⚠️  INDETERMINATE — admin's Google status moved"); process.exit(2); }
if (/ob-in-note/.test(gseg) || (gseg.match(/adminGoogleCardHtml\(/g) || []).length < 8) fail("admin's Google status isn't the Google card on every state (an ob-in-note line is back)");
if (!/if \(step\?\.flowId === "m1\.gbp\.verify" && task\?\.status === "done" && task\?\.detected\?\.verdict\) \{/.test(admin)) fail("admin's step 6 doesn't show the same Google card");

// ── 2 · drawn for real, both sides, every state ──
const pLift = [pp(/^function escapeHtml\(/m), pp(/^function escapeAttribute\(/m), pl("GOOGLE_G"), pp(/^function googleCardHtml\(/m), pl("gcardMaps"), pl("GV_STORE"), pp(/^function gvProfileHtml\(/m),
  pl("_editingSteps"), pl("FACT_WORDS"), pl("siteShow"), pp(/^function factsSummary\(/m), pp(/^function fmtDateTimeDot\(/m), pp(/^function hoursCardHtml\(/m), pp(/^function hoursSummary\(/m), pp(/^function gbpPushHtml\(/m),
  pl("GBP_STEPS"), pl("GBP_THING"), pl("GBP_DAY"), pl("hm12"), pl("monthDay")];
const aLift = [ap(/^function escapeHtml\(/m), ap(/^function escapeAttribute\(/m), al("OL_G"), ap(/^function adminGoogleCardHtml\(/m), ap(/^function adminGcardWhen\(/m), ap(/^function adminGcardMaps\(/m)];
if (pLift.some((x) => !x) || aLift.some((x) => !x)) { console.error(`⚠️  INDETERMINATE — a helper moved (portal ${pLift.findIndex((x) => !x)}, admin ${aLift.findIndex((x) => !x)})`); process.exit(2); }
let puppeteer = null; try { ({ default: puppeteer } = await import("puppeteer")); } catch { puppeteer = null; }
if (!puppeteer) { console.error("⚠️  INDETERMINATE — puppeteer is missing"); process.exit(2); }
const EDGE = { ok: "rgb(12, 81, 50)", rga: "rgb(36, 87, 230)", you: "rgb(180, 83, 9)", wait: "rgb(144, 153, 168)" };
const look = (sel) => [...document.querySelectorAll(sel)].map((c) => { const s = getComputedStyle(c), sm = c.querySelector("small"), tiles = [...c.querySelectorAll(".pm-hc-day:not(.off), .pm-hc-hol")];
  return { cls: c.className, bg: s.backgroundColor, edge: s.borderLeftColor, edgeW: s.borderLeftWidth, head: sm && getComputedStyle(sm).color, logo: !!c.querySelector("svg path[fill='#4285F4']"),
    tinted: tiles.filter((t) => { const b = getComputedStyle(t); return b.backgroundColor !== "rgb(255, 255, 255)" || /12, 81, 50|207, 230, 200/.test(b.borderColor); }).length,
    act: c.querySelector(".gcard-act") ? c.querySelector(".gcard-act").innerText.trim() : "", meta: ((c.querySelector(".gcard-meta, .ob-gcard-meta") || {}).innerText || "").replace(/\s+/g, " ").trim() }; });
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
      "10 done": gbpPushHtml({ id: "m1.gbp.booking_link" }, { status: "done", google_push: { state: "on_google", at, after: ["https://calendly.com/x"] } }, { maps, act: '<button class="pm-amend" data-step-reopen="m1.gbp.booking_link">Change link</button>' }),
      "7 with RGA": gbpPushHtml({ id: "m1.gbp.business_facts" }, { status: "in_progress", google_push: { state: "with_rga", at, rga: [{ fact: "area", add: ["Mar Vista, CA", "Palms, CA"] }], maps_uri: maps } }),
      "11 with RGA": gbpPushHtml({ id: "m1.gbp.attributes" }, { status: "in_progress", google_push: { state: "with_rga", error: "403" } }),
      "10 Google said": gbpPushHtml({ id: "m1.gbp.booking_link" }, { status: "pending", google_push: { state: "needs_client", said: "This link doesn't open.", fix: "Paste the public link." } }),
      "6 verified": gvProfileHtml(f, "yes", "✓ Verified by Google", [["Checked", "Oct 16, 6:03 AM"]]),
      "6 code": gvProfileHtml(f, "wait", "Waiting for your code", [["Way", "Code by text"]], { code: true }),
      "6 reviewing": gvProfileHtml(f, "wait", "Google is reviewing it", [["Way", "Video"]]),
      "6 not verified": gvProfileHtml(f, "no", "Not verified yet", [["On Maps", "Hidden until it's verified"]]),
    };
    const h = document.getElementById("h"); h.innerHTML = Object.entries(cards).map(([k, v]) => `<section data-k="${k}">${v}</section>`).join("");
    const L = eval(`(${lookSrc})`);
    return Object.fromEntries([...h.querySelectorAll("section")].map((s) => [s.dataset.k, L.call(null, `section[data-k="${s.dataset.k}"] > .gcard`)[0] || null]));
  }, look.toString());
  const apage = await browser.newPage();
  await apage.setContent("<html><body><div id=h></div></body></html>");
  await apage.addStyleTag({ content: acss });
  await apage.addScriptTag({ content: `var state = { onboardingData: { tasks: { "m1.gbp.business_facts": { google_push: { maps_uri: "https://maps.google.com/?cid=1" } } } } };\n${aLift.join("\n")}` });
  A = await apage.evaluate((lookSrc) => {
    const h = document.getElementById("h");
    h.innerHTML = ["ok", "rga", "you", "wait"].map((st) => `<section data-k="${st}">${adminGoogleCardHtml({ state: st, small: "Heading", title: "Title", meta: adminGcardMaps() })}</section>`).join("");
    const L = eval(`(${lookSrc})`);
    return Object.fromEntries(["ok", "rga", "you", "wait"].map((k) => [k, L.call(null, `section[data-k="${k}"] > .ob-gcard`)[0] || null]));
  }, look.toString());
} finally { await browser.close(); }

const want = { "9 done": "ok", "10 done": "ok", "7 with RGA": "rga", "11 with RGA": "rga", "10 Google said": "you", "6 verified": "ok", "6 code": "you", "6 reviewing": "wait", "6 not verified": "you" };
for (const [k, st] of Object.entries(want)) {
  const c = P[k];
  if (!c) { fail(`portal "${k}" isn't the shared Google card`); continue; }
  if (c.bg !== "rgb(255, 255, 255)") fail(`portal "${k}" isn't white inside (${c.bg})`);
  if (c.edge !== EDGE[st] || c.edgeW !== "4px") fail(`portal "${k}" edge isn't the ${st} colour (${c.edge} ${c.edgeW})`);
  if (!c.logo) fail(`portal "${k}" has no Google logo`);
  if (c.tinted) fail(`portal "${k}" has ${c.tinted} tinted tile(s) inside`);
  if ((st === "ok" || st === "you") && c.head !== EDGE[st]) fail(`portal "${k}" heading isn't the ${st} colour (${c.head})`);
}
if (P["9 done"] && (P["9 done"].act !== "Change hours" || !/See it on Google Maps ↗/.test(P["9 done"].meta))) fail("step 9's card lacks Change hours top-right or Maps in the bottom line");
if (P["10 done"] && (P["10 done"].act !== "Change link" || !/Checked on Google Oct 16 · See it on Google Maps ↗/.test(P["10 done"].meta))) fail(`step 10's card lacks Change link top-right or "Checked on Google · Maps" (${P["10 done"].meta})`);
if (P["6 verified"] && (P["6 verified"].act !== "Check again" || !/Checked Oct 16, 6:03 AM · See it on Google Maps ↗ · How verification works/.test(P["6 verified"].meta))) fail("step 6's card lacks Check again top-right or Checked · Maps · How verification works");
if (P["10 Google said"] && P["10 Google said"].act !== "Fix it") fail("a refusal's card has no Fix it");
for (const st of ["ok", "rga", "you", "wait"]) {
  const a = A[st];
  if (!a) { fail(`admin's ${st} card doesn't draw`); continue; }
  if (a.bg !== "rgb(255, 255, 255)" || a.edge !== EDGE[st] || a.edgeW !== "4px" || !a.logo) fail(`admin's ${st} card isn't the portal's (bg ${a.bg}, edge ${a.edge} ${a.edgeW}, logo ${a.logo})`);
  const p = Object.entries(want).find(([, s]) => s === st); const pc = p && P[p[0]];
  if (pc && a.head !== pc.head) fail(`admin's ${st} heading colour differs from the portal's (${a.head} vs ${pc.head})`);
  if (!/See it on Google Maps ↗/.test(a.meta)) fail(`admin's ${st} card has no See it on Google Maps`);
}

if (F.length) { console.error("🔴 The Google steps aren't one card:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ one Google card on every Google step, portal and admin alike: white inside, Google logo, the state in the left edge + heading (green on Google · blue RGA · amber client · grey waiting), action top-right (Check again / Change hours / Change link / Fix it), checked + See it on Google Maps in the bottom line; no tinted fill, no card of its own");
