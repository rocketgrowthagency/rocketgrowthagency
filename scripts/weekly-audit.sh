#!/bin/bash
# weekly-audit.sh — Chris 10-31: "this is amazing we shoul drun this weekly on a scedhule". The audit from reports/audits/2026-10-31/, every week.
# 🔒 READ-ONLY BY CONSTRUCTION: the session gets Read, Grep, Glob and read-only git, nothing that can write or reach a service. It prints; THIS SCRIPT saves. Nothing deploys, commits or
# changes a client. Findings are read and fixed in a normal session.
# 🔴 NOT SCHEDULED BY ME: the permission system refused installing it twice, so the schedule is Chris's to install (scripts/launchd/com.rga.weekly-audit.plist, see project_audit_2026-10-31).
set -uo pipefail
SCR="/Users/chris/RGA/Rocket Growth Agency Scraper VS Code"
SITE="/Users/chris/RGA/Rocket Growth Agency Website VS Code"
DAY=$(date +%F)
OUT="$SITE/reports/audits/$DAY"
STATUS="$HOME/.claude/weekly-audit-status.json"
mkdir -p "$OUT"
record() { printf '{"at":"%s","ok":%s,"file":"%s","note":"%s"}\n' "$(date -u +%FT%TZ)" "$1" "$OUT/audit.md" "$2" > "$STATUS"; }
tell() { [ -n "${BACKUP_QUIET:-}" ] || osascript -e "display notification \"$1\" with title \"RGA weekly audit\"" 2>/dev/null; }
if ! command -v claude >/dev/null 2>&1; then record false "claude not found"; tell "couldn't run: claude not found"; exit 2; fi
cd "$SITE" || exit 2
claude -p "$(cat "$SCR/scripts/weekly-audit-prompt.md")" --model opus --add-dir "$SCR" --max-turns 120 \
  --allowedTools "Read" "Grep" "Glob" "Bash(git log:*)" "Bash(git show:*)" "Bash(git diff:*)" "Bash(git status:*)" \
  --disallowedTools "Edit" "Write" "NotebookEdit" "WebFetch" "WebSearch" "Agent" \
  > "$OUT/audit.md.tmp" 2>"$OUT/audit.err"
rc=$?
if [ "$rc" -ne 0 ] || [ ! -s "$OUT/audit.md.tmp" ]; then record false "the session exited $rc"; tell "didn't finish; see $OUT/audit.err"; rm -f "$OUT/audit.md.tmp"; exit 1; fi
mv "$OUT/audit.md.tmp" "$OUT/audit.md"; rm -f "$OUT/audit.err"
record true "done"
tell "this week's audit is ready: $(head -1 "$OUT/audit.md" | cut -c1-100)"
