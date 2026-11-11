#!/usr/bin/env node
// check-admin-ai-search-hand-check.mjs — approved mockup admin_ai_search_v2 (Nov 1): decisions 1, 2 and 3. File-only: no network, no database, no search spent.
// HOLDS:
//  1. the Month 6 check is one question and ONE ANSWER PER TOOL (Google AI Overviews, Google AI Mode, ChatGPT, Perplexity), a blank is refused (a blank is not
//     "did not come up"), and nothing adds the tools together: no "N of M", no score, no rank, no trend, no "invisible", no "visibility up".
//  2. a recorded check says "Checked by hand <date>" and "It is not a position"; an older { engines } record still reads, one line each.
//  3. a wrong fact: phone and address are compared with the record in any country's format; hours and services are never called wrong ("Could not compare");
//     a missing record side is "could not compare", never "wrong"; the card says "fixed the source", never "fixed the answer"; nothing reaches the client.
//  4. the Month 1 "Get mentioned on other sites" step exists, is RGA's, says "Real sources only" and promises nothing about AI or rank.
//  5. nothing for the held pieces was built: no tracker, no Search Console / Bing AI report pull, no paid search.
// exit 0 = holds · 1 = broken · 2 = can't tell
import fs from "node:fs";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`INDETERMINATE: cannot read ${r}`); process.exit(2); } };
const req = createRequire(import.meta.url);
const A = req(`${SITE}/netlify/functions/_ai-check.js`);
const mature = read("netlify/functions/_monthly-health.js"), adm = read("admin/admin.js"), pb = JSON.parse(read("data/playbooks/playbooks.json"));
const F = []; const fail = (m) => F.push(m);
const fmt = (iso) => (iso ? "Nov 12, 2026" : "");
const BAD = /\b(\d+\s+of\s+\d+|score|scored|ranking|ranked|rank(?!\w)|trend|invisible|visibility (up|down|score)|position of|#\d)\b/i;
const ok = { question: "Emergency plumber in Springfield", results: { google_overviews: "did_not", google_ai_mode: "came_up", chatgpt: "could_not", perplexity: "came_up" } };
// 1. parse
if (!A.parseCheck(ok).ok) fail("a complete check is refused");
for (const t of A.TOOLS) { const r = JSON.parse(JSON.stringify(ok)); delete r.results[t.key]; if (A.parseCheck(r).ok) fail(`a blank for ${t.label} is accepted (a blank is not "did not come up")`); }
if (A.parseCheck({ ...ok, question: "  " }).ok) fail("a check with no question is accepted");
if (A.parseCheck("not json").ok) fail("garbage is accepted");
if (A.TOOLS.length !== 4 || new Set(A.TOOLS.map((t) => t.key)).size !== 4) fail("the four AI surfaces are not four separate lines");
const card = A.recordedCard(A.parseCheck(ok).check, "2026-11-12T00:00:00Z", { phone: "", address: "" }, fmt);
for (const t of A.TOOLS) if (!card.body.some((l) => l.startsWith(`${t.label}: `))) fail(`${t.label} has no line of its own`);
if (!/^Checked by hand /.test(card.head)) fail('the recorded head is not "Checked by hand <date>"');
if (!card.body.some((l) => /It is not a position\./.test(l))) fail('the recorded card lost "It is not a position."');
for (const l of card.body.filter((l) => !/It is not a position|Question asked/.test(l))) if (BAD.test(l)) fail(`the recorded card reads like a score or rank: ${l}`);
if (BAD.test(card.head)) fail(`the recorded head reads like a score: ${card.head}`);
// 2. old shape
const old = A.recordedCard({ engines: { google: true, chatgpt: false } }, "2026-11-01T00:00:00Z", {}, fmt);
if (old.body.some((l) => /\d+ of \d+|Named in/.test(l))) fail("an older record is added up again");
if (!old.body.some((l) => /^Google AI: Came up/.test(l)) || !old.body.some((l) => /^ChatGPT: Did not come up/.test(l))) fail("an older record lost its per-tool lines");
// 3. wrong facts
const cases = [
  ["US phone, other format, same number", "phone", "+1 (555) 010-0199", { phone: "555-010-0199" }, "matches"],
  ["US phone, different number", "phone", "(555) 010-0000", { phone: "(555) 010-0199" }, "differs"],
  ["UK phone, local vs international", "phone", "+44 20 7946 0958", { phone: "020 7946 0958" }, "matches"],
  ["phone, no record", "phone", "(555) 010-0000", { phone: "" }, "could_not_compare"],
  ["phone, too short to tell", "phone", "010", { phone: "555 010 0199" }, "could_not_compare"],
  ["address, abbreviated street", "address", "123 Main St, Springfield", { address: "123 Main Street, Springfield, IL 62701" }, "matches"],
  ["address, other number", "address", "125 Main St", { address: "123 Main Street" }, "differs"],
  ["address, no number said", "address", "Main Street", { address: "123 Main Street" }, "could_not_compare"],
  ["address, no record", "address", "123 Main St", { address: "" }, "could_not_compare"],
  ["hours are never judged", "hours", "Open 9 to 5", { phone: "1", address: "2" }, "could_not_compare"],
  ["services are never judged", "services", "Drain cleaning", { phone: "1" }, "could_not_compare"],
];
for (const [name, field, said, record, want] of cases) {
  const got = A.judgeFacts([{ tool: "chatgpt", field, said, source: "" }], record)[0].verdict;
  if (got !== want) fail(`${name}: ${got}, wanted ${want}`);
}
const withFact = A.recordedCard({ ...A.parseCheck(ok).check, facts: [{ tool: "chatgpt", field: "phone", said: "(555) 010-0000", source: "an old directory page" }] }, "2026-11-12T00:00:00Z", { phone: "(555) 010-0199" }, fmt);
const finding = withFact.body.find((l) => /different phone number/.test(l));
if (!finding) fail("a different phone number is not reported as a finding");
else { if (!/fixed the source/.test(finding) || /fixed the answer"?[^,]/.test(finding.replace(/never "fixed the answer"/, ""))) fail('the finding does not use "fixed the source", never "fixed the answer"'); if (!/old directory page/.test(finding)) fail("the finding drops where it came from"); }
const hrs = A.recordedCard({ ...A.parseCheck(ok).check, facts: [{ tool: "perplexity", field: "hours", said: "Open 24 hours", source: "" }] }, "2026-11-12T00:00:00Z", {}, fmt);
if (!hrs.body.some((l) => /Could not compare, so you decide/.test(l)) || hrs.body.some((l) => /different hours|wrong/i.test(l))) fail("hours were called wrong, or not left to RGA");
const all = [card, withFact, hrs, old].flatMap((c) => [c.small, c.head, ...c.body]).join("\n");
if (/—/.test(all)) fail("an em dash in the new card copy");
// the client never sees it
for (const f of ["portal/portal.js", "portal/report/report.js"])   // portal-mature.js was removed 11-11 (it read a table nothing writes) if (/ai_visibility|_ai-check|wrong_facts/.test(read(f))) fail(`${f} reads the AI hand check: a finding is for RGA, never an alert to the client`);
// wiring
if (!/require\("\.\/_ai-check"\)/.test(mature) || /Named in \$\{/.test(mature)) fail("_monthly-health.js (33 AI search check) still builds the old Named in N of M head, or lost the new card");
if (!/aiForm/.test(mature) || !/aiCheckFormHtml\(Hh\.ID\.AI, 0, d\.aiForm\)/.test(adm) || !/aiCheckFormValue\(f\)/.test(adm)) fail("the admin form for the check (Monthly 33) is not wired");
if (!/Pick an answer for every tool/.test(adm)) fail("the admin form lets a tool stay blank");
// 4. the mentions step
const st = (pb.month1 || []).find((s) => s.id === "m1.platform.mentions");
if (!st) fail("the Month 1 step Get mentioned on other sites is gone");
else {
  // 🔄 citations_52_55_v1 (approved 11-9): the step is hybrid now (a runner finds the places by search; a person asks), still RGA's and admin-side
  if (st.actor !== "rga" || st.type !== "hybrid" || st.clientBucket !== "admin") fail("the mentions step is not an RGA-side hybrid admin step");
  if (!/never a made-up list/.test(st.instructions)) fail("the mentions step doesn't say its places come from a search, never a made-up list");
  if (!/Real sources only/.test(st.instructions) || !/no pay-for-placement/i.test(st.instructions)) fail('the mentions step lost "Real sources only" / no pay-for-placement');
  if (/(will|can) (make|get|help) (an? )?(AI|ChatGPT|Google)|guarantee|rank higher|more calls/i.test(st.instructions + " " + st.clientFeed)) fail("the mentions step promises a result");
  if (/—/.test(st.instructions + st.title + st.clientFeed)) fail("an em dash in the mentions step");
}
// 5. held
if (/serpapi|SERPAPI/.test(read("netlify/functions/_ai-check.js"))) fail("the hand check spends a paid search");
if (fs.existsSync(`${SITE}/netlify/functions/ai-tracker.js`) || fs.existsSync(`${SITE}/netlify/functions/_ai-tracker.js`)) fail("a tracker was built: it waits for 2 or 3 clients");
if (/searchconsole.*generativeAi|bing.*AI Performance/i.test(read("netlify/functions/_ai-check.js") + mature)) fail("a Search Console or Bing AI report pull was built: it waits for a connected client");
if (F.length) { console.error("the AI search hand check can break:"); for (const f of F) console.error("   - " + f); process.exit(1); }
console.log(`OK: one answer per tool, never added up; wrong facts are RGA's finding only; the mentions step promises nothing (${cases.length} fact cases)`);
