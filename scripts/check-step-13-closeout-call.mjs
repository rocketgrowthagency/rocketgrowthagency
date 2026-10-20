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

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = []; const fail = (m) => F.push(m);
const portal = read("portal/portal.js"), css = read("portal/portal.css"), admin = read("admin/admin.js");
const cs = JSON.parse(read("data/playbooks/client-steps.json"));
const step = (cs.month1 || []).find((s) => s.id === "m1.call.close");
if (!step || !Array.isArray(step.needsFirst) || step.needsFirst.length < 2) { console.error("⚠️  INDETERMINATE — step 13 or its prerequisites aren't in the projection"); process.exit(2); }

// ── 1 · wired ──
if (!/\$\{ownWait \? \(step\.id === "m1\.call\.close" \? closeWaitHtml\(step, waitTasks, rgaWaits, photos, playbook\) : ownWaitHtml\(ownFirst\)\) : ""\}/.test(portal)) fail("step 13's wait isn't the full list (it's back to one \"Do step N first\")");
if (!/const completionCtlLive = step\.id === "m1\.call\.close" \? \(ownWait \|\| isDone \? "" : closeCallHtml\(/.test(portal)) fail("step 13 shows a \"What to do\" box under the card while it waits");
if (!/o\.flowId === "m1\.call\.close" \? \(\(\) => \{[\s\S]{0,2000}title: "The close-out call opens when these are done"/.test(admin) || !/r\?\.obj\?\.clientFacing \? "client's move" : "RGA's move"/.test(admin) || !/state: rgaN \? "rga" : "you", small: rgaN \? "Your move" : "Client's move", side: `\$\{rgaN\} yours · \$\{clientN\} the client's`/.test(admin)) fail("admin row 60 doesn't list what the call waits on with whose move");
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
  await page.addScriptTag({ content: [...lift, "const LATER_STEPS = { 'm1.gbp.photos': 'photos' }; function laterDay(u) { return new Date(u).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }); }"].join("\n") });
  R = await page.evaluate((cs) => {
    const step = cs.month1.find((s) => s.id === "m1.call.close");
    const done = { status: "done" }, h = document.getElementById("h");
    const base = Object.fromEntries(step.needsFirst.map((id) => [id, done]));
    const draw = (tasks, rga) => { h.innerHTML = closeWaitHtml(step, tasks, rga, [], cs);
      return { text: h.innerText.replace(/\s+/g, " ").trim(), cls: h.querySelector(".gcard")?.className, rows: h.querySelectorAll(".pm-cw-r").length, ticks: h.querySelectorAll(".pm-cw-s.on").length, go: (h.querySelector(".pm-cw-go") || {}).textContent || "" }; };
    const far = Date.now() + 5 * 86400000;
    return {
      rga: draw({ ...base, "m1.gbp.photos": { status: "pending", later: { until: new Date(far).toISOString(), set_at: new Date().toISOString() } }, "m1.review.first_5": { status: "pending" }, "m1.kickoff.call": { status: "done", completed_at: "2026-10-09T16:11:50Z" } }, new Set(["m1.review.first_5"])),
      rgaOnly: draw({ ...base, "m1.review.first_5": { status: "pending" } }, new Set(["m1.review.first_5"])),
      noKick: draw({ ...base, "m1.gbp.photos": { status: "pending" } }, new Set()),
      n: step.needsFirst.length,
    };
  }, cs);
} finally { await browser.close(); }
if (R.rga.rows !== R.n || R.rga.ticks !== R.n - 2) fail(`the wait doesn't list every prerequisite with ✓ on the done ones (${R.rga.rows} rows, ${R.rga.ticks} ✓ of ${R.n})`);
if (!/^2 steps left We book this call when these are done Month 1 ends about Nov 8/i.test(R.rga.text) || R.rga.cls !== "gcard you") fail(`the card doesn't say how many are left and Month 1's end (kickoff + 30 days) (${R.rga.text.slice(0, 120)})`);
if (!/8 · Provide 20\+ business photos yours · reminder /.test(R.rga.text) || !/12 · Ask your 5 most recent customers for a review RGA first, then yours/.test(R.rga.text)) fail("each open prerequisite doesn't say whose move it is (yours · reminder / RGA first, then yours)");
if (R.rga.go !== "Go to step 8") fail(`"Go to" doesn't point at the first step the client can do now (${R.rga.go})`);
if (R.rgaOnly.go) fail("a step that waits on RGA is offered as the client's next move");
if (/Month 1 ends/.test(R.noKick.text)) fail("Month 1's end date shows before the kickoff (a guess)");

if (F.length) { console.error("🔴 Step 13 isn't the approved close-out call:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ step 13 waits honestly: every prerequisite ✓ or whose move (yours · reminder / RGA first), N left, Month 1's end from the kickoff, Go to the first step they can do; no What-to-do box; admin row 60 lists them with whose move");
