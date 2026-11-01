#!/usr/bin/env node
// build-client-step-ledger.mjs — 2026-10-20, Chris: "make sure we harden memory" (after step 5's client card turned out never to
// have been built while memory and the mockups said "Live today"). GENERATES the memory file reference_client_step_ledger.md
// FROM THE CODE, so memory can't claim a step is built when it isn't:
//   for every client step (Month 1 + Monthly): number · id · title · how it finishes · does the portal draw a DONE RECORD for it
//   (a record card / a Google card / its own builder — read from portal.js, not remembered) · the mockups that name it · the
//   gates that name it.
// Run by daily-health-check (and after any step change). Exit 1 when a client step has NO done record in the portal.
import fs from "node:fs";
import path from "node:path";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const MEM = process.env.MEMORY_DIR || "/Users/chris/.claude/projects/-Users-chris-RGA-Rocket-Growth-Agency-Website-VS-Code/memory";
const P = fs.readFileSync(path.join(SITE, "portal", "portal.js"), "utf8");
const cs = JSON.parse(fs.readFileSync(path.join(SITE, "data", "playbooks", "client-steps.json"), "utf8"));
const steps = (Array.isArray(cs) ? cs : cs.steps || Object.values(cs).flat()).filter((s) => s && s.id && s.clientStepNo).sort((a, b) => a.clientStepNo - b.clientStepNo);
const setOf = (name) => { const m = P.match(new RegExp(`const ${name} = new Set\\(\\[([^\\]]*)\\]\\)`)); return new Set(m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : []); };
const RECORD = setOf("RECORD_CARD"), GBP = setOf("GBP_STEPS"), DONE = setOf("DONE_CARD");
// a done record = a record card, a Google card (steps 7-11), or a step with its own done builder named for it
const OWN = [["m1.kickoff.call", /kickoff/i], ["m1.gbp.verify", /function gvProfileHtml\(/], ["m1.gbp.photos", /photoDone|function photo[A-Za-z]*Html\(/], ["m1.review.first_5", /function reviewStepLinesHtml\(/],
  ["m1.brand.social_profiles", /function socialCard\(/], ["m1.call.close", /function closeCallHtml\(/], ["m1.brand.youtube_setup", /function videoClipsHtml\(/]];
// 🔴 a builder that exists but is SWITCHED OFF on a done row (`isDone ? "" : builder(…)`) draws nothing once done
const OFF_WHEN_DONE = { "m1.call.close": /m1\.call\.close" \? \(ownWait \|\| isDone \? "" : closeCallHtml/, "m1.brand.youtube_setup": /video_upload" \? \(ownWait \|\| isDone \? "" : videoClipsHtml/ };
const doneRecord = (id) => RECORD.has(id) ? "record card" : GBP.has(id) ? "Google card" : DONE.has(id) && /function doneCardHtml\(/.test(P) ? "done card"
  : OFF_WHEN_DONE[id] && OFF_WHEN_DONE[id].test(P) ? null
  : (OWN.find(([k]) => k === id) && OWN.find(([k]) => k === id)[1].test(P)) ? "own builder (verify on the walk)" : null;
const mockDir = path.join(SITE, "reports", "mockups");
const mocks = fs.readdirSync(mockDir).filter((f) => f.endsWith(".html"));
const mockText = Object.fromEntries(mocks.map((f) => [f, fs.readFileSync(path.join(mockDir, f), "utf8")]));
const gates = fs.readdirSync(HERE).filter((f) => /^check-.*\.mjs$/.test(f));
const gateText = Object.fromEntries(gates.map((f) => [f, fs.readFileSync(path.join(HERE, f), "utf8")]));
const rows = [], missing = [];
for (const s of steps) {
  const rec = doneRecord(s.id);
  if (!rec) missing.push(`${s.clientStepNo} · ${s.clientLabel}`);
  const m = mocks.filter((f) => mockText[f].includes(s.id)).slice(-4);
  const g = gates.filter((f) => gateText[f].includes(s.id)).length;
  rows.push(`| ${s.clientStepNo} | \`${s.id}\` | ${s.clientLabel} | ${s.clientDone || "?"} | ${rec ? `✅ ${rec}` : "🔴 NONE — a done row is blank"} | ${g} | ${m.join(", ") || "—"} |`);
}
const out = `---
name: reference_client_step_ledger
description: GENERATED from code daily (build-client-step-ledger.mjs) — every client step, how it finishes, whether the portal REALLY draws a done record, its gates and mockups. Trust this over any remembered "built"/"Live today"
metadata:
  type: reference
---
**GENERATED ${new Date().toISOString().slice(0, 16)}Z — do not edit by hand** (scraper scripts/build-client-step-ledger.mjs; runs in
daily-health-check). Why it exists: step 5's client card was never built while memory + mockups said "Live today"
([[project_done_steps_show_nothing]] · [[feedback_never_lose_client_work]]). "Done record" is read from portal.js; the walk's
"Every done step shows its record" check proves it on the live site.

| # | id | title | finishes by | done record in the portal | gates | mockups (latest) |
|---|---|---|---|---|---|---|
${rows.join("\n")}

${missing.length ? `**🔴 ${missing.length} step(s) with NO done record:** ${missing.join(" · ")}` : "**✅ every client step draws a done record.**"}
`;
fs.writeFileSync(path.join(MEM, "reference_client_step_ledger.md"), out);
console.log(out.split("\n").slice(-3).join("\n"));
process.exit(missing.length ? 1 : 0);
