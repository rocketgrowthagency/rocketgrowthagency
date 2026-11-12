#!/usr/bin/env node
// check-an-account-ends-on-day-30.mjs — AN ACCOUNT ENDS ON DAY 30 AFTER THE CANCELLATION NOTICE, THE SAME EVERYWHERE (Chris 11-12, "all recommended").
//
// 🔴 WHY. The agreement says "thirty (30) days' written notice". The end date is the notice date plus 30 days (notice on Jan 1 = last day Jan 31), computed in ONE
// place (netlify/functions/_billing-dates.js endDateFromNotice), read by the cancellation record, the portal Cancel card, the acknowledgment email, the closing list and
// billing's proration. The only "31" in the billing rules is the NON-PAYMENT ladder (more than 30 days past due = day 31), a different rule that is not touched here.
//
// WHAT IT HOLDS (website repo):
//   A. RUN: endDateFromNotice adds exactly 30 days (month ends, a leap year, a year end), a founding minimum can only push the end later, never earlier; leavingTerms says
//      notice_days 30 for every plan; invoiceFor bills nothing on or after the end date.
//   B. STATIC: the one function adds 30 (no 31, no +1); admin-record-cancellation and _leaving-terms get the end date from it; the agreement says thirty (30) days for every
//      plan that has a notice clause and never thirty-one / 31; no client-facing text in code says a notice period other than 30 days.
// Exit 0 holds · 1 regressed · 2 can't tell
import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const F = [], fail = (m) => F.push(m), ok = (c, m) => { if (!c) fail(m); };
const indet = (m) => { console.error(`⚠️  INDETERMINATE — ${m}`); process.exit(2); };
const rd = (rel) => { try { return fs.readFileSync(path.join(SITE, rel), "utf8"); } catch { return null; } };
const strip = (s) => String(s || "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const need = (rel) => { const s = rd(rel); if (s == null) indet(`${rel} can't be read in ${SITE}`); return s; };

const req = createRequire(path.join(SITE, "x.js"));
let B, LT;
try { B = req("./netlify/functions/_billing-dates.js"); } catch (e) { indet(`_billing-dates.js can't be loaded (${e.message})`); }
// A. run
const end = (n, first, min) => B.endDateFromNotice(n, first, min);
const cases = [["2026-01-01", "2026-01-31"], ["2026-01-31", "2026-03-02"], ["2026-12-15", "2027-01-14"], ["2028-02-01", "2028-03-02"], ["2026-11-12", "2026-12-12"]];
for (const [n, want] of cases) ok(end(n, null, 0) === want, `notice ${n} must end ${want} (day 30), got ${end(n, null, 0)}`);
ok(end("2026-11-12", "2026-11-01", 0) === "2026-12-12", "a plan with no minimum ends at notice + 30 whatever the first payment date");
ok(end("2026-11-12", "2026-11-01", 3) === "2027-02-01", "a founding minimum that runs past day 30 ends at the minimum, not earlier");
ok(end("2027-01-10", "2026-11-01", 3) === "2027-02-09", "a minimum already over: notice + 30");
ok(B.invoiceFor({ firstYmd: "2026-11-01", invoiceNum: 2, amount: 625, endsOn: "2026-12-01" }) === null, "no invoice is opened on or after the end date");
try { LT = req("./netlify/functions/_leaving-terms.js"); } catch (e) { indet(`_leaving-terms.js can't be loaded (${e.message})`); }
for (const tier of ["commit_3mo", "founding", "monthly"]) {
  let t; try { t = LT.leavingTerms({ tier, firstYmd: "2026-01-01", today: "2026-11-12" }); } catch (e) { fail(`leavingTerms(${tier}) threw ${e.message}`); continue; }
  if (t.known) { ok(t.notice_days === 30, `leavingTerms(${tier}) says a ${t.notice_days}-day notice, not 30`); ok(t.ends_on === "2026-12-12", `leavingTerms(${tier}) ends ${t.ends_on}, not 2026-12-12`); }
}

// B. static
const bd = strip(need("netlify/functions/_billing-dates.js"));
ok(/const byNotice = addDays\(noticeYmd, 30\);/.test(bd), "endDateFromNotice must be addDays(noticeYmd, 30)");
const rc = strip(need("netlify/functions/admin-record-cancellation.js"));
ok(/ends_on:\s*endDateFromNotice\(/.test(rc), "admin-record-cancellation must get ends_on from endDateFromNotice (one place)");
ok(/endDateFromNotice\(on, firstYmd, minimum\)/.test(strip(need("netlify/functions/_leaving-terms.js"))), "_leaving-terms must get the end date from endDateFromNotice");
const ct = need("netlify/functions/contract-generate.js");
ok((ct.match(/thirty \(30\) days' written notice/g) || []).length >= 3, "the agreement must say thirty (30) days' written notice in each plan's termination clause");
ok(!/thirty[- ]one|\b31\)? days?'? (written )?notice|\b31[- ]day notice/i.test(ct), "the agreement must never say thirty-one / 31 days of notice");
// no other notice length said anywhere a person reads (functions, shared, portal, admin)
const scan = ["netlify/functions", "shared", "portal", "admin"];
const bad = [];
const walk = (d) => { for (const f of fs.readdirSync(path.join(SITE, d), { withFileTypes: true })) {
  const rel = `${d}/${f.name}`;
  if (f.isDirectory()) { if (!/node_modules|templates/.test(f.name)) walk(rel); continue; }
  if (!/\.(js|html)$/.test(f.name)) continue;
  const s = rd(rel) || "";
  for (const m of s.matchAll(/(cancel|terminat)[^\n.]{0,60}?\b(\d{1,2}|thirty[- ]\w+)[- ]days?|\b(\d{1,2})[- ]days?'?\s+(written\s+)?notice/gi)) {
    const w = String(m[2] || m[3]).toLowerCase();
    if (/past due|late|overdue|unpaid|payment|retention|google|purge|kickoff|silence|breach|price|fee|invoice|charge/i.test(m[0])) continue;
    if (w === "30" || w === "thirty") continue;
    if (w === "60" || w === "14") continue;   // 60 = the monthly-fee change notice, 14 = the breach cure period: other clauses, not the cancellation notice
    if (/^(\d+)$/.test(w) && Number(w) < 10) continue;   // the 3-day billing heads-up and the like are not a cancellation notice
    bad.push(`${rel}: "${m[0].trim().slice(0, 90)}"`);
  }
} };
for (const d of scan) { try { walk(d); } catch { /* a folder this copy lacks */ } }
ok(bad.length === 0, `a notice length other than 30 days is said in: ${[...new Set(bad)].slice(0, 5).join(" | ")}`);

if (F.length) { console.error(`🔴 check-an-account-ends-on-day-30: ${F.length} problem${F.length === 1 ? "" : "s"}\n${F.map((x) => `   · ${x}`).join("\n")}`); process.exit(1); }
console.log("✅ check-an-account-ends-on-day-30: the end date is the notice date plus 30 days in the one function, the Cancel card terms and the agreement, and no text says another notice length");
