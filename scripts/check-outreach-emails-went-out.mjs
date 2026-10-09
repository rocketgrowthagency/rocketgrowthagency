#!/usr/bin/env node
/**
 * check-outreach-emails-went-out.mjs — did the cold-outreach emails actually go out on the last weekday?
 *
 * 🔴 WHY (2026-10-08, Chris: "make sure emails are sent daily and monitored"): every send gate watched for
 * TOO MANY emails (the 50/day cap, duplicate rows, a stuck queue) — none noticed NO emails. Sends run in
 * Google Apps Script (runMorningOutreach, Mon–Fri 7 AM PT), outside every machine we check, so a revoked
 * trigger, an expired Gmail authorization or a starved queue would look exactly like a quiet day.
 *
 * HOLDS: the most recent COMPLETED weekday (PT) has at least one outbound "sent" row in the Outreach Log.
 * A zero is ALWAYS reported — it is either "nothing was due" (the machine is starved: no new leads with
 * videos, no follow-ups) or "sending broke" (trigger / authorization / quota). Both need Chris; this gate
 * cannot tell which, so it says both and names the queue gate that can.
 *
 * Reads only the last 10 days (filterByFormula) — not the whole log — to stay cheap on Airtable's monthly cap.
 * The decision rule is a pure function, self-tested on fixtures every run.
 * Exit 0 = emails went out · 1 = a weekday with none · 2 = can't tell
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);
const TZ = "America/Los_Angeles";

// ── the rule ───────────────────────────────────────────────────────────────────────────────────────
const dayOf = (iso) => new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
const weekdayOf = (ymd) => new Date(`${ymd}T12:00:00Z`).getUTCDay();   // 0 Sun … 6 Sat
function lastCompletedWeekday(todayYmd) {
  const d = new Date(`${todayYmd}T12:00:00Z`);
  for (let i = 1; i <= 7; i++) {
    const c = new Date(d.getTime() - i * 86400000).toISOString().slice(0, 10);
    const w = weekdayOf(c);
    if (w >= 1 && w <= 5) return c;
  }
  return null;
}
export function judge(countsByDay, todayYmd) {
  const day = lastCompletedWeekday(todayYmd);
  const n = countsByDay[day] || 0;
  return { day, n, ok: n > 0 };
}
{
  const F = [
    [{ "2026-10-07": 50 }, "2026-10-08", true],            // Thu: Wed sent → fine
    [{ "2026-10-07": 0 }, "2026-10-08", false],            // Wed sent nothing → fail
    [{}, "2026-10-08", false],                             // no rows at all for Wed → fail
    [{ "2026-10-09": 40 }, "2026-10-12", true],            // Monday: judges FRIDAY, not Sunday
    [{ "2026-10-10": 40 }, "2026-10-12", false],           // a Saturday send does not cover Friday
    [{ "2026-10-09": 1 }, "2026-10-11", true],             // Sunday: judges Friday
  ];
  const bad = F.filter(([c, t, want]) => judge(c, t).ok !== want);
  if (bad.length) { console.error(`🔴 the rule itself is wrong on ${bad.length} fixture(s) — fix the gate first`); process.exit(1); }
  console.log(`  fixtures: ${F.length}/${F.length} passed`);
}

// ── the data ───────────────────────────────────────────────────────────────────────────────────────
const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, ".env"), "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const KEY = env.AIRTABLE_API_KEY, BASE = env.AIRTABLE_BASE_ID;
if (!KEY || !BASE) { console.error("⚠️  INDETERMINATE — no Airtable credentials"); process.exit(2); }

const formula = `AND({Direction}='outbound',LOWER({Outcome})='sent',IS_AFTER({Date},DATEADD(TODAY(),-10,'days')))`;
let rows = [], offset;
try {
  do {
    const u = new URL(`https://api.airtable.com/v0/${BASE}/${encodeURIComponent("Outreach Log")}`);
    u.searchParams.set("pageSize", "100");
    u.searchParams.set("filterByFormula", formula);
    u.searchParams.append("fields[]", "Date");
    if (offset) u.searchParams.set("offset", offset);
    const r = await fetch(u, { headers: { Authorization: `Bearer ${KEY}` } });
    const j = await r.json();
    if (j.error) { console.error(`⚠️  INDETERMINATE — Outreach Log read failed: ${JSON.stringify(j.error).slice(0, 160)}`); process.exit(2); }
    rows = rows.concat(j.records || []); offset = j.offset;
  } while (offset);
} catch (e) { console.error(`⚠️  INDETERMINATE — could not reach Airtable (${String(e.message || e).slice(0, 90)})`); process.exit(2); }

const counts = {};
for (const r of rows) { const d = r.fields?.Date; if (d) counts[dayOf(d)] = (counts[dayOf(d)] || 0) + 1; }
const today = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
const v = judge(counts, today);
console.log(`  last 10 days (PT): ${Object.keys(counts).sort().map((d) => `${d.slice(5)}=${counts[d]}`).join("  ") || "none"}`);
if (!v.ok) {
  console.error(`🔴 NO outreach emails went out on ${v.day} (a weekday). Either nothing was due — the machine is starved`);
  console.error("   (no new leads with videos, no follow-ups; see check-send-queue-can-reach-zero) — or sending broke");
  console.error("   (the Apps Script runMorningOutreach trigger, its Gmail authorization, or a quota). Check the Apps Script");
  console.error("   executions log for 7 AM PT that day.");
  process.exit(1);
}
console.log(`✅ ${v.n} outreach email(s) went out on ${v.day}, the last weekday.`);
