#!/bin/bash
# recovery-rounds.sh — keep rebuilding the failed-video backlog, round after round, until the night runs
# out or there is nothing left worth retrying. (2026-08-19)
#
# WHY
# Chris: "add all this into the pipeline so it can self fix and go through as many rounds as it needs
# until as many videos are fixed."
#
# The nightly run already: builds tonight's category → reconciles → does ONE slow recovery pass. What it
# never did is work the HISTORICAL backlog — leads that failed on earlier nights, most of which have no
# Airtable row at all (they died before step-8), so reconcile-missing-videos and parole are both blind to
# them. Their only record is the overnight REPORT. scripts/recover-lost-leads.mjs reads those reports;
# this drives it in a loop.
#
# MEASURED EXPECTATION — do not promise more than this:
#   Re-running a failed lead recovers roughly 1 IN 3 (6 of 24 on 2026-08-19).
#   See project_video_failure_taxonomy. The rest split into reproducible-per-lead and
#   permanently-unbuildable (broken TLS on the prospect's own site, no reachable contact).
#
# HOW A ROUND WORKS
#   1. ask recover-lost-leads.mjs which businesses from past reports still have no live video
#   2. take the next CHUNK of them (one chunk = one rebuild batch = ONE deploy at the end)
#   3. run rebuild-broken-videos.sh; each lead is watchdog-bounded inside that script
#   4. record an attempt per lead; a lead at the cap is never queued again
#   5. repeat until: nothing left · the clock runs out · the night window ends · no progress in a round
#
# 🔒 WHY CHUNKS, NOT ONE BIG BATCH
# rebuild-broken-videos.sh deploys ONCE at the end of its argument list. A batch that gets killed
# part-way therefore loses every video it built (that is exactly what happened to chan-and-company-inc
# when a 24-lead run was interrupted). Chunking banks the work: each chunk deploys before the next starts.
#
# Env: RECOVERY_CHUNK (default 6) · RECOVERY_MAX_ROUNDS (default 6) · RECOVERY_ATTEMPT_CAP (default 3)
#      RECOVERY_DEADLINE_EPOCH (unix ts; default = the caller's, else 06:30 tomorrow)
set -uo pipefail
SCRAPER="/Users/chris/RGA/Rocket Growth Agency Scraper VS Code"
cd "$SCRAPER"
LOG="${1:-/tmp/recovery-rounds-$(date +%Y-%m-%d).log}"
CHUNK="${RECOVERY_CHUNK:-6}"
MAX_ROUNDS="${RECOVERY_MAX_ROUNDS:-6}"
CAP="${RECOVERY_ATTEMPT_CAP:-3}"
LEDGER="$SCRAPER/output/recovery-attempts.tsv"
say(){ echo "$*" | tee -a "$LOG"; }

# Default deadline: 06:30 tomorrow — inside the 07:00 capture interlock with margin to finish a chunk.
DEADLINE="${RECOVERY_DEADLINE_EPOCH:-$(date -j -f '%Y-%m-%d %H:%M' "$(date -v+1d +%Y-%m-%d) 06:30" +%s 2>/dev/null || echo 0)}"

mkdir -p "$(dirname "$LEDGER")"; touch "$LEDGER"
attempts_for(){ awk -F'\t' -v k="$1" '$1==k{c=$2} END{print c+0}' "$LEDGER"; }
bump_attempt(){ local k="$1" n; n=$(( $(attempts_for "$k") + 1 ))
  awk -F'\t' -v k="$k" -v n="$n" 'BEGIN{OFS="\t"} $1!=k{print} END{print k,n}' "$LEDGER" > "$LEDGER.tmp" && mv "$LEDGER.tmp" "$LEDGER"; }

say "=== recovery-rounds START $(date) — chunk=${CHUNK} maxRounds=${MAX_ROUNDS} cap=${CAP} deadline=$(date -r "$DEADLINE" '+%H:%M' 2>/dev/null) ==="

round=0
while [ "$round" -lt "$MAX_ROUNDS" ]; do
  round=$((round+1))

  # --- stop conditions checked BEFORE starting a chunk (a chunk is ~35 min at 6 leads) ---
  if [ "$DEADLINE" -gt 0 ] && [ "$(date +%s)" -ge "$DEADLINE" ]; then
    say ">>> deadline reached — stopping after $((round-1)) round(s)."; break; fi
  # The night window guards ONE risk: the macOS desktop grab films whatever is on screen. With
  # DAYTIME_SAFE_CAPTURE=1 the freeze comes from page.screenshot, which captures only the browser page and
  # CANNOT see the desktop — so the risk the window exists for is gone, and daylight is allowed.
  # Proven 2026-08-19: 7 videos rebuilt in daylight this way while Chris worked, all gate-passed.
  # Without DAYTIME_SAFE_CAPTURE this stays a hard stop — a daytime desktop grab would film his screen.
  NH=$(( 10#$(date +%H) ))
  if [ "${DAYTIME_SAFE_CAPTURE:-0}" != "1" ] && [ "$NH" -ge 7 ] && [ "$NH" -lt 21 ]; then
    say ">>> night window ended ($(date +%H:%M)) — stopping; the desktop grab must not run in the workday."; break; fi
  # Hard stop before the 21:00 scheduled run regardless of mode: two capture jobs would fight over Chrome.
  if [ "$NH" -ge 20 ] && [ "${DAYTIME_SAFE_CAPTURE:-0}" = "1" ]; then
    say ">>> 20:00 reached — stopping so the 21:00 scheduled run has the machine to itself."; break; fi
  if [ -f "$SCRAPER/output/STOP-OVERNIGHT" ]; then say ">>> STOP-OVERNIGHT present — stopping."; break; fi

  # --- who is still missing a video? (reads the reports, probes the LIVE site by content-type) ---
  MISSING_JSON="/tmp/recovery-missing-$$.json"
  if ! node scripts/recover-lost-leads.mjs --json > "$MISSING_JSON" 2>>"$LOG"; then
    say ">>> recover-lost-leads failed (probe broken or rate-limited) — stopping rather than guessing."; break; fi

  # Filter to leads under the attempt cap, then take the next chunk.
  SLUGS=()
  while IFS= read -r slug; do
    [ -n "$slug" ] || continue
    [ "$(attempts_for "$slug")" -lt "$CAP" ] || continue
    SLUGS+=("$slug")
    [ "${#SLUGS[@]}" -ge "$CHUNK" ] && break
  done < <(node -e 'const j=require(process.argv[1]);(j.missing||[]).forEach(m=>console.log(m.slug))' "$MISSING_JSON" 2>/dev/null)
  rm -f "$MISSING_JSON"

  if [ "${#SLUGS[@]}" -eq 0 ]; then
    say ">>> round ${round}: nothing left under the attempt cap — backlog drained or exhausted. Done."; break; fi

  say ">>> round ${round}: rebuilding ${#SLUGS[@]} lead(s) — ${SLUGS[*]}"
  for s in "${SLUGS[@]}"; do bump_attempt "$s"; done

  # One chunk = one rebuild batch = ONE deploy at the end, so progress is banked even if the next round
  # never starts. DAYTIME_SAFE_CAPTURE is NOT set: this runs inside the night window, where the desktop
  # grab is the better path (page.screenshot is the daytime-only fallback).
  DAYTIME_SAFE_CAPTURE="${DAYTIME_SAFE_CAPTURE:-0}" ./scripts/rebuild-broken-videos.sh "${SLUGS[@]}" 2>&1 | tee -a "$LOG"
  RC=${PIPESTATUS[0]}
  say ">>> round ${round} finished (rc=$RC)"
done

say "=== recovery-rounds DONE $(date) — ${round} round(s) ==="
say "    Expect ~1 in 3 to recover (project_video_failure_taxonomy). Leads at the ${CAP}-attempt cap are"
say "    parked in $LEDGER and will not be retried again."
exit 0
