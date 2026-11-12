#!/usr/bin/env node
// write-daily-health-report.mjs — THE MORNING RUN'S REDS, WRITTEN WHERE CHRIS READS (checkers build, 11-11; master map approved).
//
// 🔴 WHY: on 11-11 the 07:30 daily-health-check had 20 red gates. They sat in /tmp/com.rga.daily-health-check.out and in
// output/gate-verdicts.jsonl; System health said "Ran" with a count, and nobody heard. The write is not the delivery.
// Now the run's finish (job_checkin_finish in daily-health-check.sh) calls this with the run's own verdict file, and it writes
//   website reports/daily-health/<YYYY-MM-DD>.md   (the reports/full-check pattern: one file a day, the newest run wins)
// listing EVERY red, could-not-tell and threw gate with its one-line detail, and prints the file's path (the finish puts it in the
// System health error, which the job-watcher emails). Gate: check-daily-reds-reach-chris.mjs.
//
//   node scripts/write-daily-health-report.mjs --verdicts <tsv> --ok N --fail N --indet N --threw N [--reached 1] [--out <dir>] [--date YYYY-MM-DD]
//
// The verdict file: one line per gate, tab-separated: verdict (ok|red|indeterminate|threw) · gate · what it guards · first failing line.
// A later line for the same gate wins (the live gates skipped while the database struggled are run again at the end).
// 🔴 It prints no secret: the details are the gates' own first failing lines, which already go to the launchd log.
// Exit 0 = written (path on stdout) · 2 = could not write (the finish then reports without a path; it never breaks the job).
import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const arg = (k, d = "") => { const i = argv.indexOf(`--${k}`); return i >= 0 && argv[i + 1] != null ? argv[i + 1] : d; };
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const OUT_DIR = arg("out") || path.join(SITE, "reports", "daily-health");
const pacificDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const DATE = arg("date") || pacificDate();

export function parseVerdicts(text) {
  const last = new Map();
  for (const line of String(text || "").split("\n")) {
    if (!line.trim()) continue;
    const [verdict, gate, what = "", detail = ""] = line.split("\t");
    if (!verdict || !gate) continue;
    last.set(gate, { verdict, gate, what: what.trim(), detail: detail.trim() });   // the later line wins
  }
  return [...last.values()];
}

/** The report text. `previous` = yesterday's report text (to mark what is new), or "". */
export function buildReport({ date, rows, counts, reached, previous = "" }) {
  const red = rows.filter((r) => r.verdict === "red"), unk = rows.filter((r) => r.verdict === "indeterminate"), threw = rows.filter((r) => r.verdict === "threw");
  const wasRed = new Set([...String(previous).matchAll(/^- 🔴 `([^`]+)`/gm)].map((m) => m[1]));
  const line = (r, icon) => `- ${icon} \`${r.gate}\`${icon === "🔴" && previous && !wasRed.has(r.gate) ? " **(new)**" : ""} — ${r.what || "(no description)"}${r.detail ? `\n  - ${r.detail.replace(/`/g, "'")}` : ""}`;
  const n = (k) => Number(counts[k] || 0);
  const out = [
    `# Morning check · ${date}`,
    "",
    reached ? `The 07:30 run reached the end.` : `🔴 **The run stopped before the end**, so some gates never ran. The list below is what it saw before it stopped.`,
    "",
    `**${n("fail")} red · ${n("indet")} could not tell · ${n("threw")} threw · ${n("ok")} healthy.**${n("fail") ? " Red is this job's error on System health, so the job-watcher emails it." : ""}`,
    "",
    `## Red (${red.length})`,
    ...(red.length ? red.map((r) => line(r, "🔴")) : ["- None."]),
    "",
    `## Could not tell (${unk.length})`,
    "Not the same as healthy: nothing checked these today.",
    ...(unk.length ? unk.map((r) => line(r, "⚠️")) : ["- None."]),
    "",
    `## Threw (${threw.length})`,
    "A gate that crashed: a harness fault, and nothing is checking its area until it is fixed.",
    ...(threw.length ? threw.map((r) => line(r, "💥")) : ["- None."]),
    "",
    `Full output of each gate: scraper output/gate-last/<gate>.txt · every verdict: output/gate-verdicts.jsonl.`,
    "",
  ];
  // 🔴 The count the run kept and the list must agree, or a red is missing from the list (the thing this file exists to prevent).
  if (red.length !== n("fail")) out.splice(4, 0, `🔴 **${n("fail")} counted red, ${red.length} listed**: a red was counted without being named. Read /tmp/com.rga.daily-health-check.out.`, "");
  return out.join("\n");
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url).pathname.replace(/%20/g, " "))) {
  let text = "";
  try { text = fs.readFileSync(arg("verdicts", "/dev/null"), "utf8"); } catch { text = ""; }
  const rows = parseVerdicts(text);
  const counts = { ok: arg("ok"), fail: arg("fail"), indet: arg("indet"), threw: arg("threw") };
  const prevDate = new Date(Date.parse(`${DATE}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
  let previous = "";
  try { previous = fs.readFileSync(path.join(OUT_DIR, `${prevDate}.md`), "utf8"); } catch { previous = ""; }
  const body = buildReport({ date: DATE, rows, counts, reached: !!arg("reached"), previous });
  try {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const file = path.join(OUT_DIR, `${DATE}.md`);
    fs.writeFileSync(file, body);
    console.log(file.replace(`${SITE}/`, "website "));
  } catch (e) {
    console.error(`⚠️  INDETERMINATE — could not write the daily report: ${String(e.message || e).slice(0, 160)}`);
    process.exit(2);
  }
}
