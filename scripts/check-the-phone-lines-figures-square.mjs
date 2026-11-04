#!/usr/bin/env node
// check-the-phone-lines-figures-square.mjs: the monthly report's phone section never shows figures that disagree.
// 2026-11-04: RGA's October read "Calls to your line 0 · Answered 0 · Missed 7". total_calls is only calls answered AND 30 seconds
// or more; Answered and Missed come from the provider's whole list of calls. The total shown beside them must be that whole list
// (answered + missed), and when it can't be squared the three are not shown. File-only: lifts the two helpers from report.js.
import fs from "node:fs";
import vm from "node:vm";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const R = fs.readFileSync(`${SITE}/portal/report/report.js`, "utf8");
const F = [];
const fail = (m) => F.push(m);
const a = R.indexOf("function phoneRings("), b = R.indexOf("function tile(");
if (a < 0 || b < 0 || b < a) { console.error("⚠️  INDETERMINATE: phoneRings / phoneRows moved"); process.exit(2); }
const ctx = vm.createContext({});
try { vm.runInContext(R.slice(a, b) + "\nthis.phoneRows = phoneRows; this.phoneRings = phoneRings;", ctx); } catch (e) { console.error(`⚠️  INDETERMINATE: ${e.message}`); process.exit(2); }
const rows = (total, calls, line = true) => ctx.phoneRows({ total_calls: total, data: calls === undefined ? {} : { calls } }, line);
const val = (r, lab) => (r.find(([l]) => l === lab) || [])[1];
// the October case: 7 rings, none answered, none counted
{ const r = rows(0, { rings: 7, connected: 0, answered: 0, missed: 7 });
  if (val(r, "Calls to your line") !== 7 || val(r, "Answered") !== 0 || val(r, "Missed") !== 7) fail(`October: ${JSON.stringify(r)}`); }
// any figures: total = answered + missed, or Answered / Missed are not shown
for (const [rings, ans, mis, tot] of [[7, 0, 7, 0], [10, 6, 4, 5], [0, 0, 0, 0], [5, 5, 0, 5], [7, 2, 4, 1], [7, null, 7, 0], [null, 3, 4, 3], [7, "x", 7, 0]]) {
  for (const line of [true, false]) {
    const r = rows(tot, { rings, answered: ans, missed: mis }, line);
    const t = r[0][1], A = val(r, "Answered"), M = val(r, "Missed");
    if ((A !== undefined || M !== undefined) && t !== A + M) fail(`${JSON.stringify([rings, ans, mis])} line=${line}: ${t} != ${A} + ${M}`);
    if ((A !== undefined) !== (M !== undefined)) fail(`only one of Answered / Missed shown for ${JSON.stringify([rings, ans, mis])}`);
    if (ans === 2 && A !== undefined) fail("7 rings but 2 + 4 answered / missed was still shown");
  }
}
if (val(rows(0, { rings: 7, answered: 0, missed: 7 }), "Answered, 30 seconds or more") !== 0) fail("the counted figure lost its own label");
if (rows(4, undefined).length !== 1) fail("a record with no detail grew rows");
if (!/phoneRows\(current,/.test(R)) fail("the section doesn't use phoneRows");
if (!/phoneRings\(current\)/.test(R)) fail("the line tile doesn't use the same total");
if (F.length) { console.error(`🔴 the phone line's figures disagree: ${F.length}\n${F.map((m) => `   · ${m}`).join("\n")}`); process.exit(1); }
console.log("✅ the phone line: the total is answered + missed from one list, the 30-second count has its own label, and anything that doesn't square is not shown.");
