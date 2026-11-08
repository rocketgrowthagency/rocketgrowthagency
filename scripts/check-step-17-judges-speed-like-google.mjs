#!/usr/bin/env node
/**
 * check-step-17-judges-speed-like-google.mjs — step 17 (page speed) by the approved recipe (step17_speed_and_send_now_v1 #1, the owner 11-7).
 * Google ranks on real visits (28 days, 75th percentile): good = LCP <= 2.5 s, INP <= 200 ms, CLS <= 0.1. Real-visit data decides when it exists;
 * without it the lab decides on the same lines, a reading within a quarter of a line is "Done, watched" (re-read in 30 days), clearly over is a fix
 * that names the cause. RGA's step 17 (lab 2.2 s / 70 ms / 0.116) was RGA's move over a number a hair over the line.
 * Exit 0 = holds. 1 = doesn't. 2 = couldn't tell.
 */
import path from "node:path";
import { createRequire } from "node:module";
import fs from "node:fs";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const req = createRequire(import.meta.url);
let PS; try { PS = req(path.join(SITE, "netlify/functions/_page-speed.js")); } catch (e) { console.error(`⚠️  INDETERMINATE — ${e.message}`); process.exit(2); }
const bad = [], fail = (m) => bad.push(m), now = new Date("2026-11-07T12:00:00Z");
const lab = (lcp, cls, tbt, extra = {}) => ({ lighthouseResult: { categories: { performance: { score: 0.9 } }, audits: { "largest-contentful-paint": { numericValue: lcp }, "cumulative-layout-shift": { numericValue: cls }, "total-blocking-time": { numericValue: tbt }, "layout-shifts": { details: { items: [{ node: { nodeLabel: "Hero image" } }] } }, "unsized-images": { details: { items: [{ url: "https://x.test/a.jpg" }] } } } }, ...extra });
const field = (lcp, inp, cls) => ({ loadingExperience: { metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: lcp }, INTERACTION_TO_NEXT_PAINT: { percentile: inp }, CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: cls } } } });
const J = (j) => PS.judge(j, now);
const rga = J(lab(2200, 0.116, 70));
if (rga.outcome !== "ok" || !/Done, watched: re-read Dec 7/.test(rga.summary) || !/Biggest shift: Hero image/.test(rga.summary) || rga.outcome_data.speed.recheck_at !== "2026-12-07") fail(`RGA: a reading a hair over the line isn't "Done, watched" with the cause and a re-read (${rga.outcome}: ${rga.summary})`);
if (J(lab(1800, 0.05, 50)).outcome !== "verified") fail("all good in the lab isn't already right");
const slow = J(lab(5200, 0.31, 900));
if (slow.outcome !== "needs_fix" || !/It needs a fix/.test(slow.summary) || !/Images with no size: https:\/\/x\.test\/a\.jpg/.test(slow.summary)) fail("clearly slow isn't a fix that names the cause");
if (J({ ...lab(5200, 0.31, 900), ...field(2000, 150, 5) }).outcome !== "verified") fail("good real-visit data doesn't decide over a bad lab run");
if (J({ ...lab(1800, 0.05, 50), ...field(2000, 150, 11) }).outcome !== "needs_fix") fail("real-visit data a hair over the line passes (it decides when it exists: no watched band)");
if (J({}).outcome !== "indeterminate") fail("no numbers reads as a result");
if (PS.GOOD.lcp !== 2500 || PS.GOOD.inp !== 200 || PS.GOOD.cls !== 0.1 || PS.POOR.cls !== 0.25) fail("Google's lines changed");
const FE = fs.readFileSync(path.join(SITE, "netlify/functions/flow-execute.js"), "utf8"), AR = fs.readFileSync(path.join(SITE, "netlify/functions/_website-autorun.js"), "utf8");
if (!/return require\("\.\/_page-speed"\)\.judge\(await r\.json\(\)\);/.test(FE)) fail("step 17's runner doesn't use the recipe");
if (!/!done\["redo:speed_v1"\]/.test(AR) || !/redo:recheck:\$\{sp\.recheck_at\}/.test(AR)) fail("an old reading isn't measured again by the recipe, or a watched reading isn't re-read when due");
// #3 of the same approval (RGA's step 45): a line outside the main area that's on most of the site's other pages is the site's shared banner
{ const PF = req(path.join(SITE, "netlify/functions/_page-file.js"));
  const page = (own, banner = true) => `<html><body><header>Nav</header><main><h1>x</h1></main>${banner ? `<section class="cta">Book Your Free Growth Audit today</section>` : ""}${own ? `<section>${own}</section>` : ""}<footer>Foot</footer></body></html>`;
  // 🔑 the 11-7 case: the ONE page it was compared with has no banner, most of the others do (a reference that also carried the banner
  // could not tell "on the compared page" from "on most pages", so dropping the others went unseen; 11-7 night fixer)
  const extra = PF.pageOnlyWords(page("This sentence belongs to the template page only, nowhere else"), page("", false), [page(""), page(""), page("")]);
  if (extra.some((x) => /Book Your Free Growth Audit/.test(x))) fail("a banner on most of the site's pages counts as the template's own words (step 45)");
  if (!extra.some((x) => /belongs to the template page only/.test(x))) fail("a line only the template has slips through"); }
if (bad.length) { console.error(`❌ step 17 — ${bad.length} regression(s):`); for (const b of bad) console.error(`  · ${b}`); process.exit(1); }
console.log("✅ step 17 judges speed like Google: real visits decide when they exist, the lab on the same lines otherwise, a hair over = Done, watched (re-read in 30 days), clearly over = a fix naming the cause");
