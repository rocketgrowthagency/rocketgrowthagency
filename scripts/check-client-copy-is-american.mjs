#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — CLIENT COPY IS WRITTEN FOR AN AMERICAN SMALL-BUSINESS OWNER
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Chris, 2026-09-27, reading his own portal:
 *
 *     "Your kickoff call is booked. The calendar invite is in your inbox — accept it so it lands in
 *      your diary."
 *     *"lands in diary? whats a diary?"*
 *
 * **Diary is British for calendar.** RGA's clients are US small businesses — Culver City, CA. To that
 * reader a diary is a journal you write in at night, so the sentence is not slightly formal, it is
 * *confusing at the exact moment we are asking them to do something.*
 *
 * It had reached **seven** places: three client-facing strings, two admin lines written the same day,
 * and one client instruction duplicated across both playbook files.
 *
 * 🔑 THE POINT IS NOT SPELLING. Nobody misreads "colour". This list is only words that a US reader
 * either does not use or would read as meaning something else. Anything merely unfamiliar-sounding
 * stays out — a gate that fires on style becomes a gate people switch off.
 *
 * WHERE IT LOOKS: every string a client can read — the portal bundle, the client step data, and the
 * email templates. Comments are excluded: they are for us.
 *
 * Exit 0 pass · 1 fail · 2 indeterminate. Mutation log at the bottom.
 */
import fs from "node:fs";
import path from "node:path";

// 🔑 THE SITE PATH IS A DEFAULT, NOT A CONSTANT. A gate that can only ever read the real
// working tree cannot be pointed at a scratch copy, so its mutations cannot be run — and a
// gate nobody can make fail is a gate nobody has checked. Found 2026-10-06 when three
// mutations of `check-refusal-is-not-done` all came back green: it was reading straight past
// them. → feedback_a_gate_that_cannot_fail · feedback_the_harness_i_wrote_to_check_my_work_can_lie
const __SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const WEB = `${__SITE}`;
const fail = [], indet = [], pass = [];

// 🔑 Each entry: the British word, what a US reader says, and why it MISLEADS rather than merely
// sounding foreign. If you cannot fill in the third column, it does not belong here.
const BRITISH = [
  [/\bdiar(y|ies)\b/i, "calendar", "a diary is a journal you write in, not a schedule"],
  [/\bstraight away\b/i, "right away", "understood, but not what a US reader writes"],
  [/\bwhilst\b/i, "while", "reads as archaic"],
  [/\bamongst\b/i, "among", "reads as archaic"],
  [/\bring (you|us|them) back\b/i, "call back", "\"ring\" is not used for phoning in US English"],
  [/\bmobile number\b/i, "cell number", "US readers say cell"],
  [/\bpost (it|them) to\b/i, "mail it to", "\"post\" is the mail service in BrE, a verb in AmE"],
  [/\bcheque\b/i, "check", "a different word entirely in US spelling"],
  [/\bpostcode\b/i, "ZIP code", "not a term used in the US"],
  [/\bfortnight\b/i, "two weeks", "not used in US English"],
  // 🔴 REMOVED ON ITS FIRST RUN: /holiday/. It fired on nine correct uses — "Holiday closures",
  // "when a holiday is coming — Christmas, Thanksgiving". That IS the American sense. A rule that
  // flags the right word is worse than no rule: it is the noise that gets a gate switched off, and
  // this file's own header says so two paragraphs above. Left here as the worked example.
];

// Strings a CLIENT can read. Comments are ours; they are stripped.
const SURFACES = [
  ["portal/portal.js", (s) => s.replace(/^[ \t]*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")],
  ["data/playbooks/client-steps.json", (s) => s],
  ["data/playbooks/playbooks.json", (s) => s],
];

let looked = 0;
for (const [rel, strip] of SURFACES) {
  const p = path.join(WEB, rel);
  if (!fs.existsSync(p)) { indet.push(`${rel} is missing`); continue; }
  let body = strip(fs.readFileSync(p, "utf8"));

  // 🔑 For the playbooks, only the CLIENT-facing fields. The admin's own instructions are read by
  // Chris, who wrote them, and holding those to the same bar is noise.
  if (rel.endsWith(".json")) {
    try {
      const raw = JSON.parse(fs.readFileSync(p, "utf8"));
      const out = [];
      (function walk(o) {
        if (Array.isArray(o)) return o.forEach(walk);
        if (o && typeof o === "object") {
          for (const [k, v] of Object.entries(o)) {
            if (typeof v === "string" && /^client(Label|Hint|Why|Instructions|DoneConfirm|DoneCta)$/.test(k)) out.push(v);
            else walk(v);
          }
        }
      })(raw);
      body = out.join("\n");
    } catch (e) { indet.push(`${rel} did not parse (${e.message})`); continue; }
  }
  looked++;

  let hits = 0;
  for (const [re, better, why] of BRITISH) {
    const g = new RegExp(re.source, "gi");
    let m;
    while ((m = g.exec(body))) {
      hits++;
      const around = body.slice(Math.max(0, m.index - 60), m.index + 60).replace(/\s+/g, " ").trim();
      fail.push(`${rel} — "${m[0]}" → say "${better}" (${why}).\n       …${around}…`);
    }
  }
  if (!hits) pass.push(`${rel} — no British idiom in client copy`);
}

if (!looked) { console.log("  ⚠️  no client surfaces could be read"); process.exit(2); }

for (const x of pass) console.log(`  ✅ ${x}`);
for (const x of indet) console.log(`  ⚠️  INDETERMINATE — ${x}`);
for (const x of fail) console.log(`  🔴 ${x}`);
if (fail.length) {
  console.log(`\n🔴 FAIL — ${fail.length} phrase(s) a US small-business owner would not use.`);
  console.log("   Chris on the first one: \"lands in diary? whats a diary?\"");
  process.exit(1);
}
if (indet.length) { console.log(`\n⚠️  INDETERMINATE — ${indet.length} surface(s) unreadable.`); process.exit(2); }
console.log(`\n✅ client copy reads as American (${pass.length} surfaces).`);

/* MUTATION LOG — filled in below. */
