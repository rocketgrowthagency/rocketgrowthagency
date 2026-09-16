#!/usr/bin/env node
/**
 * build-owner-questions-mockup.mjs — render the approved mockup's client card FROM THE SCHEMA.
 *
 * ─── WHY (2026-09-16) ────────────────────────────────────────────────────────────────────────────
 * The mockup is the thing Chris approves against, and it was hand-written HTML. So it held its own
 * copy of every question, option, hint, meaning and instruction — a second store of the exact text
 * this whole module exists to keep in one place.
 *
 * It drifted, of course, and in both directions: the mockup said "2 of 4 confirmed" long after
 * geography made it five, and production carried option copy the mockup never had. Comparing a
 * screen to a stale mockup is worse than having no mockup, because it makes correct code look wrong
 * and wrong code look approved.
 *
 * 🔑 The mockup now RENDERS FROM `_client-facts` — the same module both portals read. It cannot
 * disagree with production about what a question says, because it is not told separately.
 * → project_owner_facts_questions · feedback_search_for_the_existing_table_before_creating_one
 *
 * 🔴 CHECKING IS THE DEFAULT; rewriting needs --write. This runs inside the daily health check,
 * whose run() helper treats its third argument as a MODE and never forwards flags — so a
 * mutate-by-default script would have silently rewritten the approved mockup on every run, and the
 * drift it was meant to catch would have been erased by the act of checking for it.
 * → feedback_a_check_must_not_validate_itself
 *
 * Usage:  node scripts/build-owner-questions-mockup.mjs          # check only, exit 1 on drift
 *         node scripts/build-owner-questions-mockup.mjs --write  # rewrite the mockup in place
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const MOCKUP = path.join(SITE, "reports/mockups/portal_your_answers_easy.html");
const START = "<!-- GENERATED:owner-questions START — built by scripts/build-owner-questions-mockup.mjs, do not hand-edit -->";
const END = "<!-- GENERATED:owner-questions END -->";

const req = createRequire(path.join(SITE, "package.json"));
let M, SCHEMA;
try {
  M = req("./netlify/functions/_client-facts.js");
  SCHEMA = M.SCHEMA;
} catch (e) {
  console.error(`[mockup] INDETERMINATE — could not load _client-facts: ${e.message}`);
  process.exit(2);
}

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Which answers the mockup shows as already given, so it reads like a real half-finished card. */
const ANSWERED = {
  geography_model: { option: "service_area", src: "You told us on your kickoff call, 15 Sept" },
  results_timeline: { option: "few_days", src: "You told us on your kickoff call, 15 Sept" },
};

const QUESTIONS = [{ ...M.geographyQuestion(), key: "geography_model" }, ...M.FIELDS];

function optionHtml(q, o, chosen) {
  const lines = [`<b>${esc(o.label)}</b>`];
  if (o.hint) lines.push(`<span class="eg">${esc(o.hint)}</span>`);
  if (o.meaning) lines.push(`<span class="mn">${esc(o.meaning)}</span>`);
  if (o.input) lines.push(`<span class="mini"><input placeholder="${esc(o.placeholder || "")}" disabled></span>`);
  return `          <div class="opt${chosen ? " on" : ""}"><span class="dot"></span><span class="ot">
            ${lines.join("\n            ")}</span></div>`;
}

// 🔑 The tick list renders as the SAME option card as every other question — Chris asked for it to
// "flow as all others". It stays multi-select; only the marker differs (a square box rather than a
// radio dot). Emitting the old pill row here would put the mockup back out of step with production,
// which is the whole thing this generator exists to prevent.
function tickHtml(q) {
  return `        <div class="opts">
${(q.options || []).map((o) => {
    const lines = [`<b>${esc(o.label)}</b>`];
    if (o.hint) lines.push(`<span class="eg">${esc(o.hint)}</span>`);
    if (o.meaning) lines.push(`<span class="mn">${esc(o.meaning)}</span>`);
    const inline = o.input
      ? `\n          <label class="inline"><span>${esc(o.input)}</span><input placeholder="${esc(o.placeholder || "")}" disabled></label>`
      : "";
    return `          <div class="opt tickopt"><span class="bx"></span><span class="ot">
            ${lines.join("\n            ")}</span></div>${inline}`;
  }).join("\n")}
        </div>`;
}

function questionHtml(q, i) {
  const n = i + 1;
  const given = ANSWERED[q.key];
  const chosen = given ? (q.options || []).find((o) => o.key === given.option) : null;
  const done = Boolean(chosen);
  // Exactly ONE question is open: the first unanswered. The accordion shows one at a time.
  const firstUnanswered = QUESTIONS.findIndex((x) => !ANSWERED[x.key]);
  const open = !done && i === firstUnanswered;
  const body = q.type === "ticks"
    ? tickHtml(q)
    : `        <div class="opts">
${(q.options || []).map((o) => optionHtml(q, o, chosen && o.key === chosen.key)).join("\n")}
        </div>`;

  return `    <div class="q${done ? " done" : open ? " now" : ""}">
      <button class="q-head">
        <span class="q-n">${n}${done ? `<span class="q-tick">✓</span>` : ""}</span>
        <span class="q-t"><b>${esc(q.label)}</b>
          <span>${esc(q.help)}</span>${done ? `
          <span class="q-ans">${esc(chosen.label)}
            <span class="q-src">${esc(given.src)}</span></span>` : ""}</span>
        <span class="q-chip">${done ? "Confirmed" : open ? "Your turn" : "Needs you"}</span>
      </button>
      <div class="q-body">
${body}
        <details class="more"><summary>${esc(q.guidance.summary)}</summary>
          <div class="b">
${(q.guidance.paragraphs || []).map((p) => `            <p>${esc(p)}</p>`).join("\n")}
          </div>
        </details>
        <button class="ask">💬 Ask us about this</button>${done ? `
        <button class="clear">Clear my answer</button>` : ""}
      </div>
    </div>`;
}

const answered = Object.keys(ANSWERED).length;
const left = QUESTIONS.length - answered;

const block = `${START}
    <div class="sum">
      <span class="sum-txt">
        <span class="eyebrow">About your business</span>
        <span class="h">${answered} of ${QUESTIONS.length} answered</span>
      </span>
      <span class="state warn">${left} still to answer</span>
    </div>

    <div class="stakes">
      <p><b>${esc(SCHEMA.stakes.heading)}</b> ${esc(SCHEMA.stakes.body)}</p>
      <ul class="dests">
${(SCHEMA.stakes.destinations || []).map((d) => `        <li>${esc(d)}</li>`).join("\n")}
      </ul>
    </div>

${QUESTIONS.map(questionHtml).join("\n\n")}

    <div class="acts">
      <button class="btn" disabled>These are final — confirm</button>
      <span class="note">Saved as you go. ${left} of ${QUESTIONS.length} still to answer.</span>
    </div>
${END}`;

let html;
try { html = fs.readFileSync(MOCKUP, "utf8"); }
catch (e) { console.error(`[mockup] INDETERMINATE — cannot read the mockup: ${e.message}`); process.exit(2); }

const s = html.indexOf(START), e = html.indexOf(END);
if (s === -1 || e === -1) {
  console.error("[mockup] INDETERMINATE — the GENERATED markers are missing from the mockup.");
  console.error("         Wrap the client card in them once, then this script owns that region.");
  process.exit(2);
}
const next = html.slice(0, s) + block + html.slice(e + END.length);

if (!process.argv.includes("--write")) {
  if (next !== html) {
    console.error("✗ the mockup no longer matches the schema — run scripts/build-owner-questions-mockup.mjs --write");
    console.error("  A mockup that disagrees with production makes correct code look wrong.");
    process.exit(1);
  }
  console.log(`✅ mockup matches the schema — ${QUESTIONS.length} questions, ${QUESTIONS.reduce((n, q) => n + (q.options || []).length, 0)} options`);
  process.exit(0);
}

fs.writeFileSync(MOCKUP, next);
console.log(`✅ rebuilt the mockup from the schema — ${QUESTIONS.length} questions, ${QUESTIONS.reduce((n, q) => n + (q.options || []).length, 0)} options`);
