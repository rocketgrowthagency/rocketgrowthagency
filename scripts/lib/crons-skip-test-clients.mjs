// crons-skip-test-clients.mjs — ONE answer to "does every scheduled job leave the walk's test clients alone?", shared by
// check-the-new-client-stays-new and check-the-month-2-client-stays-at-month-start (they each carried a copy of a
// hand-written list of 3–4 crons; on 2026-10-14 four more scheduled jobs read every client with no skip, and the nightly
// step re-check reopened five finished steps on the Month-2 fixture).
// 🔑 The list is DISCOVERED: every function with a `schedule` in netlify.toml, plus the jobs named by the caller.
// → feedback_a_lift_list_is_a_promise_somebody_will_remember · project_acceptance_walk
import fs from "node:fs";
import path from "node:path";

export const SKIP = "source.not.like.test:*";
// `or=(source.is.null,…)` on its own, or `or(source.is.null,…)` inside an and=(…) when the query has another or
const SKIP_RE = /or=?\(source\.is\.null,source\.not\.like\.test:\*\)/;

/** Returns { fails, scheduled, checked } — fails is a list of sentences; it never throws for a missing file. */
export function cronSkipFails(SITE, alsoCheck = []) {
  const fails = [];
  let toml = "";
  try { toml = fs.readFileSync(path.join(SITE, "netlify.toml"), "utf8"); } catch { return { fails: ["cannot read netlify.toml"], scheduled: [], checked: 0 }; }
  const scheduled = [...toml.matchAll(/\[functions\."?([a-z0-9-]+)"?\]\s*\n\s*schedule/g)].map((m) => `netlify/functions/${m[1]}.js`);
  if (scheduled.length < 5) fails.push(`only ${scheduled.length} scheduled function(s) found in netlify.toml — the gate no longer understands it (re-read it)`);
  const all = [...new Set([...alsoCheck, ...scheduled])];
  for (const rel of all) {
    let src;
    try { src = fs.readFileSync(path.join(SITE, rel), "utf8"); } catch { fails.push(`cannot read ${rel}`); continue; }
    // a client-WIDE read = a /clients? query not narrowed to one id
    const wide = [...src.matchAll(/\/clients\?([^`"'\s]*)/g)].map((m) => m[1]).filter((q) => !/(^|&)id=eq\./.test(q));
    // a scheduled job with no client-wide read is fine (it works on something else); a job the caller NAMED must have one
    if (!wide.length) { if (alsoCheck.includes(rel)) fails.push(`${rel}: no client-wide query found — the gate no longer understands it (re-read it)`); continue; }
    for (const q of wide) if (!SKIP_RE.test(q)) fails.push(`${rel}: /clients?${q.slice(0, 90)} does not skip test clients`);
  }
  return { fails, scheduled, checked: all.length };
}
