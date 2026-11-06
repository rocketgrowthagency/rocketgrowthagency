#!/usr/bin/env node
// db-quiet.mjs — IS THE CLIENTS' DATABASE IN A QUIET PERIOD? (11-6: RGA's Supabase is on the Free plan, 5.098 GB of its 5 GB monthly
// egress used by Nov 6, the cycle resets Nov 18; the owner can't upgrade yet.) The date lives in scripts/db-quiet-until.txt
// ("YYYY-MM-DD · reason"). Until that day, the scheduled checks (daily-health-check.sh, before-confirming.mjs) run NO gate that reads
// the live database or site: each says "couldn't check" with this reason, never a guess and never a pass.
// exit 0 + one line = quiet (the line is the reason) · exit 1 = not quiet (no file, a bad date, or the day has come).
// Usage: node scripts/lib/db-quiet.mjs          → prints the reason when quiet
//        import { dbQuiet } from "./lib/db-quiet.mjs"
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "db-quiet-until.txt");

/** { until, reason } while today (local) is before the date in the file, else null. `now` is injectable for the gate. */
export function dbQuiet(now = new Date(), file = FILE) {
  let t = ""; try { t = fs.readFileSync(file, "utf8").trim(); } catch { return null; }
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})\s*(?:·\s*(.+))?$/m);
  if (!m) return null;
  const until = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (!(now < until)) return null;
  return { until: `${m[1]}-${m[2]}-${m[3]}`, reason: (m[4] || "the database is in a quiet period").trim() };
}

/** The same test the health check uses: does a gate's source read the live database or site? */
export const READS_LIVE = /SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|_admin-session|rocketgrowthagency\.com/;

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const q = dbQuiet();
  if (q) { console.log(`database quiet until ${q.until}: ${q.reason}`); process.exit(0); }
  process.exit(1);
}
