#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — A FAILED SCAN IS NOT "NO SCAN YET"
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Found 2026-10-05 while clearing the admin gates. `client_onboarding_records.data.v2Campaign
 * .rank_grid.error` had been set on a live client since the Places key lost permission —
 * `Places API 403: PERMISSION_DENIED` — and **nothing anywhere read it**.
 *
 * The map-rankings card said:
 *
 *     No geo-grid scan yet. Use "Refresh Map Rankings" above — results land a few minutes later.
 *
 * An invitation to press a button that will fail again, and a claim that nothing had happened when
 * something had, and it broke. The failure was CAUGHT and WRITTEN DOWN; writing it down and never
 * showing it is the same as swallowing it.
 *
 * 🔑 "IT FAILED" AND "IT HAS NOT RUN" ARE DIFFERENT FACTS, AND ONLY ONE OF THEM NEEDS SOMEBODY.
 *
 * This pins the CLASS: wherever the product stores an `error` beside a result, the surface that
 * renders that result must branch on it before it is allowed to say "not yet".
 * → feedback_an_absence_must_never_be_readable_as_a_value · feedback_unloaded_is_not_an_answer
 *
 * Exit 0 pass · 1 a stored failure is invisible again · 2 could not run.
 */
import fs from "node:fs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
let src;
try { src = fs.readFileSync(`${SITE}/admin/admin.js`, "utf8"); }
catch { console.error("⚠️  INDETERMINATE — cannot read admin.js"); process.exit(2); }

// The file documents the old wrong behaviour at length; a naive scan reads the explanation as the bug.
const code = src.replace(/^\s*\/\/.*$/gm, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
const fail = [];

// ── 1 · THE "NOT YET" SENTENCE IS GATED ON THERE BEING NO ERROR ─────────────────────────────────
// 🔑 Pin the PROPERTY — the not-yet copy is reached only when `error` is falsy — not the wording of
// either branch. Both are free to change; the dependency between them is not.
// 🔴 EVERY OCCURRENCE, NOT THE FIRST. Checking only the first one is how the SECOND surface stayed
// broken: the kickoff call console had its own copy — "No geo-grid scan yet — run one before the
// call" — five minutes before a call, about a scan that had run and failed. An inventory is a claim
// about what I thought to grep. → feedback_an_inventory_is_a_claim_about_what_i_thought_to_grep
{
  const NOT_YET = /No geo-grid scan yet/g;
  const hits = [];
  let m;
  while ((m = NOT_YET.exec(code))) hits.push(m.index);
  if (!hits.length) {
    fail.push("nothing says 'no geo-grid scan yet' any more — if that copy was replaced, this gate "
      + "must be re-pinned to whatever now says 'nothing has happened'");
  }
  for (const i of hits) {
    // 🔴 BOUND AT THE STATEMENT THAT CHOOSES THE COPY, NOT AT THE NEAREST BRACE. The first version
    // used `lastIndexOf("{")`, and the `${…}` interpolations inside the template literal cut the
    // window off two characters back — so it could not see the `rg.error ?` test at the head of the
    // very expression it was reading, and accused correct code.
    // 🔑 Both producers are an assignment or an argument; anchor on those.
    // → feedback_a_gate_window_measured_in_characters_will_lie
    const edge = Math.max(
      code.lastIndexOf("gridBody =", i),
      code.lastIndexOf("tile(", i),
      code.lastIndexOf("return ", i),
    );
    const window = edge < 0 ? "" : code.slice(edge, i);
    // 🔴 THE TEST, NOT A MENTION. `/\berror\b/` passed when the condition was replaced by `false`,
    // because the branch it guards PRINTS `String(rg.error)` and that mention sat inside the window.
    // A mention of a field is not a test on it. → feedback_a_literal_grep_misses_computed_writes
    if (!/rg\.error\s*\n?\s*\?/.test(window)) {
      const line = code.slice(0, i).split("\n").length;
      fail.push(`the 'no geo-grid scan yet' copy at line ~${line} is not guarded by a test on the `
        + `stored error — a FAILED scan renders there as a scan that has not run`);
    }
  }
}

// ── 2 · AND THE FAILURE IS ACTUALLY SHOWN, WITH ITS OWN WORDS ───────────────────────────────────
{
  if (!/rg\.error\s*\?/.test(code) && !/if\s*\(\s*rg\s*&&\s*rg\.error\s*\)/.test(code)) {
    fail.push("nothing branches on `rg.error` — the stored failure has no reader");
  }
  // It must print the stored message, not a generic "something went wrong" — and it must do so IN
  // THE BANNER, not merely somewhere in the file. The first version tested the whole source, so
  // replacing the banner's text with an apology still passed on the alert's copy of the expression.
  {
    const b = code.indexOf('class="admin-banner is-error"');
    const banner = b < 0 ? "" : code.slice(b, b + 700);
    if (!banner) fail.push("the failed scan no longer renders an error banner");
    else if (!/rg\.error/.test(banner)) {
      fail.push("the error banner does not carry the stored message — a generic apology cannot be acted on");
    }
  }
}

// ── 3 · IT REACHES THE OPERATOR WITHOUT OPENING THE TAB ─────────────────────────────────────────
// 🔴 A message only visible on the card it describes is a message nobody finds. The attention list
// is the surface that exists to say "something needs you".
{
  const i = code.indexOf("alerts.push");
  const region = i < 0 ? "" : code.slice(i, code.indexOf("renderClientStageBar") > i ? code.indexOf("renderClientStageBar") : i + 6000);
  if (!/rg\s*&&\s*rg\.error/.test(region)) {
    fail.push("a failed scan raises no attention signal — it is visible only on the card it describes, "
      + "which is the card nobody opens because it says nothing is wrong");
  }
}

// ── 4 · THE BANNER VARIANT IT USES IS DEFINED ───────────────────────────────────────────────────
// 🔴 A class no stylesheet defines throws nothing; the failure would render unstyled and read as
// ordinary copy. This has already happened here once, with `is-info` and `--admin-brand-bg`.
{
  const m = code.match(/class="admin-banner (is-[a-z]+)"/g) || [];
  let css = "";
  try { css = fs.readFileSync(`${SITE}/admin/admin.css`, "utf8"); } catch { /* skip */ }
  if (css) {
    for (const hit of [...new Set(m)]) {
      const variant = (hit.match(/is-[a-z]+/) || [""])[0];
      if (variant && !new RegExp(`\\.admin-banner\\.${variant}\\s*\\{`).test(css)) {
        fail.push(`\`.admin-banner.${variant}\` is used but not defined — the message renders unstyled`);
      }
    }
  }
}

if (fail.length) {
  console.error("🔴 a stored failure is being shown as 'nothing has happened yet':");
  for (const f of fail) console.error("   · " + f);
  process.exit(1);
}
console.log("✅ a failed scan says it failed, in its own words, and raises an attention signal — 'not yet' is reached only when there is no error");
