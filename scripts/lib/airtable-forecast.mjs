// airtable-forecast.mjs — THIS MONTH'S AIRTABLE CALLS, FORECAST TO MONTH END (checkers build 11-11). Pure: handed the meter's log text and a
// clock, so check-airtable-calls-will-last.mjs proves the arithmetic on fixtures every run. The meter: scripts/_airtable-meter.mjs writes one
// line per node process to output/airtable-calls.log:  <ISO time>  <job>  <script>  calls=N get=N write=N cached=N
// Airtable's limit is per calendar month (UTC), workspace-wide.

/** log text → [{ at: ms, job, calls }] (lines that don't parse are skipped and counted) */
export function parseLog(text) {
  const rows = []; let bad = 0;
  for (const line of String(text || "").split("\n")) {
    if (!line.trim()) continue;
    const m = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\s+(\S+)\s+\S+\s+.*\bcalls=(\d+)\b/.exec(line);
    if (!m) { bad++; continue; }
    rows.push({ at: Date.parse(m[1]), job: m[2], calls: Number(m[3]) });
  }
  return { rows, bad };
}

/** → { mtd, perDay, projected, pct, daysLeft, byJob, lastAt } — pace is the higher of the month's average and the last 7 days' */
export function forecast(rows, nowMs, cap) {
  const now = new Date(nowMs);
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1), end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  const month = rows.filter((r) => r.at >= start && r.at < end && r.at <= nowMs);
  const mtd = month.reduce((a, r) => a + r.calls, 0);
  const daysIn = Math.max(1, (nowMs - start) / 864e5);
  const week = rows.filter((r) => r.at > nowMs - 7 * 864e5 && r.at <= nowMs).reduce((a, r) => a + r.calls, 0);
  const perDay = Math.max(mtd / daysIn, week / Math.min(7, daysIn));
  const daysLeft = (end - nowMs) / 864e5;
  const projected = Math.round(mtd + perDay * daysLeft);
  const byJob = {};
  for (const r of month) byJob[r.job] = (byJob[r.job] || 0) + r.calls;
  const lastAt = rows.reduce((a, r) => Math.max(a, r.at), 0) || null;
  return { mtd, perDay: Math.round(perDay), projected, pct: Math.round((projected / cap) * 100), daysLeft: Math.round(daysLeft * 10) / 10, byJob, lastAt };
}
