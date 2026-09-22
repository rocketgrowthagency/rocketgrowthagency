#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-a-failure-reaches-a-human.mjs
//
// 🔴 WHY THIS EXISTS. On 2026-09-22 an audit found that a client's DECLINED CARD and three
// "RECEIPT NOT SENT" failures could never appear in the admin Messages queue. Not because the
// filter was wrong — because `admin-messages.js` fetched `kind=in.(client_message,rga_reply,
// rga_alert)` and every one of those failures is written under its OWN row kind. They were never
// fetched at all. They sat on the individual client's activity feed, reachable only by someone
// already looking at that client — the exact blindness the Messages tab was built to remove.
//
// The allow-list downstream had rotted too: of {google_disconnected, payment_failed, send_failed},
// `payment_failed` was written nowhere in the codebase and `google_disconnected` existed only as a
// stage name and a URL param, never as the `payload.kind` it was compared against. One live entry
// out of three, and no test would ever have said so.
//
// 🔑 WHAT IT ASSERTS: every activity row whose summary reads like a failure must be reachable by
// the queue — either its row kind matches the `_failed`/`_error` shape the query now selects, or it
// carries `needs_human: true`. A failure nobody can see is not logged, it is lost.
//
// exit 0 = every failure can reach a human · exit 1 = at least one cannot · exit 2 = cannot tell
// → feedback_an_alert_nobody_reads_is_not_an_alert · feedback_exit_code_semantics_for_gates
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

// Same convention as every other website-facing gate in this repo: the gate lives here, the code it
// judges lives in the site repo. → check-a-question-gets-an-answer.mjs
const ROOT = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const FN_DIR = join(ROOT, "netlify", "functions");
const QUEUE = join(FN_DIR, "admin-messages.js");

if (!existsSync(FN_DIR) || !existsSync(QUEUE)) {
  console.error("⚠️  INDETERMINATE — netlify/functions or admin-messages.js not found; cannot judge.");
  process.exit(2);
}

// ── What the queue can actually see.
//
// 🔴 THIS BLOCK READ THE COMMENTS. First version of this gate tested the raw file for
// `kind.like.*_failed` — and the explanatory comment I had just written in admin-messages.js
// contains that exact string. So when I narrowed the query back to prove the gate bites, it
// PASSED: it was matching my prose about the code, not the code. The mutation changed the file by
// 24 bytes and the verdict never moved. Strip comments before asserting anything about source.
// → feedback_dead_check_selector_gap · feedback_a_gate_window_measured_in_characters_will_lie
const queueRaw = readFileSync(QUEUE, "utf8");
const queueSrc = queueRaw
  .replace(/^\s*\/\/.*$/gm, "")
  .replace(/\/\*[\s\S]*?\*\//g, "");

// Must appear in the FETCH itself, not merely somewhere in the file.
const fetchCall = queueSrc.match(/supa\(\s*`\/client_activity[\s\S]{0,400}?`\s*\)/);
const fetchesFailureKinds = !!fetchCall && /kind\.like\.\*_failed/.test(fetchCall[0]);
const readsNeedsHuman = /needs_human/.test(queueSrc);
const shapeFn = queueSrc.match(/_\(failed\|error\)\$/);

if (!fetchesFailureKinds || !readsNeedsHuman || !shapeFn) {
  console.error("🔴 FAIL — the queue itself no longer selects failures.");
  if (!fetchesFailureKinds) console.error("   admin-messages.js does not fetch `kind.like.*_failed`.");
  if (!readsNeedsHuman) console.error("   admin-messages.js no longer honours `needs_human`.");
  if (!shapeFn) console.error("   the `_failed|_error` shape test is gone.");
  console.error("   Every failure below would be invisible regardless of how it is written.");
  process.exit(1);
}

const FAILURE_WORDS = /fail|could not|unable|not sent|declined|error|🔴/i;
// A summary that always contains a count ("(0 errors)") is not a failure report. Alerting on a
// clean run is how a queue earns the habit of being ignored. → feedback_a_check_must_not_validate_itself
const ALWAYS_REPORTS_A_COUNT = /\$\{\s*\w*(errored|errors|failed)\w*\s*\}\s*(errors?|failures?)/i;

const problems = [];
let examined = 0;

for (const file of readdirSync(FN_DIR).filter((f) => f.endsWith(".js"))) {
  if (file === "admin-messages.js") continue;
  const src = readFileSync(join(FN_DIR, file), "utf8");

  // Each `kind: "..."` paired with the `summary:` in the same payload literal.
  //
  // 🔴 CAPTURE THE WHOLE CONCATENATION. This first read only the opening string literal
  // (`[`"][^`"]{0,200}`) — so a summary split across two lines with `+` was judged on its first
  // half alone. The GBP alert reads "RGA was NOT added as a manager…" + "…the automatic invite
  // failed…", and the word `failed` is in the second half. The gate scored it "not a failure" and
  // skipped it, so the mutation that broke it passed clean. A gate that reads part of a value is
  // a gate that reads the wrong value. → feedback_a_gate_window_measured_in_characters_will_lie
  for (const m of src.matchAll(
    /kind:\s*"([a-z_0-9]+)"([\s\S]{0,800}?)summary:\s*((?:[`"][^`"]{0,400}[`"]\s*\+?\s*)+)/g)) {
    const [block, kind, between, summary] = m;
    if (between.includes("client_id:") && between.includes("kind:")) continue; // ran past into the next row
    examined++;

    if (!FAILURE_WORDS.test(summary)) continue;
    if (ALWAYS_REPORTS_A_COUNT.test(summary)) continue;

    const reachable =
      /_(failed|error)$/.test(kind) ||
      kind === "rga_alert" ||
      /needs_human:\s*true/.test(block);

    if (!reachable) {
      problems.push({ file, kind, summary: summary.trim().slice(0, 96) });
    }
  }
}

if (examined === 0) {
  console.error("⚠️  INDETERMINATE — matched no activity writes at all; the parser has drifted.");
  process.exit(2);
}

if (problems.length) {
  console.error(`🔴 FAIL — ${problems.length} failure(s) can never reach a human:\n`);
  for (const p of problems) {
    console.error(`   ${p.file}`);
    console.error(`     kind="${p.kind}" — not a *_failed kind, not an rga_alert, no needs_human`);
    console.error(`     "${p.summary}"\n`);
  }
  console.error("   Fix: name the kind `<thing>_failed`, or add `needs_human: true` to the payload.");
  process.exit(1);
}

console.log(`✅ every failure reaches a human — ${examined} activity writes examined, `
  + `queue selects *_failed kinds and honours needs_human.`);
process.exit(0);
