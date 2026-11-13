#!/bin/bash
# nightly-full-check.sh — THE FULL CHECK RUNS AT NIGHT (Chris 10-29: "we run the checks at night for ALL work for the day so it can
# run when im away" · "if it finds issues it fixes all of them at night so when i arrive account is fresh and good" · "make notes log of
# all work between full runs so the full run knows what to check"). → memory feedback_check_everything_before_confirming
#
# 11:30 PM (launchd com.rga.nightly-full-check):
#   1 · the range: every commit since the last run where EVERYTHING held (reports/full-check/last-run.json), both repos
#   2 · what to walk: the `steps:` and `compare:` lines of reports/full-check/worklog.md entries since that run
#   3 · before-confirming.mjs over that range (every gate that reads a changed file + their failure tests + cross-checks + the walk)
#   4 · anything red → ONE headless fixer session (scripts/nightly-fixer-prompt.md: mechanical fixes only, no design without an approved
#       mockup, RGA identity, never Google / client email / secrets), then the full check again
#   5 · all held → last-run.json moves to tonight's heads (a red night is re-checked tomorrow with the next day's work)
#   6 · the morning report: reports/full-check/<year>/<date>.md — Held · Fixed · Needs Chris
# One run at a time (lock). Never during the day: a run started after 07:00 stops before it starts.
set -u
export PATH="/opt/homebrew/bin:/Users/chris/.npm-global/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
SITE="/Users/chris/RGA/Rocket Growth Agency Website VS Code"
SCR="/Users/chris/RGA/Rocket Growth Agency Scraper VS Code"
DIR="$SITE/reports/full-check"; STATE="$DIR/last-run.json"; LOG="$DIR/worklog.md"
DAY=$(date +%F); OUT="$DIR/$(date +%Y)/$DAY.md"; RAW="/tmp/rga-nightly-full-check-$DAY"
LOCK="/tmp/rga-nightly-full-check.lock"
mkdir -p "$(dirname "$OUT")" "$RAW"
if ! mkdir "$LOCK" 2>/dev/null; then echo "another full check is running ($LOCK)"; exit 0; fi
trap 'rm -rf "$LOCK"' EXIT
H=$(date +%H); if [ "${FORCE:-}" != "1" ] && [ "$H" -ge 7 ] && [ "$H" -lt 21 ]; then echo "daytime — the full check runs at night (FORCE=1 to run now)"; exit 0; fi

# 🔒 SYSTEM HEALTH (approved admin_system_health_v1, Chris 10-31): this job says it ran, after the guards above (a refused start isn't a run). Reaching the
# end counts as having run whatever the verdict: red items live in the morning report. Dying partway is "Failed". The script always exits 0.
JOB_REACHED_END=""; JOB_NOTE=""; JOB_RED=""
job_checkin_finish() {
  local rc=$? ok=0 err=""
  [ "${DRY:-}" = "1" ] && return 0
  [ -n "$JOB_REACHED_END" ] && ok=1
  [ "$ok" = 1 ] || err="It stopped before the end (exit $rc)"
  # 🔒 11-11 (checkers): a night where not everything held is this job's ERROR, never "Ran", so the job-watcher emails it. JOB_RED names
  # what stayed red. Gate: check-daily-reds-reach-chris.
  if [ "$ok" = 1 ] && [ -n "${JOB_RED:-}" ]; then ok=0; err="$JOB_RED"; fi
  node "$SCR/scripts/job-checkin.mjs" finish nightly-full-check --ok "$ok" --note "$JOB_NOTE" --error "$err" || true
}
trap 'job_checkin_finish; rm -rf "$LOCK"' EXIT
[ "${DRY:-}" = "1" ] || node "$SCR/scripts/job-checkin.mjs" start nightly-full-check || true

# 🔒 11-11 ONE TURN ON THE CLIENTS' DATABASE + THE 06:00 HARD END (automation clock decision 1, approved: "the full check never runs
# past 06:00"). It waits up to an hour for the turn (a held turn = it did not run, said on System health, emailed); at 06:00 a watchdog
# stops whatever is still running, writes it into the morning report and the run ends "stopped before the end", so the 06:40 backup and
# the 07:30 morning check get the database. On 11-11 it ran to 06:19. Gate: check-production-runs-take-turns.
. "$(dirname "${BASH_SOURCE[0]}")/lib/production-turn.sh"
FULL_CHECK_HARD_END=$(production_turn_next_clock "${FULL_CHECK_HARD_END_HHMM:-0600}")
if [ "${DRY:-}" != "1" ] && ! production_turn_take nightly-full-check 60 "$FULL_CHECK_HARD_END"; then
  node "$SCR/scripts/job-checkin.mjs" finish nightly-full-check --ok 0 --error "Did not run: $PRODUCTION_TURN_WHY" || true
  trap 'rm -rf "$LOCK"' EXIT; echo "the full check did not run: $PRODUCTION_TURN_WHY"; exit 0
fi
full_check_kill_tree() { local c; for c in $(pgrep -P "$1" 2>/dev/null); do full_check_kill_tree "$c"; done; kill -TERM "$1" 2>/dev/null; }
[ "${DRY:-}" = "1" ] || ( main=$$; sleep $(( FULL_CHECK_HARD_END - $(date +%s) )) 2>/dev/null || exit 0
  kill -0 "$main" 2>/dev/null || exit 0   # it finished in time: nothing to stop
  { echo; echo "## Stopped at the 06:00 hard end"; echo "- The full check was still running at $(date +%H:%M) and was stopped so the morning backup and the morning check get the clients' database. What did not finish is checked again tomorrow night."; } >> "$OUT"
  kill -TERM "$main" 2>/dev/null; for c in $(pgrep -P "$main" 2>/dev/null); do [ "$c" = "$BASHPID" ] || full_check_kill_tree "$c"; done ) </dev/null >/dev/null 2>&1 &

# ── 1 · the range ────────────────────────────────────────────────────────────────────────────────
W_HEAD=$(git -C "$SITE" rev-parse HEAD); S_HEAD=$(git -C "$SCR" rev-parse HEAD)
W_SINCE=$(node -e 'try{process.stdout.write(require(process.argv[1]).website||"")}catch{}' "$STATE")
S_SINCE=$(node -e 'try{process.stdout.write(require(process.argv[1]).scraper||"")}catch{}' "$STATE")
[ -z "$W_SINCE" ] && W_SINCE=$(git -C "$SITE" rev-list -1 --before="30 hours ago" HEAD)
[ -z "$S_SINCE" ] && S_SINCE=$(git -C "$SCR" rev-list -1 --before="30 hours ago" HEAD)
# 🔒 11-13: THE RANGE IS CAPPED AT 48 HOURS. last-run.json only moves when a whole night holds; it sat at 11-01 for 12 days, so each night
# checked every commit since 11-01, ran into the 06:00 hard end, could not hold, and the range only grew (a loop it could never leave).
# The 07:30 morning check already runs every wired gate every day, so older commits are covered there; the night checks the last 48h.
W_CAP=$(git -C "$SITE" rev-list -1 --before="48 hours ago" HEAD); S_CAP=$(git -C "$SCR" rev-list -1 --before="48 hours ago" HEAD)
RANGE_CAPPED=""
if [ -n "$W_CAP" ] && git -C "$SITE" merge-base --is-ancestor "$W_SINCE" "$W_CAP" 2>/dev/null && [ "$W_SINCE" != "$W_CAP" ]; then W_SINCE="$W_CAP"; RANGE_CAPPED=1; fi
if [ -n "$S_CAP" ] && git -C "$SCR" merge-base --is-ancestor "$S_SINCE" "$S_CAP" 2>/dev/null && [ "$S_SINCE" != "$S_CAP" ]; then S_SINCE="$S_CAP"; RANGE_CAPPED=1; fi
{
  echo "# Full check · night of $DAY"
  echo
  echo "Range: website ${W_SINCE:0:8}..${W_HEAD:0:8} · scraper ${S_SINCE:0:8}..${S_HEAD:0:8}"
  [ -n "$RANGE_CAPPED" ] && echo "(capped to the last 48 hours: the last night that held is older; the 07:30 morning check covers every gate daily)"
} > "$OUT"
if [ "$W_SINCE" = "$W_HEAD" ] && [ "$S_SINCE" = "$S_HEAD" ]; then
  { echo; echo "## Morning summary"; echo "- **Nothing changed since the last full run.** Nothing to check."; } >> "$OUT"; JOB_REACHED_END=1; JOB_NOTE="Nothing changed since the last full run"; exit 0
fi

# ── 2 · what to walk: worklog entries since the last held run ────────────────────────────────────
SINCE_AT=$(node -e 'try{process.stdout.write(require(process.argv[1]).at||"")}catch{}' "$STATE")
STEPS=$(node -e '
const fs=require("fs"); const [log, since]=process.argv.slice(1); let t=""; try{t=fs.readFileSync(log,"utf8")}catch{}
const out=new Set(), cmp=[]; let on=!since, fence=false;
for (const l of t.split("\n")) { if (/^```/.test(l)) { fence=!fence; continue; } if (fence) continue; const h=/^## (\d{4}-\d{2}-\d{2} \d{2}:\d{2})/.exec(l); if (h) on = !since || new Date(h[1].replace(" ","T")) > new Date(since);
  if (!on) continue; const s=/^- steps:\s*(.+)$/.exec(l); if (s) s[1].split(/[,\s]+/).filter((x)=>/^m[12]\./.test(x)).forEach((x)=>out.add(x)); }
process.stdout.write([...out].join(","));' "$LOG" "$SINCE_AT")
COMPARES=(); while IFS= read -r c; do [ -n "$c" ] && COMPARES+=("$c"); done < <(node -e '
const fs=require("fs"); const [log, since]=process.argv.slice(1); let t=""; try{t=fs.readFileSync(log,"utf8")}catch{}
let on=!since, fence=false; for (const l of t.split("\n")) { if (/^```/.test(l)) { fence=!fence; continue; } if (fence) continue; const h=/^## (\d{4}-\d{2}-\d{2} \d{2}:\d{2})/.exec(l); if (h) on = !since || new Date(h[1].replace(" ","T")) > new Date(since);
  const c=/^- compare:\s*(\S.+)$/.exec(l); if (on && c) console.log(c[1].trim()); }' "$LOG" "$SINCE_AT")
ARGS=(--since="$W_SINCE" --scraper-since="$S_SINCE")
[ -n "$STEPS" ] && ARGS+=(--steps="$STEPS")
for c in ${COMPARES[@]+"${COMPARES[@]}"}; do ARGS+=(--compare="$c"); done
echo "Walked: ${STEPS:-none} · side by side: ${#COMPARES[@]}" >> "$OUT"

# DRY=1: print the range and the arguments, run nothing (to test the parsing)
if [ "${DRY:-}" = "1" ]; then cat "$OUT"; printf '%s\n' "${ARGS[@]}"; rm -f "$OUT"; exit 0; fi

# ── 3 · the full check ───────────────────────────────────────────────────────────────────────────
run_check() { (cd "$SCR" && node scripts/before-confirming.mjs "${ARGS[@]}") > "$1" 2>&1; }
run_check "$RAW/check-1.txt"
held_line() { grep -E "═══ .* held" "$1" | tail -1; }
failed_list() { grep -E "^(❌|⚠️)" "$1" | sed 's/^/- /'; }
L1=$(held_line "$RAW/check-1.txt")
{ echo; echo "## First run"; echo "$L1"; failed_list "$RAW/check-1.txt"; } >> "$OUT"

# ── 3b · what must run EVERY night, changed files or not (audit 10-31): before-confirming only runs gates that read a changed file, so a dead morning job went unseen ──
EVERY_NIGHT_RED=""
for g in check-the-daily-check-is-alive.mjs check-the-monthly-report-opens-the-call.mjs; do
  if ! (cd "$SCR" && node scripts/$g) > "$RAW/$g.txt" 2>&1; then
    EVERY_NIGHT_RED="$EVERY_NIGHT_RED $g"
    { echo; echo "## Every-night check: $g"; head -12 "$RAW/$g.txt"; } >> "$OUT"
  fi
done

# 🔒 11-11 (checkers build, master map approved): the live admin and portal against every step's approved mockup, EVERY night (not in
# the daily run, to spare production). Read-only: every write the pages try is blocked. A drift, or a night it could not tell, is red.
for g in check-live-matches-the-approved-mockup.mjs; do
  if ! (cd "$SCR" && set -a && { . ./.env >/dev/null 2>&1 || true; } && set +a && node scripts/$g) > "$RAW/$g.txt" 2>&1; then
    EVERY_NIGHT_RED="$EVERY_NIGHT_RED $g"
    { echo; echo "## Every-night check: $g"; head -45 "$RAW/$g.txt"; } >> "$OUT"
  fi
done

FIXED=""
# 🔒 HELD UNTIL THE USAGE RESET (Chris 10-31, "do recomended"): the fixer is a full Opus session, up to 250 turns, and the weekly Claude limit was at 75%. The check still runs and reports; only the
# automatic fixing waits. Lifts itself Wed Nov 4 at 6 PM. To end it sooner, or to hold again, change this one date.
FIXER_HOLD_UNTIL="202611041800"
if [ "$(date +%Y%m%d%H%M)" -lt "$FIXER_HOLD_UNTIL" ] && grep -q "FAILED" "$RAW/check-1.txt"; then
  { echo; echo "## Night fixer held"; echo "Held until Nov 4, 6 PM to save Claude usage. The red items above weren't fixed tonight."; } >> "$OUT"
elif grep -q "FAILED" "$RAW/check-1.txt"; then
  # ── 4 · the fixer: one headless session, mechanical fixes only (scripts/nightly-fixer-prompt.md) ───
  PROMPT="$(cat "$SCR/scripts/nightly-fixer-prompt.md")

Tonight's report: $OUT
Tonight's raw check output: $RAW/check-1.txt
Range: website $W_SINCE..$W_HEAD · scraper $S_SINCE..$S_HEAD
Worklog: $LOG"
. "$(dirname "$0")/lib/find-claude.sh"   # find claude wherever it is installed (11-10 weekly audit "claude not found")
  (cd "$SITE" && claude -p "$PROMPT" --model opus --permission-mode acceptEdits --max-turns 250 \
     --allowedTools "Read" "Edit" "Write" "Grep" "Glob" "Bash(node:*)" "Bash(git:*)" "Bash(bash scripts/deploy-site.sh:*)" "Bash(grep:*)" "Bash(sed -n:*)" "Bash(ls:*)" "Bash(cat:*)" "Bash(python3:*)" "Bash(cp:*)" "Bash(curl -s:*)" \
     > "$RAW/fixer.txt" 2>&1) &
  FP=$!; ( sleep 14400; kill "$FP" 2>/dev/null ) & KP=$!
  wait "$FP"; kill "$KP" 2>/dev/null
  FIXED=1
  W_HEAD=$(git -C "$SITE" rev-parse HEAD); S_HEAD=$(git -C "$SCR" rev-parse HEAD)
  run_check "$RAW/check-2.txt"
  L2=$(held_line "$RAW/check-2.txt")
  { echo; echo "## After the night fixer"; echo "$L2"; failed_list "$RAW/check-2.txt"; echo; echo "### What the fixer did"; tail -60 "$RAW/fixer.txt"; } >> "$OUT"
fi

# ── 5 · move the marker only when everything held ────────────────────────────────────────────────
FINAL="$RAW/check-1.txt"; [ -n "$FIXED" ] && FINAL="$RAW/check-2.txt"
if ! grep -q "FAILED" "$FINAL"; then
  node -e 'require("fs").writeFileSync(process.argv[1], JSON.stringify({ website: process.argv[2], scraper: process.argv[3], at: new Date().toISOString().slice(0,16).replace("T"," ") }, null, 2) + "\n")' "$STATE" "$W_HEAD" "$S_HEAD"
  printf '\n<!-- FULL RUN HELD: %s · website %s · scraper %s -->\n' "$(date '+%Y-%m-%d %H:%M')" "${W_HEAD:0:8}" "${S_HEAD:0:8}" >> "$LOG"
  VERDICT="**Everything held**${FIXED:+ after the night fixer}. The portals are good to go."
else
  VERDICT="**Not everything held.** The red items are listed above and in \"Needs Chris\"; tomorrow night re-checks them with the day's work."
fi
if grep -q "FAILED" "$FINAL"; then JOB_NOTE="Not everything held; see the morning report"; else JOB_NOTE="Everything held${FIXED:+ after the night fixer}"; fi
[ -z "$EVERY_NIGHT_RED" ] || VERDICT="$VERDICT **Red every-night checks:$EVERY_NIGHT_RED.**"
# what stayed red, for System health: the full check's failed items and the every-night checks (never "Ran" when anything is red)
_red_items=$(grep -E "^(❌|⚠️)" "$FINAL" | wc -l | tr -d ' ')
if grep -q "FAILED" "$FINAL" || [ -n "$EVERY_NIGHT_RED" ]; then
  JOB_RED="Not everything held: ${_red_items} item(s) red or could not tell$([ -n "$EVERY_NIGHT_RED" ] && printf '; every-night red:%s' "$EVERY_NIGHT_RED"). See website reports/full-check/$(date +%Y)/$DAY.md"
fi
# ── 6 · the morning summary goes to the top ──────────────────────────────────────────────────────
{ echo "## Morning summary"; echo "- $VERDICT"; [ -n "$FIXED" ] && grep -A40 "^## Morning summary (fixer)" "$RAW/fixer.txt" | tail -n +2 | head -40; echo; cat "$OUT"; } > "$OUT.tmp" && mv "$OUT.tmp" "$OUT"
JOB_REACHED_END=1
echo "full check done: $VERDICT"
