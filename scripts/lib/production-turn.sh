# scripts/lib/production-turn.sh: ONE TURN AT A TIME ON THE CLIENTS' DATABASE (automation clock, approved 11-11, decision 1:
# "One shared lock: whichever run holds it, the others wait; each has a hard end time, and the full check never runs past 06:00").
#
# WHY. On 11-10/11 the night full check ran 7 hours (23:30 to 06:19) and the morning check, the client data backup and the night runs
# read the clients' Supabase with no interlock (the full check locked only against itself). The rule "production-reading gates one at a
# time" (feedback_my_test_runs_share_the_clients_database) was kept inside each run, never between runs.
#
# WHO TAKES IT: every run that reads the clients' database: the night full check (whole run, hard end 06:00), the morning check (whole
# run, hard end start + 6 h), the client data backup (whole run, scripts/lib/production-turn.mjs, the same lock). The 9 PM video run is
# not one: its pre-flight gates read no client data, and check-production-runs-take-turns fails the day one does.
#
#   . scripts/lib/production-turn.sh
#   production_turn_take <who> <max_wait_min> <hard_end_epoch>   # 0 = yours; 1 = still held after the wait (PRODUCTION_TURN_WHY says by whom)
#
# THE TURN IS GIVEN BACK BY ITSELF. A guardian process frees it the moment the holder's process ends, however it ends, so no run has to
# remember a trap (each run already owns its EXIT trap). A holder that died without its guardian is taken over (its pid is gone), and a
# holder still alive 10 minutes past its own hard end is taken over and said, so one stuck run can't stop every other run forever.
# A run started by a holder (a gate inside the morning check) inherits the turn: RGA_PRODUCTION_TURN_HELD is set for its children.
PRODUCTION_TURN_DIR="${RGA_PRODUCTION_TURN_DIR:-/tmp/rga-production-turn}"
PRODUCTION_TURN_WHY=""

production_turn_holder() { head -1 "$PRODUCTION_TURN_DIR/holder" 2>/dev/null; }

# 0 = the lock can be taken over (no live holder), 1 = a live holder inside its time
_production_turn_free_to_take() {
  local h pid until age
  h=$(production_turn_holder)
  if [ -z "$h" ]; then
    # mkdir and the holder line are a moment apart: an empty lock is only abandoned once it's a minute old
    age=$(( $(date +%s) - $(stat -f %m "$PRODUCTION_TURN_DIR" 2>/dev/null || stat -c %Y "$PRODUCTION_TURN_DIR" 2>/dev/null || date +%s) ))
    [ "$age" -gt 60 ] && return 0
    return 1
  fi
  pid=$(printf '%s' "$h" | cut -f2); until=$(printf '%s' "$h" | cut -f4)
  case "$pid" in ''|*[!0-9]*) return 0 ;; esac
  kill -0 "$pid" 2>/dev/null || return 0
  case "$until" in ''|*[!0-9]*) return 1 ;; esac
  if [ "$(date +%s)" -gt $(( until + 600 )) ]; then
    echo "  ⚠️  production turn: $(printf '%s' "$h" | cut -f1) is still holding it 10 minutes past its hard end; taking it over" >&2
    return 0
  fi
  return 1
}

production_turn_take() {
  local who="$1" wait_min="${2:-60}" until="${3:-0}" give_up h
  if [ -n "${RGA_PRODUCTION_TURN_HELD:-}" ]; then return 0; fi   # started by a run that holds it
  give_up=$(( $(date +%s) + wait_min * 60 ))
  while :; do
    if mkdir "$PRODUCTION_TURN_DIR" 2>/dev/null; then
      printf '%s\t%s\t%s\t%s\n' "$who" "$$" "$(date +%s)" "$until" > "$PRODUCTION_TURN_DIR/holder"
      export RGA_PRODUCTION_TURN_HELD="$who"
      # the guardian: gives the turn back when this process ends, only if it is still ours
      ( holder_pid=$$; while kill -0 "$holder_pid" 2>/dev/null; do sleep "${RGA_PRODUCTION_TURN_GUARD_SEC:-15}"; done
        [ "$(production_turn_holder | cut -f2)" = "$holder_pid" ] && rm -rf "$PRODUCTION_TURN_DIR" ) </dev/null >/dev/null 2>&1 &
      return 0
    fi
    if _production_turn_free_to_take; then rm -rf "$PRODUCTION_TURN_DIR"; continue; fi
    if [ "$(date +%s)" -ge "$give_up" ]; then
      h=$(production_turn_holder)
      PRODUCTION_TURN_WHY="$(printf '%s' "$h" | cut -f1) held the clients' database for the whole ${wait_min}-minute wait (since $(date -r "$(printf '%s' "$h" | cut -f3)" +%H:%M 2>/dev/null || echo '?'))"
      return 1
    fi
    sleep "${RGA_PRODUCTION_TURN_POLL_SEC:-30}"
  done
}

# The next HH:MM (local time) as epoch seconds, today if still ahead, else tomorrow.
production_turn_next_clock() {
  local hhmm="$1" now at
  now=$(date +%s)
  at=$(date -j -f "%Y-%m-%d %H%M%S" "$(date +%Y-%m-%d) ${hhmm}00" +%s 2>/dev/null)
  # tomorrow by the calendar, not +86400, so the night daylight saving changes still ends at 06:00 on the clock
  [ -n "$at" ] && [ "$at" -le "$now" ] && at=$(date -j -f "%Y-%m-%d %H%M%S" "$(date -v+1d +%Y-%m-%d) ${hhmm}00" +%s 2>/dev/null)
  echo "${at:-0}"
}
