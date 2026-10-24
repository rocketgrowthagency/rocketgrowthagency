#!/usr/bin/env node
// check-plan-cards-match-the-mockup.mjs — the done plan cards of client steps 1–5 are drawn as steps_1_4_clean_v1 draws them.
//
// 🔒 WHY (Chris 10-23 night, screenshots of live beside the mockup: "i really want the cards to match the mockup exactly the live
// still isnt looking good compared to mockup"). Live had drifted in small ways the per-step gates never looked at:
// - a "How this step works ▾" toggle with two hairlines above a done card the mockup draws alone;
// - "Call held · Friday, October 9 at 9:00 AM" instead of "Call held · Fri, Oct 9" with the time on the right;
// - "Something's not right?" as a boxed button instead of the mockup's quiet link.
// This gate draws the shipped functions with the shipped CSS in real Chrome and reads what a client SEES.
// Reads files only (no Supabase, no network). SHOTS=<dir> saves the card.
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = []; const fail = (m) => F.push(m);
const src = read("portal/portal.js"), css = read("portal/portal.css"), mock = read("reports/mockups/steps_1_4_clean_v1.html");
const pick = (re) => { const m = re.exec(src); if (!m) return ""; let d = 0; for (let k = src.indexOf("{", m.index); k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) return src.slice(m.index, k + 1); } } return ""; };
const line = (name) => (new RegExp(`^const ${name} = .*;$`, "m").exec(src) || [""])[0];
const pcSlice = (() => { const a = src.indexOf("const PC_TICK ="), b = src.indexOf("const pcActs ="); return a < 0 || b < 0 ? "" : src.slice(a, src.indexOf("\n", b)); })();

// ── 1 · the mockup still draws what this gate holds the product to ──
for (const [re, what] of [[/<b>Call held · Fri, Oct 9<\/b><span>9:00 AM<\/span>/, "step 1 held: \"Call held · Fri, Oct 9\" with 9:00 AM on the right"],
  [/<span class="lnk">Something's not right\?<\/span>/, "step 1 held: \"Something's not right?\" as a quiet link"],
  [/<span class="b">Edit access<\/span><span class="lnk">Add your builder<\/span>/, "step 3: Edit access + the quiet \"Add your builder\""]]) {
  if (!re.test(mock)) { console.error(`⚠️  INDETERMINATE — the approved mockup no longer draws ${what}; re-read it before changing this gate`); process.exit(2); }
}
if (/How this step works/.test(mock)) { console.error("⚠️  INDETERMINATE — the mockup now draws a \"How this step works\" toggle; re-read it"); process.exit(2); }

// ── 2 · the row: a done step whose plan card is the record draws no toggle, and no hairline above the card ──
if (!/const PLAN_CARD_DONE = new Set\(\["m1\.kickoff\.call", "m1\.gbp\.verify", "m1\.access\.website", "m1\.gbp\.business_facts", "m1\.strategy\.keywords_locations"\]\);/.test(src)) fail("the five plan-card steps aren't one named set (PLAN_CARD_DONE)");
if (!/\? \(hasDetail && !PLAN_CARD_DONE\.has\(step\.id\) \? `<button class="pm-act" data-toggle-detail=/.test(src)) fail("a done plan-card step draws \"How this step works ▾\" again (the mockup draws the card alone)");
if (!/\.pm-doit:has\(> \.pm-k5\) \{ border-top: 0; padding-top: 0; \}/.test(css)) fail("a hairline sits between the title and the plan card again");

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
    const tell = h.querySelector(".pm-k5-tell"), cs = tell ? getComputedStyle(tell) : null, doit = getComputedStyle(h);
    return { head: (h.querySelector(".pm-k5-h b") || {}).textContent, side: (h.querySelector(".pm-k5-h span") || {}).textContent,
      tl: (h.querySelector(".pm-pc-tl") || {}).innerText, tell: tell && tell.textContent, tellBorder: cs && cs.borderTopWidth, tellBg: cs && cs.backgroundColor,
      doitBorder: doit.borderTopWidth, under: !!(tell && tell.closest(".pm-k5-acts") && !tell.closest(".pm-k5-plan")) };
  });
  if (r.head !== "Call held · Fri, Oct 9" || r.side !== "9:00 AM") fail(`step 1 held isn't "Call held · Fri, Oct 9" with 9:00 AM on the right (${r.head} · ${r.side})`);
  if (!/^Recap in your inbox\s+Oct 9$/.test(String(r.tl || "").trim())) fail(`step 1 held lost "Recap in your inbox · Oct 9" (${r.tl})`);
  if (r.tell !== "Something's not right?" || r.tellBorder !== "0px" || !/rgba\(0, 0, 0, 0\)|transparent/.test(r.tellBg || "") || !r.under) fail(`"Something's not right?" isn't the mockup's quiet link under the card (border ${r.tellBorder} · bg ${r.tellBg})`);
  if (r.doitBorder !== "0px") fail(`a hairline (${r.doitBorder}) sits above the plan card`);
  if (process.env.SHOTS) { fs.mkdirSync(process.env.SHOTS, { recursive: true }); await (await page.$("#h")).screenshot({ path: path.join(process.env.SHOTS, "step1-held.png") }); }
  // the date speaks the CLIENT's zone, never the viewer's: 9:00 AM in Denver is 11:00 AM in New York
  const ny = await page.evaluate(() => { const h = document.getElementById("h"); h.innerHTML = kickoffDoneHtml({}, { start: "2026-10-09T15:00:00Z", client_tz: "America/New_York" }); return h.querySelector(".pm-k5-h span").textContent; });
  if (ny !== "11:00 AM") fail(`the call's time isn't in the client's own time zone (${ny})`);
} finally { await browser.close(); }

if (F.length) { console.error("🔴 the plan cards drifted from the approved mockup:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ the done plan cards are steps_1_4_clean_v1: no \"How this step works\" toggle and no hairline above a plan card (5 steps), \"Call held · Fri, Oct 9\" with the time (client's zone) on the right, \"Something's not right?\" / \"Add your builder\" as quiet links under the card");
