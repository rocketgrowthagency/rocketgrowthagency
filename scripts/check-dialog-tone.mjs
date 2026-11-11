#!/usr/bin/env node
// check-dialog-tone.mjs — 11-10: the free/busy grant dialog ("This sends you to Google to approve one extra permission") wore the
// orange THIS REACHES THE CLIENT pill, because rgaInferTone read "sends" as mail leaving the building. It reaches no client.
// This lifts the REAL rgaInferTone out of the website's admin/admin.js and holds it to cases both ways. --against=<rev> reads that rev.
import fs from "node:fs"; import { execFileSync } from "node:child_process";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const rev = (process.argv.find((a) => a.startsWith("--against=")) || "").slice(10);
const src = rev ? execFileSync("git", ["-C", SITE, "show", `${rev}:admin/admin.js`], { encoding: "utf8", maxBuffer: 64 << 20 }) : fs.readFileSync(`${SITE}/admin/admin.js`, "utf8");
const m = src.match(/function rgaInferTone\(message, danger\) \{[\s\S]*?\n\}/);
if (!m) { console.log("❌ rgaInferTone not found in admin/admin.js"); process.exit(1); }
const infer = new Function(`${m[0]}; return rgaInferTone;`)();
const CASES = [
  ["Let RGA read your Google free/busy?\n\nThis sends you to Google to approve one extra permission.", "routine"],
  ["Send the invite?\n\nNathan gets a Google Meet invite.", "outward"],
  ["Email the Month 1 report to the client?", "outward"],
  ["Resend the magic link?", "outward"],
  ["This sends the agreement to the client.", "outward"],
  ["Delete this block?", "danger"],
  ["Save these hours?", "routine"],
];
const bad = CASES.filter(([msg, want]) => infer(msg, false) !== want).map(([msg, want]) => `"${msg.split("\n")[0]}" → ${infer(msg, false)}, want ${want}`);
// the free/busy call site states its tone, so a later wording change cannot repaint it
if (!rev && !/tone: "routine", message:\s*\n\s*"Let RGA read your Google free\/busy\?/.test(src)) bad.push("the free/busy grant dialog does not state tone: \"routine\"");
if (bad.length) { console.log(`❌ ${bad.length} dialog tone problem(s):`); bad.forEach((b) => console.log(`  · ${b}`)); process.exit(1); }
console.log(`✅ dialog tones hold: a redirect to Google is INTERNAL, mail and invites are THIS REACHES THE CLIENT, deletes are PERMANENT (${CASES.length} cases)`);
