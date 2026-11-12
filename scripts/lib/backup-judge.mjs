// backup-judge.mjs — ARE THE BACKUPS FRESH, AND DOES ONE LIVE OUTSIDE THIS MAC (checkers build 11-11). Pure: handed what each status
// said and a clock, so check-backups-leave-the-building.mjs proves the rules on fixtures every run.
// 🔴 UNREADABLE IS "COULD NOT TELL", NEVER FRESH. Each source answers { state: "ok" | "red" | "unknown", line }.

const H = 3600e3;
// the LaCie copies run Monday to Friday at 06:40 / 07:00, so Friday's copy must carry the weekend: 80 hours covers Fri 07:00 → Mon 15:00
export const LACIE_MAX_H = 80;
// Supabase takes a physical backup daily; 36 hours allows one late
export const SUPABASE_MAX_H = 36;

/** a LaCie status file ({ at, ok, problems|problem }) → verdict */
export function judgeLacie(name, status, nowMs) {
  if (!status || typeof status !== "object") return { state: "unknown", line: `${name}: no status file, so its age can't be read` };
  const at = Date.parse(status.at);
  if (!Number.isFinite(at)) return { state: "unknown", line: `${name}: the status has no time` };
  const age = (nowMs - at) / H;
  const why = String(status.problems || status.problem || "").trim();
  if (status.ok !== true) return { state: "red", line: `${name}: the last run FAILED${why ? `: ${why.slice(0, 160)}` : ""}` };
  if (age > LACIE_MAX_H) return { state: "red", line: `${name}: the newest good copy is ${Math.round(age)} hours old (over ${LACIE_MAX_H})` };
  return { state: "ok", line: `${name}: ${Math.round(age)} hours old` };
}

/** the Management API's /database/backups answer → verdict */
export function judgeSupabase(body, nowMs) {
  if (!body || !Array.isArray(body.backups)) return { state: "unknown", line: "Supabase backups: the list could not be read" };
  const done = body.backups.filter((b) => String(b.status).toUpperCase() === "COMPLETED").map((b) => Date.parse(b.inserted_at)).filter(Number.isFinite).sort((a, b) => b - a);
  if (!done.length) return { state: "red", line: `Supabase backups: none completed on record (${body.backups.length} listed)` };
  const age = (nowMs - done[0]) / H;
  if (age > SUPABASE_MAX_H) return { state: "red", line: `Supabase backups: the newest completed one is ${Math.round(age)} hours old (over ${SUPABASE_MAX_H})` };
  return { state: "ok", line: `Supabase backups: ${done.length} completed, newest ${Math.round(age)} hours old${body.pitr_enabled ? ", point-in-time on" : ", point-in-time recovery off"}` };
}
