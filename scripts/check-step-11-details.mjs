#!/usr/bin/env node
// check-step-11-details.mjs — client step 11 "Confirm what's true of your business" is the approved build, for any business:
//   · Google's own yes/no details for THIS business, in Google's own groups (many → the first two open, the rest fold)
//   · two kinds: "about you" (owned-by, LGBTQ+ friendly, transgender safe space, veteran…) is NEVER pre-ticked or recommended;
//     "how you work" is recommended (and preselected) only when ANOTHER STEP PROVES it (step 10's link on Google), with why
//   · the save button says what it saves ("None of these apply" when nothing is ticked); unticked details come off Google
//   · done = the one Google card with each detail ✓, the ones not shown, Maps, "Change details" (Editing, no write)
//   · the record carries what RGA recommended, so admin can say "client chose N of M · RGA recommended X"
//
// 🔒 WHY (approved step11_details_v1, 2026-10-16; Chris: "all approved. be sure as always they tie to admin, and databse and
// all are synced"). The form stacked a label + help + grey box; identity details sat beside service details as if RGA could
// suggest them; an empty save read "Save what applies"; unticking cleared Google unsaid; Show me how was out of date.
import fs from "node:fs";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const req = createRequire(`${SITE}/netlify/functions/x.js`);
let G; try { G = req("./_gbp-profile.js"); } catch (e) { console.error(`⚠️  INDETERMINATE — ${e.message}`); process.exit(2); }
const F = []; const fail = (m) => F.push(m);

// ── 1 · which details are "about you" (any trade's list, by Google's key AND label) ──
const ABOUT = [["is_owned_by_women", "Identifies as women-owned"], ["welcomes_lgbtq", "LGBTQ+ friendly"], ["is_owned_by_veterans", "Identifies as veteran-led"],
  ["is_black_owned", "Identifies as Black-owned"], ["is_transgender_safespace", "Transgender safe space"], ["x_renamed", "Identifies as Latino-owned"]];
const HOW = [["offers_online_appointments", "Online appointments"], ["requires_appointments", "Appointment required"], ["has_wheelchair_accessible_entrance", "Wheelchair accessible entrance"],
  ["serves_dine_in", "Dine-in"], ["accepts_reservations", "Accepts reservations"], ["has_onsite_services", "On-site services"]];
for (const [key, label] of ABOUT) if (!G.isAboutYou({ key, label })) fail(`"${label}" isn't treated as only the owner's to say`);
for (const [key, label] of HOW) if (G.isAboutYou({ key, label })) fail(`"${label}" is treated as an identity detail`);
const opts = [...ABOUT, ...HOW].map(([key, label]) => ({ key, label, about: G.isAboutYou({ key, label }) }));
const r0 = G.recommendDetails(opts, {});
const r1 = G.recommendDetails(opts, { "m1.gbp.booking_link": { google_push: { state: "on_google", link_type: "url_appointment" } } });
const r2 = G.recommendDetails(opts, { "m1.gbp.booking_link": { google_push: { state: "on_google", link_type: "url_reservations" } } });
const r3 = G.recommendDetails(opts, { "m1.gbp.booking_link": { google_push: { state: "needs_client" } } });
if (r0.length || r3.length) fail("RGA recommends a detail no other step proves");
if (JSON.stringify(r1.map((x) => x.key)) !== '["offers_online_appointments"]' || !r1[0].why) fail(`step 10's appointment link doesn't recommend Online appointments with a reason (${JSON.stringify(r1)})`);
if (JSON.stringify(r2.map((x) => x.key)) !== '["accepts_reservations"]') fail(`a restaurant's reservations link doesn't recommend Accepts reservations (${JSON.stringify(r2)})`);
if (G.recommendDetails(opts.map((o) => ({ ...o, about: true })), { "m1.gbp.booking_link": { google_push: { state: "on_google", link_type: "url_appointment" } } }).length) fail("an \"about you\" detail can be recommended");

// ── 2 · wired: read → recommend → save → stored → admin ──
const prof = read("netlify/functions/portal-gbp-profile.js"), inp = read("netlify/functions/portal-step-input.js"), admin = read("admin/admin.js");
const portal = read("portal/portal.js"), js = portal.replace(/^[ \t]*\/\/.*$/gm, ""), css = read("portal/portal.css");
if (!/if \(stepId === "m1\.gbp\.attributes"\) \{[\s\S]{0,300}now\.recommend = require\("\.\/_gbp-profile"\)\.recommendDetails\(now\.options,/.test(prof)) fail("the read doesn't carry RGA's recommendation");
if (!/if \(push && stepId === GSTEP\.ATTRS && Array\.isArray\(offeredForRec\)\) push\.recommended = require\("\.\/_gbp-profile"\)\.recommendDetails\(offeredForRec, rec\.tasks\)\.map\(\(x\) => x\.key\);/.test(inp)) fail("the save doesn't store what RGA recommended (admin can't say it)");
if (!/const attrWhy = step\?\.flowId === "m1\.gbp\.attributes"[\s\S]{0,300}RGA recommended/.test(admin) || !/why: choseWhy \|\| attrWhy,/.test(admin) || !/flowId === "m1\.gbp\.attributes" && \(\(\) => \{ const bk = state\.onboardingData/.test(admin)) fail("admin row 35 doesn't say what the client chose and what RGA recommended");
if (!/^const EDIT_IN_PLACE = new Set\(\[[^\]]*"m1\.gbp\.attributes"/m.test(portal) || !/^const ONE_LINE_ASK = new Set\(\[[^\]]*"m1\.gbp\.attributes"/m.test(portal)) fail("Change details doesn't open Editing, or the ask isn't one line");
if (!/Unticked details come off Google\./.test(js) || !/host\.classList\.contains\("pm-at"\)/.test(js)) fail("the save doesn't say unticked details come off Google, or a failed read offers a save that can't work");
const cs = JSON.parse(read("data/playbooks/client-steps.json")).month1.find((s) => s.id === "m1.gbp.attributes");
if (!cs || /we will send you the list|free estimates/i.test(cs.clientInstructions || "") || !/ABOUT YOU|About you/.test(cs.clientInstructions || "") || cs.clientInput.cta !== "Put it on Google") fail("Show me how is out of date, or the button isn't \"Put it on Google\"");
if ((css.match(/^\.pm-at \{/gm) || []).length !== 1) fail("the step 11 card isn't styled once");

// ── 3 · drawn for real ──
const pick = (re) => { const m = re.exec(portal); if (!m) return ""; let d = 0; for (let k = portal.indexOf(") {", m.index) + 2; k < portal.length; k++) { if (portal[k] === "{") d++; else if (portal[k] === "}") { d--; if (!d) return portal.slice(m.index, k + 1); } } return ""; };
const line = (n) => (new RegExp(`^const ${n} = .*;$`, "m").exec(portal) || [""])[0];
const lift = [pick(/^function escapeHtml\(/m), pick(/^function escapeAttribute\(/m), line("GOOGLE_G"), line("GC_ICON"), pick(/^function googleCardHtml\(/m), line("gcardMaps"), line("monthDay"), pick(/^function attrsFormHtml\(/m), pick(/^function atSubmitLabel\(/m), pick(/^function attrsCardHtml\(/m)];
if (lift.some((x) => !x)) { console.error(`⚠️  INDETERMINATE — a step-11 helper moved (${lift.findIndex((x) => !x)})`); process.exit(2); }
let puppeteer = null; try { ({ default: puppeteer } = await import("puppeteer")); } catch { puppeteer = null; }
if (!puppeteer) { console.error("⚠️  INDETERMINATE — puppeteer is missing"); process.exit(2); }
const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
let R;
try {
  const page = await browser.newPage();
  await page.setContent("<html><body><div id=h></div></body></html>");
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: lift.join("\n") });
  R = await page.evaluate(async () => {
    const h = document.getElementById("h");
    const rga = { options: [{ key: "is_owned_by_women", label: "Identifies as women-owned", group: "From the business", about: true }, { key: "offers_online_appointments", label: "Online appointments", group: "Planning", about: false },
      { key: "welcomes_lgbtq", label: "LGBTQ+ friendly", group: "Crowd", about: true }, { key: "requires_appointments", label: "Appointment required", group: "Planning", about: false }],
      ticked: [], recommend: [{ key: "offers_online_appointments", why: "your booking link lets people book online" }, { key: "is_owned_by_women", why: "should never show" }] };
    const draw = (html) => { h.innerHTML = `<div data-step-input="m1.gbp.attributes"><div class="pm-at">${html}</div><div class="pm-in-foot"><button data-in-submit>Put it on Google</button></div></div>`; atSubmitLabel(h.firstElementChild);
      return { cls: h.querySelector(".gcard")?.className, on: [...h.querySelectorAll("[data-in-tick].on")].map((b) => b.getAttribute("data-in-tick")), why: ((h.querySelector(".gcard-why") || {}).innerText || "").replace(/\s+/g, " ").trim(), text: h.innerText.replace(/\s+/g, " "),
        btn: h.querySelector("[data-in-submit]").textContent, folds: h.querySelectorAll("details.pm-at-more").length, groups: [...h.querySelectorAll(".pm-at-grp")].map((x) => x.textContent) }; };
    const many = { options: Array.from({ length: 30 }, (_, i) => ({ key: `k${i}`, label: `Detail ${i}`, group: `Group ${Math.floor(i / 6)}`, about: false })), ticked: ["k1"], recommend: [] };
    const out = {
      rga: draw(attrsFormHtml(rga, null)), saved: draw(attrsFormHtml(rga, ["welcomes_lgbtq"])), none: draw(attrsFormHtml(rga, [])), many: draw(attrsFormHtml(many, null)),
      editing: draw(attrsFormHtml(rga, null, { editing: true })), empty: draw(attrsFormHtml({ options: [] }, null)),
      xss: draw(attrsFormHtml({ options: [{ key: "x", label: '<img src=x onerror="window.__x=1">', group: "<b>g</b>", about: false }], ticked: [], recommend: [] }, null)),
    };
    h.innerHTML = attrsCardHtml({ id: "m1.gbp.attributes" }, {}, { state: "on_google", at: "2026-10-17T16:00:00Z", after: ["offers_online_appointments"], labels: { offers_online_appointments: "Online appointments", requires_appointments: "Appointment required" } }, "https://maps.google.com/?cid=1");
    out.done = { text: h.innerText.replace(/\s+/g, " "), edit: !!h.querySelector('[data-step-edit="m1.gbp.attributes"]'), cls: h.querySelector(".gcard")?.className };
    h.innerHTML = attrsCardHtml({ id: "m1.gbp.attributes" }, {}, { state: "on_google", at: "2026-10-17T16:00:00Z", after: [], labels: { a: "A" } }, null);
    out.doneNone = h.innerText.replace(/\s+/g, " ");
    out.x = await new Promise((r) => setTimeout(() => r(window.__x || 0), 300));
    return out;
  });
} finally { await browser.close(); }
if (R.rga.cls !== "gcard you" || JSON.stringify(R.rga.on) !== '["offers_online_appointments"]' || !/^RGA recommends Online appointments: your booking link lets people book online\.$/i.test(R.rga.why) || /should never show/.test(R.rga.why)) fail(`RGA's recommendation isn't preselected with its reason, or an identity detail is recommended (${JSON.stringify(R.rga)})`);
if (!R.rga.groups.some((g) => /^About you · only you can say$/i.test(g)) || !/RGA never ticks these for you/.test(R.rga.text)) fail("the identity details aren't their own group with the owner-only note");
if (JSON.stringify(R.saved.on) !== '["welcomes_lgbtq"]') fail("a saved answer doesn't come back exactly as the client left it");
if (R.none.on.length || R.none.btn !== "None of these apply" || R.rga.btn !== "Put it on Google") fail(`the save button doesn't say what it saves (${R.none.btn} / ${R.rga.btn})`);
if (R.many.folds !== 3 || !/Google shows 1 of 30/i.test(R.many.text)) fail(`a long list doesn't fold after the first two groups, or the count is wrong (${R.many.folds}; ${R.many.text.slice(0, 80)})`);
if (R.editing.cls !== "gcard ok" || R.editing.why) fail("editing a done step isn't the green card (or still recommends)");
if (!/Google doesn't offer your kind of business any yes\/no details/.test(R.empty.text)) fail("a business Google offers no details can't finish the step");
if (!/^On Google Details about your business Last checked Oct 17 Online appointments ✓ Not shown: Appointment required\. See it on Google Maps ↗ Change details$/i.test(R.done.text.trim()) || !R.done.edit) fail(`the done card isn't each detail ✓ + not shown + Maps + Change details (${R.done.text})`);
if (!/None of these apply (?:Last checked [^G]* )?Google shows none of these details on your profile\./.test(R.doneNone)) fail(`a done step with nothing ticked doesn't say none apply (${R.doneNone})`);
if (R.x) fail("a detail's label became HTML");

if (F.length) { console.error("🔴 Step 11 isn't the approved details step:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ step 11 works for any business: Google's own details in its groups (long lists fold), identity details only the owner's (never ticked or recommended), RGA recommends only what step 10 proves (with why, preselected), the button says what it saves, unticked come off Google; done card ✓ + not shown + Change details (Editing); the record carries RGA's recommendation for admin");
