#!/usr/bin/env node
// check-the-monthly-pagespeed-reads-field-data-honestly.mjs
// The monthly site audit sends the PageSpeed key, reads Google's real-user (field) data including INP, and never lets a
// missing reading look like a number: no field data says "none", never 0 and never "good"; a failed call is an error,
// not a score; the key is never written into any text. File-only, stubbed: no network, the response is a fixture.
// Exit 0 pass · 1 fail · 2 indeterminate.
import fs from "node:fs";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const require = createRequire(import.meta.url);
let f, flow;
try { f = require(`${SITE}/netlify/functions/_site-facts.js`); flow = fs.readFileSync(`${SITE}/netlify/functions/flow-execute.js`, "utf8"); }
catch (e) { console.error("INDETERMINATE: cannot read the site files: " + e.message); process.exit(2); }
const fails = []; const F = (m) => fails.push(m);
const m = (lcp, inp, cls) => ({ metrics: {
  ...(lcp != null && { LARGEST_CONTENTFUL_PAINT_MS: { percentile: lcp } }),
  ...(inp != null && { INTERACTION_TO_NEXT_PAINT: { percentile: inp } }),
  ...(cls != null && { CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: cls } }) } });
// full data
let r = f.fieldData({ loadingExperience: m(2100, 180, 5) });
if (!r.available || r.lcp_ms !== 2100 || r.inp_ms !== 180 || r.cls !== 0.05 || r.source !== "this page") F("full field data is not read (LCP, INP, CLS/100)");
if (!/INP=180 ms/.test(f.fieldDataLine({ loadingExperience: m(2100, 180, 5) }))) F("INP is not in the line");
// INP missing is not 0
r = f.fieldData({ loadingExperience: m(2100, null, 5) });
if (r.inp_ms !== null) F("a missing INP became " + r.inp_ms);
if (!/INP=not reported/.test(f.fieldDataLine({ loadingExperience: m(2100, null, 5) }))) F("a missing INP is not said to be missing");
// page has none, origin has some -> origin, labelled
r = f.fieldData({ loadingExperience: { metrics: {} }, originLoadingExperience: m(3000, 250, 12) });
if (!r.available || r.source !== "the whole site") F("the site-wide fallback is not used or not labelled");
// no data at all, in every shape Google can return or we can be handed
for (const x of [null, undefined, {}, { loadingExperience: {} }, { loadingExperience: { metrics: {} } }, { loadingExperience: { metrics: { INTERACTION_TO_NEXT_PAINT: { percentile: "fast" } } } },
  { loadingExperience: { metrics: { INTERACTION_TO_NEXT_PAINT: { percentile: NaN } } } }, "text", 5, []]) {
  const d = f.fieldData(x), line = f.fieldDataLine(x);
  if (d.available || d.lcp_ms !== null || d.inp_ms !== null || d.cls !== null) F("no field data was read as data: " + JSON.stringify(x));
  if (!/none/.test(line) || /good|=0\b/.test(line)) F("no field data does not say none: " + line);
}
// the percentile 0 is a real reading and must stay a number
if (f.fieldData({ loadingExperience: m(1000, 0, 0) }).inp_ms !== 0) F("a genuine 0 reading was dropped");
// the audit wiring
const at = flow.indexOf("const psiTargets");
const blk = at < 0 ? "" : flow.slice(at, at + 3200);
if (!blk) { console.error("INDETERMINATE: the monthly audit's PSI block moved"); process.exit(2); }
if (!/process\.env\.GOOGLE_PAGESPEED_API_KEY/.test(blk) || !/&key=\$\{psiKey\}/.test(blk)) F("the monthly audit does not send the PageSpeed key");
if (!/fieldData\(data\)/.test(blk) || !/fieldDataLine\(data\)/.test(blk)) F("the monthly audit does not read field data");
if (/\(cats\.(performance|seo)\?\.score \|\| 0\)/.test(blk) || !/Math\.round\(v \* 100\) : null\)/.test(blk)) F("a missing score is turned into 0");
if (!/error: "PSI call failed"/.test(blk) || /error: e\.message/.test(blk)) F("a thrown error is not recorded as an error without its text");
if (!/PSI returned no scores/.test(blk)) F("a response with no scores is recorded as a score");
const outs = blk.match(/summary:[^\n]*|outcome_data[^\n]*|psiLines[^\n]*|error:[^\n]*/g) || [];
if (outs.some((l) => /psiKey/.test(l))) F("the key is written into a result or error");
if (fails.length) { console.error("FAIL monthly PageSpeed:"); for (const x of fails) console.error("   - " + x); process.exit(1); }
console.log("PASS monthly PageSpeed field data (stubbed, fixtures): full, INP missing, origin fallback, 10 no-data shapes, real 0 kept, key sent and never printed");
