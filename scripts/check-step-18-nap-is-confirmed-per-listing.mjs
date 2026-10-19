#!/usr/bin/env node
// check-step-18-nap-is-confirmed-per-listing.mjs — batch 4 item 7 (approved m1-18 "Searched — NAP confirmation unverified").
// Step 18's own DONE is "every listing the audit found has been opened and its NAP confirmed against the GBP". The search
// alone used to complete it. Now: the runner completes only when every FOUND listing has nap_confirm[source].ok === true
// for the SAME url; admin row 18 records each check; the Done proof (STEP_ARTIFACTS) asks the same question.
//   exit 0 = holds · 1 = the search (or a stale confirmation) can finish the step again · 2 = code moved
import fs from "node:fs";
import vm from "node:vm";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (p) => { try { return fs.readFileSync(`${SITE}/${p}`, "utf8"); } catch { return null; } };
const flow = read("netlify/functions/flow-execute.js"), admin = read("admin/admin.js");
if (!flow || !admin) { console.error("⚠️  INDETERMINATE — cannot read flow-execute.js / admin.js"); process.exit(2); }
const lift = (src, marker) => {
  const at = src.indexOf(marker); if (at < 0) return null;
  const st = src.indexOf("async", at); let d = 0;
  for (let i = src.indexOf("{", src.indexOf("=>", st)); i < src.length; i++) { if (src[i] === "{") d++; else if (src[i] === "}") { d--; if (!d) return src.slice(st, i + 1); } }
  return null;
};
const runnerSrc = lift(flow, '"m1.audit.citations": async');
const fnSrc = (name) => { const i = admin.indexOf(`\nfunction ${name}(`); if (i < 0) return null; const rest = admin.slice(i + 1); const m = rest.slice(1).search(/\n(?:\/\/|\/\*\*|function |async function |const |let |document\.)/); return rest.slice(0, m + 1); };
const stateSrc = fnSrc("citNapState");
if (!runnerSrc || !stateSrc) { console.error("⚠️  INDETERMINATE — step 18's runner or citNapState moved"); process.exit(2); }
const F = [];
const ROWS = [
  { source: "Yelp", status: "found", url: "https://yelp.com/biz/acme", searched: true, spent: true },
  { source: "BBB", status: "found", url: "https://bbb.org/acme", searched: true, spent: true },
  { source: "Angi", status: "missing", note: "no listing", searched: true, spent: true },
  { source: "Nextdoor", status: "unknown", note: "search failed", searched: false },
];
async function runWith(napConfirm, rows = ROWS, recThrows = false) {
  const ctx = vm.createContext({ JSON, String, Array, Date, Number, Object, Math,
    auditCitations: async () => rows, citPad: () => (s) => `${s} `,
    supa: async () => { if (recThrows) throw new Error("db down"); return [{ data: { tasks: { "m1.audit.citations": { nap_confirm: napConfirm } } } }]; } });
  return vm.runInContext(`(${runnerSrc})`, ctx)({ client: { business_name: "Acme" }, clientId: "c1" });
}
const ok = (url) => ({ url, ok: true, at: "2026-10-19T00:00:00Z", by: "x" });
// runner
{ const r = await runWith({});
  if (r.completed !== false || r.outcome !== "nap_review") F(`the search alone finishes step 18 (completed ${r.completed}, ${r.outcome})`);
  if (!/RGA'S PART/.test(r.summary) || JSON.stringify(r.outcome_data?.nap_to_confirm) !== JSON.stringify(["Yelp", "BBB"])) F("the result doesn't name the listings still to confirm"); }
{ const r = await runWith({ Yelp: ok("https://yelp.com/biz/acme") });
  if (r.completed !== false) F("one of two listings confirmed finishes the step"); }
{ const r = await runWith({ Yelp: ok("https://yelp.com/biz/acme"), BBB: ok("https://bbb.org/acme") });
  if (r.completed !== true || r.outcome !== "verified") F(`every listing confirmed doesn't finish the step (${r.completed}, ${r.outcome})`); }
{ const r = await runWith({ Yelp: ok("https://yelp.com/biz/acme-OLD"), BBB: ok("https://bbb.org/acme") });
  if (r.completed !== false) F("a confirmation made on a DIFFERENT listing URL still counts"); }
{ const r = await runWith({ Yelp: { ...ok("https://yelp.com/biz/acme"), ok: false }, BBB: ok("https://bbb.org/acme") });
  if (r.completed !== false) F("a listing marked 'doesn't match' counts as confirmed"); }
{ const r = await runWith({ Yelp: ok("https://yelp.com/biz/acme"), BBB: ok("https://bbb.org/acme") }, ROWS, true);
  if (r.completed !== false) F("an unreadable record reads as 'all confirmed'"); }
{ const r = await runWith({}, ROWS.filter((x) => x.status !== "found"));
  if (r.completed !== true) F("a search that found no listings (nothing to confirm) can't finish"); }
{ const r = await runWith({}, ROWS.map((x) => ({ ...x, status: "unknown" })));
  if (r.completed !== false || r.outcome !== "indeterminate") F("a search that learned nothing finishes the step"); }
// admin: the Done proof + the row's state agree with the runner
const st = vm.runInContext(`(${stateSrc.replace(/^function citNapState/, "function")})`, vm.createContext({ Array }));
const od = { directories: ROWS.map((x) => ({ source: x.source, status: x.status, url: x.url })) };
if (st({ outcome_data: od, nap_confirm: {} }).done !== false) F("admin's Done proof passes with nothing confirmed");
if (st({ outcome_data: od, nap_confirm: { Yelp: ok("https://yelp.com/biz/acme"), BBB: ok("https://bbb.org/acme") } }).done !== true) F("admin's Done proof fails with everything confirmed");
if (st({ outcome_data: od, nap_confirm: { Yelp: ok("https://yelp.com/biz/OTHER"), BBB: ok("https://bbb.org/acme") } }).done !== false) F("admin counts a confirmation on another URL");
if (st({}).done !== false) F("admin's Done proof passes on a step that never searched");
if (!/"m1\.audit\.citations": \{\s*proof: \(d\) => citNapState\(d\?\.tasks\?\.\["m1\.audit\.citations"\]\)\.done,/.test(admin)) F("step 18's Done is not guarded by the NAP proof (STEP_ARTIFACTS)");
if ((admin.match(/o\.flowId === "m1\.audit\.citations" \? citNapHtml\(s\.task\) : ""/g) || []).length < 2) F("row 18 no longer shows the per-listing NAP checks (active + queued)");
if (!/nap_review: \{ type: "info"/.test(admin)) F("the new 'nap_review' outcome has no banner (it would read as Done ✅)");
if (F.length) { console.error("🔴 step 18 can finish without RGA's NAP check:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ step 18: search → 'confirm the NAP on each listing' (open) · every found listing confirmed on its own URL → Done · mismatch / other URL / unreadable never counts · admin proof agrees");
