#!/usr/bin/env node
// check-plan-cards-match-the-mockup.mjs — the done plan cards of client steps 1–5 are drawn as steps_1_4_clean_v1 draws them.
//
// 🔒 WHY (Chris 10-23 night, screenshots of live beside the mockup: "i really want the cards to match the mockup exactly the live
// still isnt looking good compared to mockup"). Live had drifted in small ways the per-step gates never looked at:
// - a "How this step works ▾" toggle with two hairlines above a done card the mockup draws alone;
// - "Call held · Friday, October 9 at 9:00 AM" instead of "Call held · Fri, Oct 9" with the time on the right;
// - "Something's not right?" as a boxed button instead of the mockup's quiet link.
// This gate draws the shipped functions with the shipped CSS in real Chrome and reads what a client SEES.
// 🔄 2026-10-30 night fixer: step 1 held's quiet link is now kickoff_after_call_v1's (APPROVED Chris 10-29 6:35 PM, shipped in batch 1):
// "Questions about the call? Ask RGA ›" opens a question, never a change request — same quiet-link test (no border, no fill, under the card).
// Reads files only (no Supabase, no network). SHOTS=<dir> saves the card.
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = []; const fail = (m) => F.push(m);
const src = read("portal/portal.js"), css = read("portal/portal.css"), mock = read("reports/mockups/steps_1_4_clean_v1.html"), after = read("reports/mockups/kickoff_after_call_v1.html");
const pick = (re) => { const m = re.exec(src); if (!m) return ""; let d = 0; for (let k = src.indexOf("{", m.index); k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) return src.slice(m.index, k + 1); } } return ""; };
const line = (name) => (new RegExp(`^const ${name} = .*;$`, "m").exec(src) || [""])[0];
const pcSlice = (() => { const a = src.indexOf("const PC_TICK ="), b = src.indexOf("const pcActs ="); return a < 0 || b < 0 ? "" : src.slice(a, src.indexOf("\n", b)); })();

// ── 1 · the mockup still draws what this gate holds the product to ──
for (const [re, what] of [[/<b>Call held · Fri, Oct 9<\/b><span>9:00 AM<\/span>/, "step 1 held: \"Call held · Fri, Oct 9\" with 9:00 AM on the right"],
  [/<span class="b">Edit access<\/span><span class="lnk">Add your builder<\/span>/, "step 3: Edit access + the quiet \"Add your builder\""]]) {
  if (!re.test(mock)) { console.error(`⚠️  INDETERMINATE — the approved mockup no longer draws ${what}; re-read it before changing this gate`); process.exit(2); }
}
// step 1 held's link: superseded for step 1 by kickoff_after_call_v1 (a held call can't be changed — a question, not a change)
if (!/<!-- STATUS: APPROVED/.test(after) || !/<span class="q">Questions about the call\? <a>Ask RGA ›<\/a><\/span>/.test(after)) { console.error("⚠️  INDETERMINATE — kickoff_after_call_v1 is no longer APPROVED with \"Questions about the call? Ask RGA ›\" under the held card; re-read it before changing this gate"); process.exit(2); }
if (/How this step works/.test(mock)) { console.error("⚠️  INDETERMINATE — the mockup now draws a \"How this step works\" toggle; re-read it"); process.exit(2); }

// ── 2 · the row: a done step whose plan card is the record draws no toggle, and no hairline above the card ──
if (!/const PLAN_CARD_DONE = new Set\(\["m1\.kickoff\.call", "m1\.gbp\.verify", "m1\.access\.website", "m1\.gbp\.business_facts", "m1\.strategy\.keywords_locations"\]\);/.test(src)) fail("the five plan-card steps aren't one named set (PLAN_CARD_DONE)");
// 🔄 10-23 night (approved how_this_step_works_fold_v1): no top toggle on ANY row; the how-to is the card's last fold line
if (/<button class="pm-act[^"]*" data-toggle-detail=/.test(src.replace(/^\s*\/\/.*$/gm, ""))) fail("a row draws \"How this step works ▾\" as a button at the top again (the mockup draws the card alone)");
if (!/card\.insertBefore\(f, card\.querySelector\(":scope > \.pm-pc-lnks"\) \|\| null\);/.test(src) || !/const own = \[\.\.\.card\.querySelectorAll\("\.pm-k5-fold:not\(\[data-how-fold\]\)"\)\]\.filter\(\(x\) => x\.closest\("\.pm-k5-plan"\) === card && !x\.closest\("\.pm-sgrp"\)\)\.pop\(\);/.test(src)) fail("the how-to fold isn't seated as the card's last line (or merged into the card's own fold)");
if (!/\.pm-doit:has\(\.pm-k5-plan\), \.pm-doit:has\(\.pm-hc-confirm\) \{ border-top: 0; padding-top: 0; \}/.test(css)) fail("a hairline sits between the title and the plan card again");

// ── 2b · step 12's consent (steps_6_20_clean_v1, 10-26): the client ALLOWS the tag before RGA adds it — the card, the save, the server,
// admin — and allowing never finishes the step (its own nightly count does)
{ const adm = read("admin/admin.js"), cho = read("netlify/functions/portal-step-choice.js"), pb = JSON.parse(read("data/playbooks/playbooks.json"));
  const s12 = (pb.month1 || []).find((x) => x.id === "m1.tracking.form_setup") || {};
  if (!/if \(!allowed\) \{[\s\S]{0,200}title: "One tag on your website"[\s\S]{0,700}data-ft-allow>Allow it<\/button>/.test(src)) fail("step 12 doesn't ask the client to allow the tag (\"One tag on your website\" · Allow it)");
  if (!/body: JSON\.stringify\(\{ client_id: clientId, step_id: "m1\.tracking\.form_setup", choice: "allow" \}\)/.test(src)) fail("step 12's Allow it doesn't save the client's choice");
  if (!s12.clientChoiceIsConsent || !(s12.clientChoices || []).some((c) => c.key === "allow" && c.notifyRga)) fail("step 12's Allow it isn't a consent choice that tells RGA");
  if (!/\|\| \(step\.clientChoiceIsConsent && prev\.status !== "done"\)\s*\? \{ status: "in_progress", completed_at: null \}/.test(cho)) fail("allowing the tag finishes step 12 (its nightly count must)");
  if (!/<b>Client allowed the tag<\/b>/.test(adm) || !/Don't add it before they do\./.test(adm)) fail("admin doesn't show whether the client allowed the tag");
  if (!/&& !\(step\.id === "m1\.tracking\.form_setup" && \(taskState\?\.client_choice \|\| taskState\?\.detected\?\.n90 > 0\)\);/.test(src)) fail("step 12 still says Your turn after the client allowed it"); }

// ── 2c · the last drift Chris's side-by-side caught (10-26): step 15 waiting on RGA's part draws the "Opens about" card too;
// step 18's upload is the mockup's "Upload photos" button under the card (the old card's head and copy gone); the photo
// card's "already on Google" line and step 16's rows sit flush in the card like its other rows
{ const S = css.replace(/\/\*[\s\S]*?\*\//g, "");
  if (!/\$\{rgaWait \? \(step\.id === "m1\.call\.close" \? closeWaitHtml\(step, waitTasks, rgaWaits, photos, playbook, true\) : rgaWaitHtml\(step\)\) : ""\}/.test(src)) fail("step 15 waiting on RGA's part shows the old line, not the \"Opens about\" card");
  if (!/if \(rgaPart\) rows\.push\(pcTl\("<b>Your Month 1 report<\/b> · RGA's", "", false\)\);/.test(src)) fail("step 15's waiting card doesn't name RGA's own part (the Month 1 report)");
  if (!/<div class="pm-m18-up">\$\{buildPhotoUploadHtml\([^}]*\{ compact: true \}\)\}<\/div>/.test(src) || !/opts\.compact \? `<details class="pm-m18-d"><summary class="pm-commit">Upload photos<\/summary>`/.test(src)) fail("step 18's upload isn't the mockup's \"Upload photos\" button under the card");
  if (!/opts\.compact \? "" : `<div class="portal-card-head">/.test(src) || !/compact: !!card\.closest\("\.pm-m18-up"\)/.test(src)) fail("step 18 shows the old upload card's head and copy again (or loses the button after an upload)");
  if (!/\.pm-pc-also \.pm-p2-also > summary \{ padding:10px 0; \}/.test(S)) fail("step 10's \"already on Google\" line sits squeezed against the rows above it");
  if (!/\.pm-pc-body > \.pm-rc-rows \{[^}]*margin:0;/.test(S)) fail("a gap sits under step 16's band");
  // Chris 10-26 (screenshot of step 7): "See it on Google Maps" sat at the top of a 30px box, so its row read lopsided
  if (!/\.pm-pc-lnks a, \.pm-pc-lnks button \{[^}]*display:inline-flex; align-items:center;/.test(S)) fail("a card's link row (\"See it on Google Maps\") isn't centered in its row"); }

// ── 3 · drawn in Chrome ──
const lifted = [pick(/^function escapeHtml\(/m), pick(/^function escapeAttribute\(/m), line("monthDay"), line("CLOSE_CAL_ICON"), pcSlice,
  line("ccDay"), line("ccTime"), pick(/^function kickoffDoneHtml\(/m)];
if (lifted.some((x) => !x)) { console.error(`⚠️  INDETERMINATE — a plan-card function moved (${lifted.findIndex((x) => !x)})`); process.exit(2); }
let puppeteer = null; try { ({ default: puppeteer } = await import("puppeteer")); } catch { puppeteer = null; }
if (!puppeteer) { console.error("⚠️  INDETERMINATE — puppeteer is missing"); process.exit(2); }
const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 700 });
  await page.setContent(`<html><body style="background:#f1f2f4;margin:0"><div class="pm-step-row" style="max-width:820px;margin:16px;padding:16px;background:#fff"><div class="pm-doit" id="h"></div></div></body></html>`);
  const errs = []; page.on("pageerror", (e) => errs.push(String(e.message || e)));
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: `function clientReadingZone(tz) { return tz || "America/Denver"; } function doneNoRecordHtml() { return "NO RECORD"; }\n${lifted.join("\n")}` });
  if (errs.length) { console.error(`⚠️  INDETERMINATE — the lifted code doesn't run: ${errs[0]}`); process.exit(2); }
  const r = await page.evaluate(() => {
    const h = document.getElementById("h");
    h.innerHTML = kickoffDoneHtml({}, { start: "2026-10-09T15:00:00Z", client_tz: "America/Denver", recap_sent_at: "2026-10-09T18:00:00Z" });
    const tell = h.querySelector(".pm-k5-askq"), ask = tell && tell.querySelector("button.pm-k5-asklink[data-ask]"), cs = ask ? getComputedStyle(ask) : null, doit = getComputedStyle(h);
    return { head: (h.querySelector(".pm-k5-h b") || {}).textContent, side: (h.querySelector(".pm-k5-h span") || {}).textContent,
      tl: (h.querySelector(".pm-pc-tl") || {}).innerText, tell: tell && tell.textContent, askStep: ask && ask.getAttribute("data-ask-step"), wrong: !!h.querySelector("[data-step-wrong], [data-step-edit]"),
      tellBorder: cs && cs.borderTopWidth, tellBg: cs && cs.backgroundColor, tellLine: cs && cs.textDecorationLine,
      doitBorder: doit.borderTopWidth, under: !!(tell && tell.closest(".pm-k5-acts") && !tell.closest(".pm-k5-plan")) };
  });
  if (r.head !== "Call held · Fri, Oct 9" || r.side !== "9:00 AM") fail(`step 1 held isn't "Call held · Fri, Oct 9" with 9:00 AM on the right (${r.head} · ${r.side})`);
  if (!/^Recap in your inbox\s+Oct 9$/.test(String(r.tl || "").trim())) fail(`step 1 held lost "Recap in your inbox · Oct 9" (${r.tl})`);
  if (r.tell !== "Questions about the call? Ask RGA ›" || r.askStep !== "m1.kickoff.call" || r.tellBorder !== "0px" || !/rgba\(0, 0, 0, 0\)|transparent/.test(r.tellBg || "") || r.tellLine !== "underline" || !r.under) fail(`"Questions about the call? Ask RGA ›" isn't kickoff_after_call_v1's quiet link under the card (${r.tell} · border ${r.tellBorder} · bg ${r.tellBg} · ${r.tellLine})`);
  if (r.wrong) fail("a held kickoff call offers a change request again (kickoff_after_call_v1: a question, not a change)");
  if (r.doitBorder !== "0px") fail(`a hairline (${r.doitBorder}) sits above the plan card`);
  if (process.env.SHOTS) { fs.mkdirSync(process.env.SHOTS, { recursive: true }); await (await page.$("#h")).screenshot({ path: path.join(process.env.SHOTS, "step1-held.png") }); }
  // the date speaks the CLIENT's zone, never the viewer's: 9:00 AM in Denver is 11:00 AM in New York
  const ny = await page.evaluate(() => { const h = document.getElementById("h"); h.innerHTML = kickoffDoneHtml({}, { start: "2026-10-09T15:00:00Z", client_tz: "America/New_York" }); return h.querySelector(".pm-k5-h span").textContent; });
  if (ny !== "11:00 AM") fail(`the call's time isn't in the client's own time zone (${ny})`);
} finally { await browser.close(); }

if (F.length) { console.error("🔴 the plan cards drifted from the approved mockup:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ the done plan cards are steps_1_4_clean_v1: no \"How this step works\" toggle and no hairline above a plan card (5 steps), \"Call held · Fri, Oct 9\" with the time (client's zone) on the right, \"Questions about the call? Ask RGA ›\" / \"Add your builder\" as quiet links under the card");
