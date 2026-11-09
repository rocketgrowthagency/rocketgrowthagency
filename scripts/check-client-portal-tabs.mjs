#!/usr/bin/env node
// check-client-portal-tabs.mjs — 2026-10-30. Chris's five calls on client_portal_tabs_v1 ("approved"): the tabs around the steps. → project_client_card_system
//
// RUNS the real card code in a blank Chrome page (every request refused). Nothing leaves the laptop.
//   1 · Ongoing during setup says what the REAL steps say: numbers + video every 3 months, video optional, no photo quota; posts, replies, win story and report are named. Read against the playbook, so it can't drift again
//   2 · Rankings · Reports · Reviews during setup: one card each, no "campaign goes live", no "once service begins". A check row only when there was a check; "not in the top 20" only when nothing ranked
//   3 · Dashboard: one count, To do's; the button says To do and goes there; the empty results box is gone
//   4 · Setup: the Step 1–4 cards NEVER leave the page (Chris 10-30 reversed call 4)
//   5 · Rankings + Reports after setup: the zeros aren't repeated in a sentence
// exit 0 = holds · 1 = regressed · 2 = can't tell
import fs from "node:fs";
import { planCardKit } from "./lib/plan-card-kit.mjs";
import { csBlock } from "./lib/portal-cs.mjs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = [], fail = (m) => F.push(m);
const moved = (w) => { console.error(`⚠️  INDETERMINATE — portal.js ${w} moved; re-read it before trusting this gate`); process.exit(2); };
const P = read("portal/portal.js"), CSS = read("portal/portal.css");
const fn = (name) => { const at = P.indexOf(`\nfunction ${name}(`); if (at < 0) moved(`function ${name}`); const end = P.indexOf("\n}\n", at); if (end < 0) moved(`function ${name}`); return P.slice(at + 1, end + 2); };
const line = (n) => { const m = new RegExp(`^(?:const|let) ${n} = .*;(?:\\s*//.*)?$`, "m").exec(P); if (!m) moved(`const ${n}`); return m[0]; };
const between = (a, b) => { const i = P.indexOf(a), j = P.indexOf(b, i + 1); if (i < 0 || j < 0) moved(`"${a}"`); return P.slice(i, j); };

// ── the seats ──
const playbook = JSON.parse(read("data/playbooks/client-steps.json"));
const steps = []; (function walk(x) { if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === "object") { if (typeof x.id === "string" && x.id.startsWith("m2.")) steps.push(x); Object.values(x).forEach(walk); } })(playbook);
const stepOf = (id) => steps.find((s) => s.id === id);
for (const id of ["m2.snap.business_outcomes", "m2.exec.youtube_video"]) if (!stepOf(id)) { console.error(`⚠️  INDETERMINATE — ${id} isn't in the playbook`); process.exit(2); }
if (/a month/i.test(String(stepOf("m2.exec.youtube_video").clientInstructions || "").split("\n")[0]) || /One short video a month/.test(read("data/playbooks/playbooks.json"))) fail("step 19's How says a video a month; its label and Skip button say quarter");
if (!/quarter/i.test(stepOf("m2.exec.youtube_video").clientLabel || "") || !stepOf("m2.exec.youtube_video").clientOptional) fail("the video isn't quarterly and optional any more: re-read the Ongoing card's words");
if (!/3 months/i.test(stepOf("m2.snap.business_outcomes").clientLabel || "")) fail("the numbers aren't every 3 months any more: re-read the Ongoing card's words");
for (const w of ["once your campaign goes live", "Once service begins we track", "Your results appear here once your campaign is live", "You have <strong>0</strong> data points", "reports so far", "View Action Items"]) if (P.includes(w)) fail(`old words are back: "${w}"`);
if (!/data-portal-goto="\$\{action\.goto \|\| \(\/To do\/\.test\(action\.btn\) \? "approvals" : "setup"\)\}"/.test(P)) fail("Go to To do doesn't open To do");
if (!/const n = _todoTotalN != null \? Math\.max\(0, _todoTotalN - \(mine\.length - n0\)\)/.test(P)) fail("the next-step card doesn't use To do's number");
if (!/if \(_todoTotalN !== todoN\) \{ _todoTotalN = todoN;/.test(P)) fail("To do's number doesn't reach the next-step card");
// 🔒 Chris 10-30: "client portal now lost all steps 1-4 … should be in memory to never be lost". The four stay on the page, always.
if (!/const stackedStagesHtml = progressBarHtml \+ buildStackedStagesHtml\(stage, ctx\);/.test(P) || /buildSetupLeanHtml|pm-setup-lean/.test(P + CSS)) fail("the Setup tab's Step 1–4 cards can leave the page");
if (!/quick steps to launch your Google Maps campaign/.test(P)) fail("the Setup tab's heading about its steps is gone");
if (!/<span><i class="pm-sw rga"><\/i> RGA is on it<\/span>/.test(P)) fail("the key's words don't match the pills");
if (!/\.pm-rv-tab \.pm-og-row > \.pm-step-row-head \{ display:none; \}/.test(CSS)) fail("the Reviews tab draws a step row around its card");

// ── drawn ──
let puppeteer = null; try { ({ default: puppeteer } = await import("puppeteer")); } catch { puppeteer = null; }
if (!puppeteer) { console.error("⚠️  INDETERMINATE — puppeteer is missing"); process.exit(2); }
const lifted = [
  `var _portalPlaybook = null; var _reviewCadence = new Map(); function portalStepNo() { return 16; } function ogHostStub() { return ""; } function listCycle() { return { start: Date.parse("2026-10-26T12:00:00Z"), due: Date.parse("2026-11-02T12:00:00Z") }; } function currentWeekLabel() { return "Week of October 26"; } function reviewsLoading() { return ""; }`,
  fn("escapeHtml"), fn("escapeAttribute"), line("monthDay"), line("CADENCE"), (() => { const i = P.indexOf("const CA_CELL_RANK = (v) => {"), j = P.indexOf("\n};", i); if (i < 0 || j < 0) moved("const CA_CELL_RANK"); return P.slice(i, j + 3); })(),
  between("const ogRowHtml = (", "const _ogData = new Map();"),
  fn("setupRankingsHtml"), fn("setupReportsHtml"), fn("setupReviewsHtml"), fn("buildOngoingWorkHtml"),
];
const kit = planCardKit(P, lifted.join("\n"));
const src = [lifted[0], lifted[1], lifted[2], lifted[3], kit, csBlock(P, kit), ...lifted.slice(4)].join("\n");
const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
let R;
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 400, height: 900 });
  await page.setRequestInterception(true);
  page.on("request", (r) => (r.url() === "about:blank" || r.url().startsWith("data:") ? r.continue() : r.abort()));
  const errs = []; page.on("pageerror", (e) => errs.push(String(e.message || e)));
  await page.setContent(`<!doctype html><html><body style="margin:0"><div id="h" style="padding:0 16px"></div></body></html>`);
  await page.addStyleTag({ content: CSS });
  await page.addScriptTag({ content: src });
  if (errs.length) { console.error(`⚠️  INDETERMINATE — the lifted cards won't load: ${errs[0]}`); await browser.close(); process.exit(2); }
  R = await page.evaluate(() => {
    const H = document.getElementById("h");
    const draw = (html) => { H.innerHTML = html; return { text: H.innerText.replace(/\s+/g, " ").trim(), cards: H.querySelectorAll(".pm-cs-card").length, oldCards: H.querySelectorAll(".pm-oc").length, off: !!H.querySelector(".pm-cs-card.off"), wider: document.documentElement.scrollWidth > 400, goto: (H.querySelector("[data-portal-goto]") || {}).getAttribute?.("data-portal-goto") || null, feed: !!H.querySelector("[data-reviews-feed]") }; };
    const on = (over = {}) => draw(buildOngoingWorkHtml({ isSetupPhase: true, customerListHtml: "<div>list</div>", photoUploadHtml: "", customerLists: [], month2StepsHtml: "", clientId: "c1", ...over }));
    const AT = "2026-10-06T12:00:00Z";
    return {
      ongoing: on(), ongoingSent: on({ customerLists: [{ week_label: "Week of October 26" }] }),
      month2: draw(buildOngoingWorkHtml({ isSetupPhase: false, customerListHtml: "", photoUploadHtml: "", customerLists: [], month2StepsHtml: "<div>m2</div>", clientId: "c1" })),
      afterNoSteps: draw(buildOngoingWorkHtml({ isSetupPhase: false, customerListHtml: "", photoUploadHtml: "", customerLists: [], month2StepsHtml: "", clientId: "c1" })),
      rNone: draw(setupRankingsHtml([])), rMiss: draw(setupRankingsHtml([{ measured_at: AT, map_rank: null }])),
      rHit: draw(setupRankingsHtml([{ measured_at: AT, map_rank: 7 }, { measured_at: AT, map_rank: 3 }, { measured_at: "2026-09-15T12:00:00Z", map_rank: 1 }])),
      rep: draw(setupReportsHtml()), rev: draw(setupReviewsHtml("c1")),
    };
  });
} catch (e) { console.error(`⚠️  INDETERMINATE — the lifted cards threw: ${String(e.message || e).slice(0, 220)}`); await browser.close(); process.exit(2); } finally { await browser.close().catch(() => {}); }

const has = (o, ...w) => w.every((x) => o.text.toLowerCase().includes(x.toLowerCase()));   // a pill's words are uppercase by CSS
if (R.ongoing.oldCards) fail("Ongoing during setup still draws the old cards");
if (/Starts after setup/.test(R.ongoing.text.replace(/^[\s\S]*?Starts after setup/, "")) ) fail("“Starts after setup” is repeated on each line again");
if (!R.ongoing.off || !has(R.ongoing, "Starts after setup", "nothing needed yet")) fail(`the grey card isn't there (${R.ongoing.text.slice(0, 200)})`);
if (!/Your numbers [^]*?Every 3 months A customer win story/.test(R.ongoing.text)) fail(`the numbers aren't every 3 months (${R.ongoing.text.slice(0, 300)})`);
for (const w of ["Your numbers", "A customer win story", "New photos", "No monthly quota", "A short video", "Every 3 months · optional", "Your check-in call", "We email you when it's ready", "Google posts", "Nothing posts until you approve", "Review replies"]) if (!has(R.ongoing, w)) fail(`Ongoing during setup leaves out "${w}"`);
if (/5 new photos|5-minute form/.test(R.ongoing.text)) fail("Ongoing during setup repeats the untrue words");
if (!has(R.ongoing, "This week's customer list", "Your turn", "Weekly · Oct 26 – Nov 1") || !has(R.ongoingSent, "Sent")) fail(`the customer list isn't on the Month 2 row (${R.ongoing.text.slice(0, 200)})`);
if (R.month2.oldCards || /Starts after setup/.test(R.month2.text + R.afterNoSteps.text)) fail("after setup, Ongoing shows the preview");
if (!has(R.rNone, "Your rank tracking shows here after setup") || /Last check/.test(R.rNone.text) || R.rNone.goto !== "approvals") fail(`no check yet still draws one, or the link doesn't open To do (${R.rNone.text})`);
if (!has(R.rMiss, "Last check", "Not in the top 20 yet", "Oct 6")) fail(`a check with nothing found isn't said (${R.rMiss.text})`);
if (!has(R.rHit, "Best rank #3") || /Not in the top 20/.test(R.rHit.text)) fail(`a rank found reads wrong; only the last check counts (${R.rHit.text})`);
if (!has(R.rep, "Your first report comes after your first full month", "We email you")) fail("Reports during setup isn't the approved card");
if (!R.rev.feed) fail("Reviews during setup doesn't read the live reviews");
for (const [k, o] of Object.entries(R)) if (o.wider) fail(`${k} is wider than a 400px phone`);

if (F.length) { console.error(`🔴 client_portal_tabs_v1 isn't what Chris approved:\n${F.map((x) => `   · ${x}`).join("\n")}`); process.exit(1); }
console.log("✅ client_portal_tabs_v1 holds: Ongoing during setup says what the real steps say; Rankings, Reports and Reviews say what's true; one count, To do's; the Setup tab keeps its Step 1–4; no old words");
