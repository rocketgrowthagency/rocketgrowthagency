#!/usr/bin/env node
// check-step-13-closeout-call.mjs — client step 13 "Attend your Month 1 close-out call" (admin row 60) is the approved build:
//   · while it waits: EVERYTHING the call waits on, each ✓ or with whose move it is (yours · yours with the reminder date ·
//     RGA first, then yours), never one "Do step N first" at a time; "N steps left"; Month 1's end date (kickoff + 30 days,
//     computed, never stored); "Go to step N" for the first one the client can do now (not one waiting on RGA)
//   · no "What to do" box under the card while it waits
//   · admin row 60 lists what the call waits on, each with whose move it is
//
// 🔒 WHY (approved step13_closeout_call_v1, 2026-10-16; Chris: "all approved. be sure as always they tie to admin, and databse
// and all are synced"). The step said "Do step 8 first" while it also needed step 12 (which waited on RGA), gave no date
// ("at the end of month 1"), and showed an amber band and a blue "What to do" box on one step.
import fs from "node:fs";
import { planCardKit } from "./lib/plan-card-kit.mjs";
import { csBlock } from "./lib/portal-cs.mjs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = []; const fail = (m) => F.push(m);
const portal = read("portal/portal.js"), css = read("portal/portal.css"), admin = read("admin/admin.js");
const cs = JSON.parse(read("data/playbooks/client-steps.json"));
const step = (cs.month1 || []).find((s) => s.id === "m1.call.close");
if (!step || !Array.isArray(step.needsFirst) || step.needsFirst.length < 2) { console.error("⚠️  INDETERMINATE — step 13 or its prerequisites aren't in the projection"); process.exit(2); }

// ── 1 · wired ──
if (!/\$\{ownWait \? \(step\.id === "m1\.call\.close" \? (?:ccWrap\()?closeWaitHtml\(step, waitTasks, rgaWaits, photos, playbook\)\)? : (?:gaByRga \? `[^`]*` : )?ownWaitHtml\(ownFirst\)\) : ""\}/.test(portal)) fail("step 13's wait isn't the full list (it's back to one \"Do step N first\")");
// 🔄 10-20 (walk): the picker also waits on RGA's part (the report) — ownWait || rgaWait || isDone
if (!/: step\.id === "m1\.call\.close" \? \(ownWait \|\| rgaWait \|\| isDone \? "" : (?:ccWrap\()?closeCallHtml\(/.test(portal)) fail("step 13 shows a \"What to do\" box under the card while it waits");
if (!/o\.flowId === "m1\.call\.close" \? \(\(\) => \{[\s\S]{0,2000}title: (?:"The Month 1 review|`The \$\{CALL_NAMES\.m1_review\}) opens when these are done["`]/.test(admin) || !/r\?\.obj\?\.clientFacing \? "client's move" : "RGA's move"/.test(admin) || !/state: rgaN \? "rga" : "you", small: rgaN \? "Your move" : "Client's move", side: `\$\{rgaN\} yours · \$\{clientN\} the client's`/.test(admin)) fail("admin row 60 doesn't list what the call waits on with whose move");
if ((css.match(/^\.pm-cw \{/gm) || []).length !== 1) fail("the waiting list isn't styled once");

// ── 2 · drawn for real ──
const pick = (re) => { const m = re.exec(portal); if (!m) return ""; let d = 0; for (let k = portal.indexOf(") {", m.index) + 2; k < portal.length; k++) { if (portal[k] === "{") d++; else if (portal[k] === "}") { d--; if (!d) return portal.slice(m.index, k + 1); } } return ""; };
const line = (n) => (new RegExp(`^const ${n} = .*;$`, "m").exec(portal) || [""])[0];
const lift = [pick(/^function escapeHtml\(/m), pick(/^function escapeAttribute\(/m), line("GOOGLE_G"), line("GC_ICON"), line("CLOSE_CAL_ICON"), pick(/^function googleCardHtml\(/m), line("monthDay"),
  pick(/^function month1EndOf\(/m), pick(/^function closeWaitHtml\(/m), pick(/^function rowRgaWaits\(/m), pick(/^function laterOf\(/m)];
if (lift.some((x) => !x)) { console.error(`⚠️  INDETERMINATE — a step-13 helper moved (${lift.findIndex((x) => !x)})`); process.exit(2); }
let puppeteer = null; try { ({ default: puppeteer } = await import("puppeteer")); } catch { puppeteer = null; }
if (!puppeteer) { console.error("⚠️  INDETERMINATE — puppeteer is missing"); process.exit(2); }
const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
let R;
try {
  const page = await browser.newPage();
  await page.setContent("<html><body><div id=h></div></body></html>");
  await page.addStyleTag({ content: css });
  // 🔄 10-30 (client_step15_closeout_call_v1, card system batch 2): closeWaitHtml asks CS_STEPS — lift the CS block; draw the system card
  // (what the client sees) AND the old plan card (CS_STEPS emptied)
  const kit = planCardKit(portal, lift.join("\n"));
  await page.addScriptTag({ content: [...lift, kit, csBlock(portal, `${lift.join("\n")}\n${kit}`), "var __CS_ALL = [...CS_STEPS];", "const LATER_STEPS = { 'm1.gbp.photos': 'photos' }; function laterDay(u) { return new Date(u).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }); }"].join("\n") });
  R = await page.evaluate((cs) => {
    if (!CS_STEPS.has("m1.call.close")) return null;
    const step = cs.month1.find((s) => s.id === "m1.call.close");
    const done = { status: "done" }, h = document.getElementById("h");
    const base = Object.fromEntries(step.needsFirst.map((id) => [id, done]));
    const draw = (tasks, rga) => { h.innerHTML = closeWaitHtml(step, tasks, rga, [], cs);
      // 🔄 10-26 (steps_6_20_clean_v1, step 15 waiting): the plan card — a timeline row per prerequisite (drawn ✓ when done)
      return { text: h.innerText.replace(/\s+/g, " ").trim(), cls: h.querySelector(".pm-k5-plan")?.className, rows: h.querySelectorAll(".pm-pc-tl").length, ticks: h.querySelectorAll(".pm-pc-tl:not(.wait)").length, go: (h.querySelector(".pm-cw-go") || {}).textContent || "",
        cards: h.querySelectorAll(".pm-k5-plan").length, evs: [...h.querySelectorAll(".pm-cs-ev")].map((e) => `${e.querySelector(".mk")?.className.replace(/^mk /, "")}|${e.innerText.replace(/\s+/g, " ").trim()}`) }; };
    const far = Date.now() + 5 * 86400000;
    const all = () => ({
      // 🔄 10-20 (approved phase3_4_reviews_close_v1): the call waits only on what the REPORT needs — Google access + the keyword plan
      rga: draw({ ...base, "m1.access.analytics": { status: "pending" }, "m1.strategy.keywords_locations": { status: "pending" }, "m1.kickoff.call": { status: "done", completed_at: "2026-10-09T16:11:50Z" } }, new Set(["m1.strategy.keywords_locations"])),
      yours: draw({ ...base, "m1.strategy.keywords_locations": { status: "pending" } }, new Set()),
      rgaOnly: draw({ ...base, "m1.strategy.keywords_locations": { status: "pending" } }, new Set(["m1.strategy.keywords_locations"])),
      noKick: draw({ ...base, "m1.access.analytics": { status: "pending" } }, new Set()),
      n: step.needsFirst.length,
    });
    const sys = all();
    CS_STEPS.clear();
    const old = all();
    for (const id of __CS_ALL) CS_STEPS.add(id);
    return { sys, old };
  }, cs);
} finally { await browser.close(); }
if (!R) { console.error("⚠️  INDETERMINATE — the close-out isn't on the card system; re-read which card it draws"); process.exit(2); }
// ── the system card (approved client_step15_closeout_call_v1): ONE grey card "Opens about <date> · N steps left", then ONLY what's
// left — each marked whose it is (you amber · RGA blue), never the done ones, never a second card
{ const S = R.sys;
  if (S.rga.cards !== 1 || S.rga.cls !== "pm-k5-plan pm-cs-card off") fail(`the waiting close-out isn't ONE grey system card (${S.rga.cards} cards · ${S.rga.cls})`);
  if (!/^Opens about Nov 5 · 2 steps left/.test(S.rga.text)) fail(`the system card's band isn't "Opens about <date> · N steps left" (${S.rga.text.slice(0, 80)})`);
  const want = [/^you\|Grant RGA access to Google Analytics[^·]*· yours$/, /^rga\|Your keyword plan · RGA's$/];
  if (S.rga.evs.length !== 2 || want.some((w) => !S.rga.evs.some((e) => w.test(e)))) fail(`the system card doesn't list ONLY what's left, each marked whose (${JSON.stringify(S.rga.evs)})`);
  if (S.rga.rows || /\bdone\b|✓/i.test(S.rga.evs.join(" "))) fail("the system card lists the done prerequisites too (only what's LEFT)");
  // a step RGA finishes (the keyword plan) is RGA's row even when nothing waits on RGA — never the client's
  if (S.yours.evs.length !== 1 || !/^rga\|Your keyword plan · RGA's$/.test(S.yours.evs[0])) fail(`a step RGA finishes (the keyword plan) isn't one blue "RGA's" row (${JSON.stringify(S.yours.evs)})`);
  if (S.rgaOnly.evs.length !== 1 || !/^rga\|/.test(S.rgaOnly.evs[0]) || S.rgaOnly.go) fail(`a step waiting on RGA isn't marked RGA's (or is offered as their move) (${JSON.stringify(S.rgaOnly.evs)})`);
  if (!/^Opens near the end of Month 1/.test(S.noKick.text) || /Opens about/.test(S.noKick.text)) fail(`before the kickoff the system card guesses a date (${S.noKick.text.slice(0, 60)})`); }
// ── the old plan card (CS_STEPS emptied) keeps steps_6_20_clean_v1 ──
R = R.old;
if (R.rga.rows !== R.n || R.rga.ticks !== R.n - 2) fail(`the wait doesn't list every prerequisite with ✓ on the done ones (${R.rga.rows} rows, ${R.rga.ticks} ✓ of ${R.n})`);
if (!/^Opens about Nov 5 2 steps left /i.test(R.rga.text) || !/Month 1 ends about Nov 8\./.test(R.rga.text) || R.rga.cls !== "pm-k5-plan wait") fail(`the card doesn't say how many are left, when it opens and Month 1's end (kickoff + 30 days) (${R.rga.text.slice(0, 120)})`);
if (!/Anything still open carries into Month 2; nothing waits for it/.test(R.rga.text)) fail("the card doesn't say open steps carry into Month 2 (Month 1 closes on a date)");
if (!/Grant RGA access to Google Analytics[^·]*· yours/.test(R.rga.text) || !/Your keyword plan · RGA's/.test(R.rga.text)) fail(`each open prerequisite doesn't say whose move it is (yours / RGA's move for a step RGA finishes) (${R.rga.text.slice(0, 300)})`);
if (/keyword plan/i.test(R.yours.go)) fail("a step RGA finishes (the keyword plan) is offered as the client's next move");
if (R.rgaOnly.go) fail("a step that waits on RGA is offered as the client's next move");
if (/Month 1 ends/.test(R.noKick.text)) fail("Month 1's end date shows before the kickoff (a guess)");

if (F.length) { console.error("🔴 Step 13 isn't the approved close-out call:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ step 13 waits honestly: every prerequisite ✓ or whose move (yours · reminder / RGA first), N left, Month 1's end from the kickoff, Go to the first step they can do; no What-to-do box; admin row 60 lists them with whose move");
