#!/usr/bin/env node
// check-no-step-asks-for-a-retired-google-feature.mjs — no SOP step (client or admin) asks for a Google feature Google has
// switched off.
//
// 🔒 WHY (approved retire_messaging_step_v1, 2026-10-16). Client step 10 "Turn on GBP messaging" (admin "Enable GBP messaging
// + set response SLA") asked every client to turn on Business Profile chat — which Google ENDED on 2024-07-31 (no new chats
// from 2024-07-15). Clients ticked "Messaging is on" for a button that no longer exists, and admin drafted welcome messages for
// it. Each entry below is a feature Google has retired, with when and where that was confirmed; add to the list, never remove.
import fs from "node:fs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const SCRAPER = process.env.SCRAPER_DIR || "/Users/chris/RGA/Rocket Growth Agency Scraper VS Code";
const read = (p) => { try { return fs.readFileSync(p, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${p}`); process.exit(2); } };

const RETIRED = [
  { feature: "Google Business Profile chat (Business Messages)", retired: "2024-07-31",
    source: "https://developers.google.com/business-communications/business-messages/resources/release-notes/update-on-gbm",
    patterns: [/\bGBP messaging\b/i, /\bBusiness Messages\b/i, /\bturn on (?:GBP |Google )?messaging\b/i, /Edit Profile\s*→\s*Messaging/i, /\bMessage button on your Google\b/i, /\bMessaging is on\b/i, /\bm1\.gbp\.messaging\b/] },
];

// Retired features that had a SCREEN or a PROMPT field in the code (not just a step): the code files must not draw or ask for them again.
// Visible FAQs on website pages are not this, and neither is flow-execute.js's talk of Q&A; only the Business Profile Q&A tool is.
const RETIRED_IN_CODE = [
  { feature: "Google Business Profile Q&A (questions and answers on the listing)", retired: "2025-11-03",
    source: "Google ended the Business Profile Q&A API; research 2026-10-31",
    files: { "admin/admin.js": [/Q&A PREVIEW/, /\bqaPreview\b/, /\.qa_pairs\b/], "netlify/functions/v2-brain-analysis-background.js": [/"qa_pairs"/, /"qa_count"/] } },
];

const F = [];
for (const r of RETIRED_IN_CODE) for (const [file, pats] of Object.entries(r.files)) { const code = read(`${SITE}/${file}`); for (const p of pats) if (p.test(code)) F.push(`${file} brings back "${r.feature}", which Google retired on ${r.retired} (${String(p)})`); }
const pb = JSON.parse(read(`${SITE}/data/playbooks/playbooks.json`));
const cs = JSON.parse(read(`${SITE}/data/playbooks/client-steps.json`));
const canon = read(`${SCRAPER}/flow/playbooks/month1.mjs`).replace(/^\s*\/\/.*$/gm, "");
const scan = (where, text) => { for (const r of RETIRED) for (const p of r.patterns) if (p.test(text)) F.push(`${where} asks for "${r.feature}", which Google retired on ${r.retired} (${String(p)})`); };
for (const [name, doc] of [["playbooks.json", pb], ["client-steps.json", cs]])
  for (const list of ["month1", "month2plus"]) for (const s of doc[list] || []) scan(`${name} ${s.id}`, JSON.stringify(s));
scan("flow/playbooks/month1.mjs", canon);
if (!pb.month1.length || !cs.month1.length) { console.error("⚠️  INDETERMINATE — the playbook is empty"); process.exit(2); }

if (F.length) { console.error("🔴 A step asks for a Google feature Google has switched off:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log(`✅ no step asks for a retired Google feature (${[...RETIRED, ...RETIRED_IN_CODE].map((r) => `${r.feature}, retired ${r.retired}`).join("; ")}) — client steps, admin steps, the SOP runner and the admin/Brain code checked`);
