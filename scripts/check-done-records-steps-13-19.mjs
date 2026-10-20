#!/usr/bin/env node
// check-done-records-steps-13-19.mjs — 2026-10-20, approved done_records_steps_13_19_v1. The generated step ledger found client
// steps 13–19 drew NOTHING once done. RUNS each done card on fakes: it must say what was done (dates, counts, links), never
// invent (call notes aren't stored → "when RGA records them"), and the row must draw it when the step is done.
//   exit 0 holds · 1 a done record regressed · 2 code moved
import fs from "node:fs";
import vm from "node:vm";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const P = read("portal/portal.js");
const F = [], fail = (m) => F.push(m);
const lift = (n) => { const at = P.search(new RegExp(`\\nfunction ${n}\\(`)); if (at < 0) { console.error(`⚠️  ${n} moved`); process.exit(2); } let d = 0; for (let i = P.indexOf("{", P.indexOf(")", at)); i < P.length; i++) { if (P[i] === "{") d++; else if (P[i] === "}") { d--; if (!d) return P.slice(at + 1, i + 1); } } };
const line = (n) => ((P.match(new RegExp(`^const ${n} = [^\\n]*`, "m")) || [""])[0]).replace(/^const /, "var ");
const ctx = vm.createContext({ escapeHtml: (x) => String(x ?? "").replace(/</g, "&lt;"), escapeAttribute: (x) => String(x ?? ""), monthDay: (x) => String(x || "").slice(5, 10),
  siteShow: (u) => String(u || "").replace(/^https?:\/\/(www\.)?/, ""), googleCardHtml: (o) => `<card state="${o.state}">${[o.small, o.side, o.title, o.body, o.act].filter(Boolean).join(" ¦ ")}</card>`, Number, String, Array, Date, Math });
vm.runInContext("var DC_ICON = { cal: '', vid: '', num: '', pho: '', msg: '' };", ctx);
for (const n of ["DONE_CARD", "dcRow", "dcReport"]) vm.runInContext(line(n), ctx);
vm.runInContext(lift("doneCardHtml"), ctx);
const run = (step, t, c = {}) => { ctx.__s = step; ctx.__t = t; ctx.__c = c; return vm.runInContext("doneCardHtml(__s, __t, __c)", ctx); };
const AT = "2026-10-30T17:00:00Z";
for (const id of ["m1.call.close", "m2.call.monthly"]) {
  const h = run({ id }, { status: "done", completed_at: AT });
  if (!/state="ok"/.test(h) || !/✓ Call held/.test(h) || !/held 10-30/.test(h) || !/data-portal-goto="reports"/.test(h)) fail(`${id}: the done call card doesn't say it was held, when, and link the report`);
  if (!/Notes from the call show here when RGA records them/.test(h)) fail(`${id}: the call card invents notes (or drops the honest line)`);
}
{ const h = run({ id: "m1.brand.youtube_setup" }, { status: "done", completed_at: AT, clips: [{ name: "intro.mp4", kind: "upload", size: 39845888, at: "2026-10-22T10:00:00Z" }, { name: "Shared link", kind: "link", at: "2026-10-24T10:00:00Z" }] });
  if (!/✓ Both received/.test(h) || !/intro\.mp4 · 38 MB · 10-22/.test(h) || !/✓ Link/.test(h) || !/last one received 10-24/.test(h)) fail("step 14's done card doesn't list both clips"); }
{ const h = run({ id: "m2.snap.business_outcomes", clientInput: { fields: [{ key: "enquiries", label: "New inquiries" }, { key: "revenue", label: "Revenue" }, { key: "jobs", label: "Jobs won" }] } }, { status: "done", client_input: { enquiries: 24, revenue: 18400, jobs: "" }, client_input_at: "2026-11-03T10:00:00Z" });
  if (!/New inquiries/.test(h) || !/>24</.test(h) || !/\$18,400/.test(h) || /Jobs won/.test(h) || !/the report uses the latest/.test(h)) fail("step 15's done card doesn't show the client's own numbers (or shows an empty one)"); }
{ const h = run({ id: "m2.exec.gbp_photos" }, { status: "done", completed_at: AT }, { photosThisMonth: 6 });
  if (!/✓ 6 this month/.test(h) || !/6 photos/.test(h)) fail("step 16's done card doesn't count this month's photos");
  const u = run({ id: "m2.exec.gbp_photos" }, { status: "done", completed_at: AT }, {}); if (/\b0 photos|NaN|undefined/.test(u)) fail("step 16 with no count reads as 0 / NaN (absence isn't a value)"); }
{ const h = run({ id: "m2.exec.review_push" }, { status: "done" }, { customerLists: [{ created_at: "2026-10-12T10:00:00Z", week_label: "Week of October 12", customer_count: 4, customers: [] },
    { created_at: "2026-10-20T10:00:00Z", week_label: "Week of October 19", customer_count: 5, customers: [{ marked_sent_by_client: true }, { marked_sent_by_client: true }, { marked_sent_by_client: true }, {}, {}] }] });
  if (!/Week of October 19/.test(h) || !/3 of 5/.test(h)) fail("step 17's done card doesn't show THIS week's list and how many were asked"); }
{ const h = run({ id: "m2.exec.youtube_video" }, { status: "done", client_input: { value: "https://youtu.be/abc" }, client_input_at: "2026-10-27T10:00:00Z" });
  if (!/✓ Received/.test(h) || !/youtu\.be\/abc/.test(h) || !/you sent it 10-27/.test(h)) fail("step 18's done card doesn't show the video link"); }
// 10-20: quarterly "not due" and a skipped optional step come first in the chain; the done card still draws for every done step
if (!/const completionCtlLive = [\s\S]{0,900}?: DONE_CARD\.has\(step\.id\) && isDone \? doneCardHtml\(step, taskState \|\| \{\},|const completionCtlLive = DONE_CARD\.has\(step\.id\) && isDone \? doneCardHtml\(step, taskState \|\| \{\},/.test(P)) fail("the row doesn't draw the done card for a done step (13–19 would be blank again)");
for (const id of ["m1.call.close", "m1.brand.youtube_setup", "m2.snap.business_outcomes", "m2.exec.gbp_photos", "m2.exec.review_push", "m2.exec.youtube_video", "m2.call.monthly"])
  if (!new RegExp(`const DONE_CARD = new Set\\(\\[[^\\]]*"${id.replace(/\./g, "\\.")}"`).test(P)) fail(`${id} isn't in DONE_CARD`);
if (F.length) { console.error("🔴 steps 13–19 done records regressed:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ steps 13–19 draw a done record: calls held (when + report, notes never invented) · both clips · the client's own numbers · this month's photos · this week's list + asked · the video link");
