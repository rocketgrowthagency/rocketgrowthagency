#!/usr/bin/env node
// check-reviews-and-close.mjs — 2026-10-20, approved phase3_4_reviews_close_v1 (final review R5). RUNS the review policy, the
// Month 1 report builder and the done-record fallback on fakes, and pins:
//   13 reviews   — a request never asks the customer to name/mention a staff member (Google, April 2026); past 10 asks in a day
//                  the client is TOLD to spread them (never refused)
//   14 videos    — optional: never "your next step", "Skip videos" is a real answer (skipped, read back, undoable), no wait on
//                  website access
//   15 close-out — the Month 1 report waits only on the KPI baseline, runs from kickoff + 27 on what's done, and lists what's
//                  still open; admin says skip the call after day 35 so Month 2 starts
//   every step   — a done row that would say nothing gets who finished it + when, in plain words (never "Not recorded", 10-26)
//   exit 0 holds · 1 regressed · 2 code moved
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SCR = process.env.SCRAPER_COPY_DIR || path.resolve(HERE, "..");
const read = (p) => { try { return fs.readFileSync(p.startsWith("/") ? p : `${SITE}/${p}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${p}`); process.exit(2); } };
const req = createRequire(`${SITE}/netlify/functions/x.js`);
const load = (m) => { try { return req(`${SITE}/netlify/functions/${m}`); } catch (e) { console.error(`⚠️  ${m} won't load: ${e.message}`); process.exit(2); } };
const P = read("portal/portal.js"), ADM = read("admin/admin.js"), PB = JSON.parse(read("data/playbooks/playbooks.json")), M1 = read(`${SCR}/flow/playbooks/month1.mjs`);
const RR = read("netlify/functions/portal-review-requests.js"), VC = read("netlify/functions/portal-video-clip.js"), EX = read("netlify/functions/flow-execute.js");
const F = [], fail = (m) => F.push(m);
const A = Object.fromEntries([...PB.month1, ...PB.month2plus].map((s) => [s.id, s]));
// ── 13 · reviews
const R = load("_review-policy.js");
for (const bad of ["Could you mention your technician in the review? {{review_link}}", "Please name the tech who came out {{review_link}}", "Give a shout-out to our crew member {{review_link}}", "Tell us by name who helped {{review_link}}"])
  if (!R.reviewMessageProblems(bad).some((x) => /staff member/.test(x))) fail(`step 13: a staff-name ask passes the policy ("${bad.slice(0, 40)}…")`);
for (const ok of ["Hi Sam, thanks for choosing Rocket Plumbing! Would you leave a quick review? {{review_link}} Thanks, Ana", "Thanks again from the whole team. A review helps others find us: {{review_link}}"])
  if (R.reviewMessageProblems(ok).length) fail(`step 13: an honest request is refused (${R.reviewMessageProblems(ok).join("; ")})`);
if (!/if \(today > 10\) pace = \{ today, note:/.test(RR) || /today > 10\) return json\(4/.test(RR)) fail("step 13: past 10 asks in a day the client isn't told, or the save is refused");
if (!/j\.pace && j\.pace\.note \? j\.pace\.note/.test(P) || !/asking them to name a staff member/.test(P)) fail("step 13: the portal doesn't show the pace note or the staff rule");
// ── 14 · videos
const y = A["m1.brand.youtube_setup"] || {};
if (!y.clientOptional || (y.dependsOn || []).includes("m1.access.website")) fail("step 14: videos aren't optional, or still wait on website access");
if (/id: "m1\.brand\.youtube_setup"[^\n]*\n\s*type: "[a-z]+", dependsOn: \[[^\]]*"m1\.access\.website"/.test(M1)) fail("step 14: the canonical SOP still makes videos wait on website access");
if (!/if \(b\.kind === "skip" \|\| b\.kind === "unskip"\)/.test(VC) || !/b\.kind === "skip" \? st0 !== "skipped" : st0 === "skipped"\) return jsonRes\(500/.test(VC)) fail("step 14: Skip videos isn't saved as skipped (read back) or can't be undone");
if (!/isOpenRow\(r\) && (?:r\.status !== "flagged" && )?theirs\(r\) && !r\.step\.clientOptional/.test(P) || !/theirsToAct && step\.clientOptional \? \{ text: "Optional"/.test(P)) fail("step 14: an optional step can be \"your next step\" or reads \"Your turn\"");
if (!/data-video-skip=/.test(P) || !/Google doesn't rank you on them/.test(P)) fail("step 14: the card lost Skip or the honest why");
// ── 15 · close-out, RUN the report
if (JSON.stringify(A["m1.report.month1"]?.dependsOn) !== JSON.stringify(["m1.audit.kpi_baseline"])) fail("step 15: the Month 1 report waits on more than the KPI baseline (photos / reviews / the build hold Month 1 again)");
if (!/id: "m1\.report\.month1"[^\n]*\n\s*type: "[a-z]+", dependsOn: \["m1\.audit\.kpi_baseline"\]/.test(M1)) fail("step 15: the canonical SOP disagrees on the report's dependsOn");
if (!/const opensAt = kAt \+ 27 \* 86400000;\s*if \(Date\.now\(\) < opensAt\) return \{/.test(EX)) fail("step 15: the report can run before kickoff + 27");
const MR = load("_month1-report.js");
const tasks = { "m1.kickoff.call": { status: "done", completed_at: "2026-09-20T15:00:00Z" }, "m1.gbp.photos": { status: "in_progress", detected: { n: 14, threshold: 20, noun: "photo" } },
  "m1.review.first_5": { status: "pending" }, "m1.gbp.hours_attributes": { status: "done", completed_at: "2026-09-25T10:00:00Z" }, "m1.brand.youtube_setup": { status: "pending" } };
const rep = MR.buildMonth1Report({ client: { business_name: "Rocket Plumbing" }, tasks, playbook: PB.month1, months: [], baseline: {}, kickoffAt: tasks["m1.kickoff.call"].completed_at });
const open = (rep.sections.find((s) => s.key === "open") || {}).lines || [];
if (!open.some((l) => /20\+ business photos.*\(14 of 20 photos\)/.test(l))) fail(`step 15: "Still open" doesn't list the photos with their count (${open.join(" | ")})`);
if (!open.some((l) => /customers/i.test(l))) fail("step 15: \"Still open\" misses the review asks");
if (open.some((l) => /video/i.test(l))) fail("step 15: an optional step (videos) is listed as still open");
if (open.some((l) => /hours/i.test(l))) fail("step 15: a done step is listed as still open");
if (/still open/i.test(rep.text) && !/carries into month 2/i.test(rep.text)) fail("step 15: \"Still open\" doesn't say it carries into Month 2");
// 🔄 10-26 (steps_6_20_clean_v1, step 15 waiting): the band says "Opens about <date>"
if (!/title: end \? `Opens about \$\{/.test(P) || !/Anything still open carries into Month 2; nothing waits for it/.test(P)) fail("step 15: the portal still says the call waits until everything is done");
const BK = read("netlify/functions/portal-book-kickoff.js");
if (!/const rp = recs\[0\]\?\.data\?\.tasks\?\.\["m1\.report\.month1"\];\s*if \(!rp \|\| rp\.status !== "done"\) \{\s*return jsonRes\(409,/.test(BK)) fail("step 15: a close-out time can be booked before the Month 1 report is ready (report first)");
if (!/No close-out call yet: skip this row to start Month 2/.test(ADM)) fail("step 15: admin doesn't say to skip the call after day 35");
// ── the done-record fallback, RUN
const lift = (n) => { const at = P.search(new RegExp(`\\nfunction ${n}\\(`)); if (at < 0) { console.error(`⚠️  ${n} moved`); process.exit(2); } let d = 0; for (let i = P.indexOf("{", P.indexOf(")", at)); i < P.length; i++) { if (P[i] === "{") d++; else if (P[i] === "}") { d--; if (!d) return P.slice(at + 1, i + 1); } } };
// 🔄 done_without_record_v2 (approved 10-26): the fallback IS the no-record done card (doneNoRecordHtml), run for real with the
// card helpers lifted from portal.js: the band + "Finished with RGA" / "Finished by you" + when — never "Marked done" / "Not recorded"
const ctx = vm.createContext({ escapeHtml: (x) => String(x ?? ""), monthDay: (v) => String(v).slice(5, 10), fmtDateShort: (v) => String(v).slice(0, 10) });
const consts = ["PC_TICK", "PC_OPEN", "PC_PLUS", "pcCard", "pcFact", "pcTl", "pcDate", "pcActs", "doneWho", "doneByTl"].map((n) => { const m = P.match(new RegExp(`^const ${n} = [^\\n]*`, "m")); if (!m) { console.error(`⚠️  ${n} moved`); process.exit(2); } return m[0].replace(/^const /, "var "); });
vm.runInContext(consts.join("\n") + "\n" + lift("doneNoRecordHtml") + "\n" + lift("doneFallbackHtml"), ctx);
const fb = (s, t) => { ctx.__s = s; ctx.__t = t; return vm.runInContext("doneFallbackHtml(__s, __t)", ctx).replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, "|").replace(/\|+/g, "|"); };
const h1 = fb({ clientLabel: "Confirm your business hours", clientDoneConfirm: "Your hours are on Google" }, { status: "done", completed_at: "2026-09-22T10:00:00Z", completed_by: "rga" });
if (!/\|Your hours are on Google\|finished 09-22\|/.test(h1) || !/\|Finished with RGA\|09-22\|/.test(h1) || /Marked done|not recorded|not on record/i.test(h1)) fail(`fallback: a done step with no answer doesn't say who + when in plain words, or shows our bookkeeping (${h1})`);
const h2 = fb({ clientLabel: "X" }, { status: "done", completed_at: "2026-09-22T10:00:00Z", completed_by: "client", client_input: { a: 1 } });
if (/not recorded/i.test(h2) || !/\|Finished by you\|/.test(h2)) fail(`fallback: an answer we have reads Not recorded, or the client isn't named as who did it (${h2})`);
const h3 = fb({ clientLabel: "X" }, { status: "done" });
// a done line that says the CLIENT did it is never the band of a step RGA finished (it read "You gave us your hours" over "Finished with RGA")
const h4 = fb({ clientLabel: "Confirm your business hours", clientDoneConfirm: "You gave us your hours" }, { status: "done", completed_at: "2026-09-22T10:00:00Z", completed_by: "rga" });
if (/You gave us/.test(h4) || !/\|This step is done\|finished 09-22\|/.test(h4) || !/\|Finished with RGA\|09-22\|/.test(h4)) fail(`fallback: a step RGA finished says the client did it (${h4})`);
const h5 = fb({ clientLabel: "Confirm your business hours", clientDoneConfirm: "You gave us your hours" }, { status: "done", completed_at: "2026-09-22T10:00:00Z", completed_by: "client" });
if (!/\|You gave us your hours\|/.test(h5) || !/\|Finished by you\|/.test(h5)) fail(`fallback: a step the client finished lost its own done line (${h5})`);
if (!/\|Finished with RGA\|/.test(h3) || /finished \||not recorded|undefined|NaN|Invalid/i.test(h3)) fail(`fallback: a missing date is invented, or reads "not recorded" (${h3})`);
if (!/fillBlankDoneRows\(listEl, numbered\);/.test(P) || !/if \(\(c\.textContent \|\| ""\)\.replace\(\/\\s\+\/g, " "\)\.trim\(\)\.length >= 25\) continue;/.test(P)) fail("fallback: the list no longer fills blank done rows (measured like the walk)");
if (F.length) { console.error("🔴 reviews + the Month 1 close regressed:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ reviews + close hold: no staff-name asks, pace told past 10 · videos optional, skippable, never next · report waits on the baseline only, opens at kickoff + 27, lists what's still open (not optional, not done) · day-35 skip · blank done rows say who finished it + when, in plain words");
