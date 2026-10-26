#!/usr/bin/env node
// check-steps-6-and-7-confirm-in-the-portal.mjs — 2026-10-20, Chris's two approved mockups:
//   step6_duplicate_confirmed_in_portal_v1 — the duplicate-removal confirmation is step 6's OWN card (+ a 7-day note at the
//     top of the portal), never an email, never "Your next step is open: upload your business photos" under it, and never
//     an "Emails about this step" row.
//   step7_check_business_v2 — "Check your business on Google" says what was compared, shows a facts table, what RGA is
//     doing, the 48-hour wait and when it's done; on a phone the table STACKS (label + state, value full-width under it)
//     and a place chip never breaks mid-word (Chris's 7:08 screenshot).
// RUNS the real card builders on fakes, plus the wiring around them.
//   exit 0 holds · 1 a confirmation reverts to email / the step 7 card loses a part / squeezes on mobile · 2 code moved
import fs from "node:fs";
import vm from "node:vm";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const rd = (p) => fs.readFileSync(`${SITE}/${p}`, "utf8");
const P = rd("portal/portal.js"), CSS = rd("portal/portal.css"), A = rd("admin/admin.js");
const TH = rd("netlify/functions/portal-thread.js"), NO = rd("netlify/functions/notify-step-open.js");
const F = [], fail = (m) => F.push(m);
const fnSrc = (name) => {
  const at = P.search(new RegExp(`\\nfunction ${name}\\(`));
  if (at < 0) { console.error(`⚠️  ${name} moved`); process.exit(2); }
  let d = 0;
  for (let i = P.indexOf("{", P.indexOf(")", at)); i < P.length; i++) { if (P[i] === "{") d++; else if (P[i] === "}") { d--; if (!d) return P.slice(at + 1, i + 1); } }
  process.exit(2);
};
const ctx = vm.createContext({
  escapeHtml: (x) => String(x ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;"), escapeAttribute: (x) => String(x ?? ""),
  siteShow: (x) => String(x || "").replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""), gcardMaps: () => "",
  fmtDateTimeDot: (x) => String(x), monthDay: (x) => String(x).slice(0, 10), STORE_ICON: "", GOOGLE_G: "", GC_ICON: { ok: "" }, Date, JSON, Array, String,
  googleCardHtml: (o) => `<card state="${o.state}">${[o.small, o.side, o.title, o.body, o.proof, o.act].filter(Boolean).join(" ¦ ")}</card>`,
  // seeStepText / portalStepNo (10-20): the number comes from the playbook in the browser; here a fixed one
  seeStepText: () => "See step 2 →", portalStepNo: () => 2,
  FACT_WORDS: {}, placeName: (n) => String(n || "").split(",")[0].trim(),
});
{ const a = P.indexOf("const PC_TICK = "), b = P.indexOf("\n", P.indexOf("const pcActs = ")); if (a < 0 || b < 0) { console.error("⚠️  the plan-card pieces moved"); process.exit(2); } vm.runInContext(P.slice(a, b) + "\n" + (P.match(/^const KW_SPIN = `[^`]*`;$/m) || [""])[0], ctx); }   // the plan card (steps_1_4_clean_v1)
for (const n of ["dupConfirmedOf", "keptProfileOf", "dupConfirmedHtml", "dupNoteHtml", "typeLinesHtml", "factsCardV2"]) vm.runInContext(fnSrc(n), ctx);
const run = (src) => vm.runInContext(src, ctx);

// ── step 6 ──
const now = new Date().toISOString(), old = new Date(Date.now() - 9 * 86400000).toISOString();
const tasks = (at, verdict = "clean", status = "removed") => ({ "m1.audit.gbp_duplicate": { owner_removal: { status, title: "Acme Plumbing", phone: "(555) 010-0000", account: "a@x.com", at }, outcome_data: { verdict }, completed_at: at } });
ctx.T = tasks(now); ctx.T2 = tasks(now, "duplicate"); ctx.T3 = tasks(old); ctx.T4 = tasks(now, "clean", "found");
const card = run("dupConfirmedHtml(T, { google_account_email: 'o@x.com' })");
// 🔄 10-23 (approved steps_1_4_clean_v1): the duplicate is the verified card's last row — "Duplicate profile · Removed", the date on
// its own line, Show / Hide details folding the removed / kept lines; still a closed accordion the top note can open
if (!/<span class="l">Duplicate profile<\/span><span class="v">Removed/.test(card)) fail("step 6 doesn't show the duplicate as removed once Google confirms it");
if (/photo|next step/i.test(card)) fail(`step 6's confirmation points at photos / "next step": ${card.slice(0, 160)}`);
// 🔄 10-23 night (Chris: "match the mockup exactly" — steps_1_4_clean_v1 draws ONE plain row, no Show details): a row joined into the
// verified card, right under Phone (before the fold); a closed accordion again would be the drift Chris screenshotted
if (!/^<div class="pm-k5-plan ok pm-k5-join" data-dup-acc><div class="pm-pc-f">/.test(card) || /<details/.test(card)) fail("step 6's duplicate confirmation isn't the plain row joined into the verified card");
if (!/card\.insertBefore\(dup, card\.querySelector\(":scope > \.pm-k5-fold"\) \|\| null\)/.test(P)) fail("the duplicate row isn't placed under Phone, before the fold and Maps");
if (/One profile on Google/.test(card)) fail('the duplicate row says more than "Removed"');
if (!/Removed<small>Google confirmed it [^<]+<\/small>/.test(card)) fail("the confirmation date isn't on its own line under Removed");
if (/Show details|Hide details/.test(card)) fail("the duplicate row grew a Show / Hide details again (the mockup has none)");
// order: the verified card first, the duplicate under it
if (!/<div class="pm-gv" data-gbp-verify[^`]*Reading your Google Business Profile…<\/span><\/div>\$\{dupConfirmedHtml\(onboarding\?\.data\?\.tasks, oauth\)\}/.test(P)) fail("step 6 doesn't draw the verified card first and the duplicate under it");
if ((P.match(/dupConfirmedHtml\(onboarding\?\.data\?\.tasks, oauth\)/g) || []).length !== 1) fail("step 6 draws the duplicate confirmation more than once (or above the verified card)");
// the verified card: no Check again, the every-night note instead
const gv = P.slice(P.indexOf("function gvProfileHtml("), P.indexOf("function gvGoogleRouteHtml("));
if (/data-step-recheck="m1\.gbp\.verify">Check again/.test(gv) || !/meta: kind === "yes" \? "We check this every night\./.test(gv)) fail("the verified card has Check again again, or lost the every-night note");
// the jump opens the accordion
if (!/data-portal-scroll="step-row-m1\.gbp\.verify" data-portal-open="\[data-dup-acc\]"/.test(P) || !/const openSel = t\.getAttribute\("data-portal-open"\);\s*if \(openSel\) \{ const acc = el\.querySelector\(openSel\); if \(acc && !acc\.open\) acc\.open = true; \}/.test(P)) fail('"See step 6 →" doesn\'t open the accordion it lands on');
if (run("dupConfirmedHtml(T2, null)") || run("dupConfirmedHtml(T4, null)")) fail("step 6 says the duplicate is gone before Google confirms it (verdict not clean, or not removed)");
const note = run("dupNoteHtml(T)");
if (!/data-dup-note/.test(note) || !/See step/.test(note) || /photo/i.test(note) || !/<p class="k">✓ Duplicate removed<\/p>/.test(note)) fail("the 7-day top note is missing, doesn't point at step 6, or mentions photos");
if (run("dupNoteHtml(T3)")) fail("the top note still shows after 7 days");
if (!/\.filter\(\(r\) => r\.payload\?\.reason !== "duplicate_confirmed_gone"[\s\S]{0,120}?\)\.map/.test(TH)) fail('portal-thread shows the duplicate confirmation as an "Emails about this step" row');
if (/if \(dupClearedDue\(tasks\)\)/.test(NO)) fail("notify-step-open still emails the client when the duplicate is confirmed gone");
if (!/data-ol-told>[^<]*no email/.test(A)) fail("admin's step 11 record doesn't say the client is told in the portal, not by email");

// ── step 7 ──
ctx.S = { id: "m1.gbp.business_facts" };
ctx.CI = { client_input: { name: "Acme Plumbing", phone: "5550100000", website: "https://acme.test/", come: "no" } };
ctx.G1 = { state: "with_rga", after: { name: "Acme Plumbing", phone: "+1 555-010-0000", website: "https://acme.test/", come: false, region: "US" },
  area_now: ["Springfield, IL, USA", "Shelbyville, IL, USA", "Capital City, IL, USA"], rga: [{ fact: "area", add: ["Capital City, IL, USA", "Ogdenville, IL, USA"] }],
  progress: { at: now, items: [{ kind: "area", name: "Capital City, IL, USA", on: true }, { kind: "area", name: "Ogdenville, IL, USA", on: false }] } };
ctx.G2 = { state: "on_google", after: ctx.G1.after, area_now: ["Springfield, IL, USA", "Capital City, IL, USA"], area_now_at: now };
const w = run("factsCardV2(S, CI, G1)"), o = run("factsCardV2(S, CI, G2)");
if ((w.match(/class="pm-pc-f"/g) || []).length !== 5) fail("step 7's facts table doesn't have its 5 rows (name, phone, website, how customers reach you, service area)");
for (const [re, what] of [[/Nothing needed from you/, "nothing needed from you"], [/We compared what Google shows/, "what was compared"], [/What RGA is doing:/, "what RGA is doing"],
  [/48 hours/, "Google's 48-hour wait"], [/Done when Google shows/, "done when"], [/data-step-edit/, "Change something"], [/✓ on Google|adding/, "each area's own state (the mockup's chips; no N of M count)"]])
  if (!re.test(w)) fail(`step 7 (RGA working) lost "${what}"`);
for (const n of ["Springfield", "Shelbyville", "Capital City", "Ogdenville"]) {
  const k = (w.match(new RegExp(`pm-fxt-pl[^"]*"><span class="d"[^>]*></span>${n}\\b`, "g")) || []).length;
  if (k !== 1) fail(`step 7 shows the place chip "${n}" ${k} times (want exactly 1)`);
}
if (!/pm-k5-plan ok/.test(o) || !/All 5 match Google/.test(o) || /RGA is/.test(o)) fail("step 7 on Google doesn't say it matches (or still says RGA is working)");
if (!/if \(step\.id === "m1\.gbp\.business_facts" && \(g\.state === "with_rga" \|\| g\.state === "on_google"\)\) return factsCardV2\(step, taskState, g, opts\.move \|\| null\);/.test(P)) fail("step 7 doesn't route to the v2 card");
// the mobile layout (Chris 10-20): stacked at every width, chips never break mid-word
const rule = (sel) => (CSS.match(new RegExp(`\\n${sel.replace(/\./g, "\\.")} \\{([^}]*)\\}`)) || [])[1] || "";
if (!/grid-template-columns:\s*minmax\(0,\s*1fr\) auto/.test(rule(".pm-fxt-r"))) fail("a facts row has a fixed label column again (it squeezes the value on a phone)");
if (!/grid-column:\s*1 \/ -1/.test(rule(".pm-fxt-v"))) fail("the fact's value isn't full-width under its label (squeezed on a phone)");
if (!/white-space:\s*nowrap/.test(rule(".pm-fxt-pl"))) fail("a place chip can break mid-word");
// 🔄 10-23 (steps_1_4_clean_v1): step 7's rows are the plan card's fact rows — label · value · a drawn mark (or its honest status words)
if (!/const pcFact = \(label, value, sub = "", mark = "ok"\) => `<div class="pm-pc-f"><span class="l">\$\{escapeHtml\(label\)\}<\/span><span class="v">/.test(P) || !/const row = \(k, v, st, sub = ""\) => pcFact\(k, v, sub, st\);/.test(P)) fail("a facts row isn't label · value · mark (the plan card's row)");
if (/@media[^{]*\{[^}]*\.pm-fxt/.test(CSS)) fail("the facts table has a width-only media rule; it must stack at every width");

if (F.length) { console.error("🔴 step 6 / step 7 drifted from the approved mockups:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ step 6 confirms in the portal (card + 7-day note, no email, no photos line); step 7 shows the facts table, RGA's work, 48 h, done-when — stacked on a phone");
