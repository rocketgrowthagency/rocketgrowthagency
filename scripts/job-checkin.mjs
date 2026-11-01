#!/usr/bin/env node
// job-checkin.mjs — a Mac job says it ran (approved admin_system_health_v1, Chris 10-31). The website's job-watcher compares these with when
// each job was due, and the admin card shows them.
//
//   node scripts/job-checkin.mjs start  daily-health-check
//   node scripts/job-checkin.mjs finish daily-health-check --ok 1 --count 344 --note "344 healthy · 5 red" [--error "..."]
//
// 🔴🔴 IT NEVER BREAKS THE JOB. It always exits 0, gives up after 8 seconds, and a failure only prints one line to stderr (the job's
// launchd log). A backup must not fail because its health note couldn't be posted, and the POST can't work at all until the next deploy.
// 🔴 NEVER PRINTS THE SECRET. The internal secret comes from the environment or the repo's .env; only ever sent as the request header.
// A start's row id is kept in a small file so the finish lands on the same row. No file: the finish writes a whole row.
//
// JOB_CHECKIN_OFF=1 turns it off (gates and copies of a job). JOB_CHECKIN_URL and JOB_CHECKIN_DIR point it at a fake.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const say = (m) => process.stderr.write(`[job-checkin] ${m}\n`);

function secret() {
  if (process.env.INTERNAL_FN_SECRET) return process.env.INTERNAL_FN_SECRET;
  try {
    const m = /^INTERNAL_FN_SECRET=(.*)$/m.exec(fs.readFileSync(path.join(HERE, "..", ".env"), "utf8"));
    return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
  } catch { return ""; }
}
function flags(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) { o[argv[i].slice(2)] = argv[i + 1] ?? ""; i++; }
  return o;
}

export async function checkin(argv, { fetchFn = fetch } = {}) {
  if (process.env.JOB_CHECKIN_OFF) return { skipped: true };
  const [phase, job, ...rest] = argv;
  if (!["start", "finish"].includes(phase) || !/^[a-z0-9-]+$/.test(job || "")) { say("usage: start|finish <job> [--ok 1 --count N --note ... --error ...]"); return { skipped: true }; }
  const s = secret();
  if (!s) { say(`${job}: no INTERNAL_FN_SECRET here; not recorded`); return { skipped: true }; }
  const f = flags(rest);
  const dir = process.env.JOB_CHECKIN_DIR || path.join(os.homedir(), ".claude");
  const idFile = path.join(dir, `job-checkin-${job}.id`);
  let id = null;
  if (phase === "finish") { try { id = fs.readFileSync(idFile, "utf8").trim() || null; } catch { id = null; } }
  // 🔴 A new run forgets the last one's row first. If this start can't post, the finish must not land on a run that died yesterday.
  else fs.rmSync(idFile, { force: true });
  const body = phase === "start" ? { job, phase } : { job, phase, id, ok: ["1", "true"].includes(String(f.ok)), count: f.count === "" || f.count == null ? null : Number(f.count), note: f.note || null, error: f.error || null };
  const url = `${process.env.JOB_CHECKIN_URL || "https://www.rocketgrowthagency.com"}/.netlify/functions/job-checkin`;
  const r = await fetchFn(url, { method: "POST", headers: { "Content-Type": "application/json", "x-internal-secret": s }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) { say(`${job} ${phase}: not recorded (${j.not_set_up ? "not set up yet" : `HTTP ${r.status}`})`); return { recorded: false }; }
  try {
    if (phase === "start" && j.id) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(idFile, String(j.id), { mode: 0o600 }); }
    if (phase === "finish") fs.rmSync(idFile, { force: true });
  } catch { /* the row is on record either way */ }
  return { recorded: true, id: j.id };
}

if (fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await checkin(process.argv.slice(2)).catch((e) => say(`not recorded: ${String(e && e.message || e).slice(0, 160)}`));
  process.exit(0);
}
