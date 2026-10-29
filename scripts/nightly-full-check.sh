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

# ── 1 · the range ────────────────────────────────────────────────────────────────────────────────
W_HEAD=$(git -C "$SITE" rev-parse HEAD); S_HEAD=$(git -C "$SCR" rev-parse HEAD)
W_SINCE=$(node -e 'try{process.stdout.write(require(process.argv[1]).website||"")}catch{}' "$STATE")
S_SINCE=$(node -e 'try{process.stdout.write(require(process.argv[1]).scraper||"")}catch{}' "$STATE")
[ -z "$W_SINCE" ] && W_SINCE=$(git -C "$SITE" rev-list -1 --before="30 hours ago" HEAD)
[ -z "$S_SINCE" ] && S_SINCE=$(git -C "$SCR" rev-list -1 --before="30 hours ago" HEAD)
{
  echo "# Full check · night of $DAY"
  echo
  echo "Range: website ${W_SINCE:0:8}..${W_HEAD:0:8} · scraper ${S_SINCE:0:8}..${S_HEAD:0:8}"
} > "$OUT"
if [ "$W_SINCE" = "$W_HEAD" ] && [ "$S_SINCE" = "$S_HEAD" ]; then
  { echo; echo "## Morning summary"; echo "- **Nothing changed since the last full run.** Nothing to check."; } >> "$OUT"; exit 0
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

FIXED=""
if grep -q "FAILED" "$RAW/check-1.txt"; then
  # ── 4 · the fixer: one headless session, mechanical fixes only (scripts/nightly-fixer-prompt.md) ───
  PROMPT="$(cat "$SCR/scripts/nightly-fixer-prompt.md")

Tonight's report: $OUT
Tonight's raw check output: $RAW/check-1.txt
Range: website $W_SINCE..$W_HEAD · scraper $S_SINCE..$S_HEAD
Worklog: $LOG"
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
# ── 6 · the morning summary goes to the top ──────────────────────────────────────────────────────
{ echo "## Morning summary"; echo "- $VERDICT"; [ -n "$FIXED" ] && grep -A40 "^## Morning summary (fixer)" "$RAW/fixer.txt" | tail -n +2 | head -40; echo; cat "$OUT"; } > "$OUT.tmp" && mv "$OUT.tmp" "$OUT"
echo "full check done: $VERDICT"
