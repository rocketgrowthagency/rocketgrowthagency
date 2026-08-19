#!/bin/bash
# overnight-local.sh — CITY-FIRST local-domination overnight runner (locked 2026-07-01).
#
# When Chris says "I'm leaving for the night", THIS is what runs. It:
#   1. Asks next-search.mjs for the nearest unscraped city+business (proximity order, SoCal-first).
#   2. Runs the full video pipeline on it (scrape → render → deploy → publish to Airtable).
#   3. Loops to the NEXT nearest city+business — building a buffer of ready-to-send local videos
#      through the night. The ~50/day send cap drips them out; a backlog of ready videos is good.
# Stops when: the night window (caffeinate) ends, MAX_SEARCHES hit, or SoCal is fully exhausted.
#
# Usage (Chris away only — needs the screen for Maps capture):
#   ./scripts/overnight-local.sh            # loop until window/queue ends
#   MAX_SEARCHES=3 ./scripts/overnight-local.sh
set -u
# pipefail (2026-07-27): make a piped stage report the real (leftmost) exit, not just tee's success,
# so a crashing node step in a `node ... | tee` is visible via PIPESTATUS. Deliberately NO `set -e` —
# many steps here fail intentionally with `|| true`, and aborting the whole night on one is wrong.
set -o pipefail
SCRAPER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRAPER_DIR"
DATE_STAMP=$(date +%Y-%m-%d)
LOG="/tmp/overnight-local-${DATE_STAMP}.log"

# STALE-CAPTURE REAPER (2026-07-27) — self-heal before starting. A hung step-3 on
# 2026-07-27 orphaned its Chrome/ffmpeg; those held a pipe open and wedged the run
# for 2.5 days (launchd never reloaded → 2 lost nights). These automation-only
# processes must NEVER exist at a fresh run's start (capture is night-only + one run
# at a time), so anything matching is a straggler from a wedged prior run and is safe
# to reap. Scoped strictly to the step-3 recorder + its dedicated chrome-profile-step3*
# / chrome-profile-step25* dirs — this can NEVER touch Chris's real browser.
for _pat in "step-3-video-recorder.mjs" "chrome-profile-step3" "chrome-profile-step25"; do
  if pkill -9 -f "$_pat" 2>/dev/null; then
    echo "=== reaped stale capture straggler(s) matching '$_pat' before start $(date) ===" | tee -a "$LOG"
  fi
done

# LOUD-SKIP ALERTING + FLAG TTL (2026-07-27) — a night that produces ZERO must NEVER be silent.
# The 07-22/23 dead nights were a stale output/PRODUCTION-PAUSED file doing `exit 0` that looked like
# success to launchd, with no alert. Any skip now (a) appends to a persistent human-visible log and
# (b) fires a macOS notification, and a pause/backfill flag older than FLAG_TTL_DAYS escalates the
# message as "likely forgotten" so it gets cleared. We do NOT auto-delete the flag (it's Chris's kill
# switch) — we just make the skip impossible to miss.
SKIP_ALERT_LOG="$SCRAPER_DIR/output/SKIPPED-NIGHTS.log"
FLAG_TTL_DAYS="${FLAG_TTL_DAYS:-3}"
alert_skip() {
  local reason="$1"
  mkdir -p "$SCRAPER_DIR/output"
  echo "$(date '+%Y-%m-%d %H:%M') — NIGHT SKIPPED/DEGRADED: $reason" >> "$SKIP_ALERT_LOG"
  osascript -e "display notification \"$reason\" with title \"RGA overnight SKIPPED\"" 2>/dev/null || true
}
flag_age_days() { # $1 = file → integer days since mtime (0 if absent)
  local f="$1"; [ -f "$f" ] || { echo 0; return; }
  local mt; mt=$(stat -f %m "$f" 2>/dev/null || echo 0)
  echo $(( ( $(date +%s) - mt ) / 86400 ))
}

# NIGHT-ONLY INTERLOCK (locked 2026-07-10 — Chris: "we only do at night"). The Maps segment is a live
# SCREEN recording; running it while the Mac is in use bleeds the desktop (other apps, private notes,
# FORBIDDEN Liberty Tribune content) into the outreach videos, and the 6/6 gate does NOT catch that.
# This HARD guard refuses to capture outside the night window (21:00–06:59) so a manual/cron daytime
# trigger can NEVER film the desktop. 10#$ forces base-10 (avoids the "08"/"09" octal trap).
# NO OVERRIDE (locked 2026-07-20): the old ALLOW_DAYTIME_CAPTURE=1 escape hatch was used on 07-18 and
# filmed Chris's VS Code desktop (Echory/Liberty-Tribune) into a public video that got emailed. A rule a
# human can bypass under pressure WILL be bypassed — so the override is deleted. Capture is night-only, full stop.
HOUR=$(( 10#$(date +%H) ))
if [ "$HOUR" -ge 7 ] && [ "$HOUR" -lt 21 ]; then
  echo "=== overnight-local BLOCKED $(date) — night-only interlock: video capture runs 21:00–06:59 to avoid filming the desktop. No override. ===" | tee -a "$LOG"
  exit 0
fi

# PRODUCTION PAUSE GATE (2026-07-03). The production governor (or Chris) pauses nightly video
# production when the send side is caught up (sendable buffer >> daily send rate) or deliverability
# is unsafe. If paused, exit immediately WITHOUT caffeinating or scraping. The governor removes
# output/PRODUCTION-PAUSED to resume when buffer drains + bounce is GREEN. See feedback_production_governor.
# AUTONOMOUS SELF-REGULATION (2026-07-10): consult the production governor on EVERY run so nightly
# production MATCHES SEND OUTPUT with zero human involvement. Build ONLY when the send side needs fuel
# (sendable buffer <= RESUME_BUFFER_MAX) AND bounce is GREEN (< RESUME_BOUNCE_MAX). This replaces the
# old "only check the governor IF a manual pause-flag happens to exist" logic — which meant that once
# the flag was auto-cleared, production ran unconditionally every night and OVERPRODUCED. Domain
# protection = rule #1 → FAILS SAFE: only a clean RESUME (exit 0) proceeds; STAY-PAUSED / undecidable
# (exit 1 / 2) skips the night. A manual output/PRODUCTION-PAUSED file is a HARD override that
# force-skips regardless of what the governor says (Chris's kill switch). See feedback_production_governor.
if [ -f "$SCRAPER_DIR/output/PRODUCTION-PAUSED" ]; then
  PP_AGE=$(flag_age_days "$SCRAPER_DIR/output/PRODUCTION-PAUSED")
  PP_MSG="PRODUCTION-PAUSED flag present (${PP_AGE}d old) — not producing tonight."
  if [ "$PP_AGE" -ge "$FLAG_TTL_DAYS" ]; then
    PP_MSG="STALE PRODUCTION-PAUSED flag (${PP_AGE}d old — likely forgotten). Delete output/PRODUCTION-PAUSED to resume. Not producing tonight."
  fi
  echo "=== overnight-local SKIP $(date) — $PP_MSG ===" | tee -a "$LOG"
  cat "$SCRAPER_DIR/output/PRODUCTION-PAUSED" 2>/dev/null | tee -a "$LOG"
  alert_skip "$PP_MSG"
  exit 0
fi
# BACKFILL MODE (Chris 2026-07-22: "finish the backfill THEN move to new scrape categories"). While
# output/BACKFILL-MODE exists, do NO new category tonight — just re-render the broken/leaked-video backlog
# via the recovery + reconcile pass below (MAX_SEARCHES=0 skips the fresh scrape but the recovery pass still
# runs). Remove output/BACKFILL-MODE once the backlog is drained (missing-video gap = 0) to resume new scrapes.
if [ -f "$SCRAPER_DIR/output/BACKFILL-MODE" ]; then
  BF_AGE=$(flag_age_days "$SCRAPER_DIR/output/BACKFILL-MODE")
  echo "=== BACKFILL MODE (${BF_AGE}d old) — re-rendering the broken-video backlog ONLY tonight (no new category). Remove output/BACKFILL-MODE when drained. ===" | tee -a "$LOG"
  if [ "$BF_AGE" -ge "$FLAG_TTL_DAYS" ]; then
    alert_skip "BACKFILL-MODE flag is ${BF_AGE}d old — NO new categories are being scraped. Delete output/BACKFILL-MODE to resume fresh scrapes."
  fi
  MAX_SEARCHES=0
else
  # ONE scrape/category per night, BUILD ALL ITS VIDEOS (Chris 2026-07-21: "run like it used to — 1 run per
  # night; I scrape a category and make ALL the videos for that scrape"). The send-capacity governor no longer
  # GATES production down to 0/throttled — we always run the 1 category and build a video for EVERY emailable
  # lead. The send throttle (Apps Script daily cap + follow-up pacing) is separate + untouched. Governor runs
  # once for VISIBILITY only (bounce/room logging).
  node "$SCRAPER_DIR/scripts/check-resume-production.mjs" 2>&1 | tee -a "$LOG" || true
  MAX_SEARCHES=1   # exactly one scrape/category per night; build all its videos

  # 2026-08-18 — TEMPORARY BACKLOG DRAIN. While output/CLEAR-BACKLOG exists, run up to 3 categories a
  # night instead of 1, so a queue of armed rebuilds clears in days rather than weeks.
  #
  # WHY IT'S NEEDED: an armed redo only re-renders when ITS search is re-picked, and next-search walks
  # the vertical list in a fixed order. With 5 searches queued (Landscapers #7, Body shop #22, Auto
  # detailing #24, Towing #25, Yoga studios #45) the 1-category cadence takes FIVE nights to reach the
  # last one — during which those leads have no video at all.
  #
  # 🔒 This does NOT weaken the real bound. Every emailable lead in each scrape still gets a video
  # (feedback_every_email_gets_a_video), already-deployed leads idempotency-skip so a re-picked category
  # only builds what's missing, and MAX_RUN_HOURS + the 07:00 night-only interlock still stop the run.
  # 3 is the documented ceiling in feedback_overnight_run_cap.
  #
  # ⚠️ REVERT by deleting output/CLEAR-BACKLOG — the cadence is 1/night by default
  # (feedback_nightly_operating_cadence) and this is a drain, not a new normal. Alerts if left stale, the
  # same way BACKFILL-MODE does, so it can't quietly become permanent
  # (feedback_pending_action_memories_go_stale).
  if [ -f "$SCRAPER_DIR/output/CLEAR-BACKLOG" ]; then
    CB_AGE=$(flag_age_days "$SCRAPER_DIR/output/CLEAR-BACKLOG")
    MAX_SEARCHES=3
    echo "=== CLEAR-BACKLOG (${CB_AGE}d old) — up to ${MAX_SEARCHES} categories tonight to drain the armed-rebuild queue. Delete output/CLEAR-BACKLOG to return to 1/night. ===" | tee -a "$LOG"
    if [ "$CB_AGE" -ge "$FLAG_TTL_DAYS" ]; then
      alert_skip "CLEAR-BACKLOG flag is ${CB_AGE}d old — still running 3 categories/night instead of 1. Delete output/CLEAR-BACKLOG to restore the normal cadence."
    fi
  else
    echo "=== 1 category tonight — building a video for every emailable lead in the scrape (send side stays capacity-throttled). ===" | tee -a "$LOG"
  fi
fi

# ONE category/night, ALL its videos (Chris 2026-07-21: "1 run per night — scrape a category, e.g. Plumbers
# in Culver City; if 30 of the 50 have emails, make ALL 30 videos, not less than the full list of emailable
# businesses"). Production is NOT throttled by send capacity — every emailable lead in the scrape gets a video.
# Bounds:
#   MAX_SEARCHES  — 1 (one scrape/category per night; set above). Build EVERY emailable lead's video in it.
#   MAX_RUN_HOURS — wall-clock cap; kept generous so a big category finishes ALL its videos (default 10h).
#   NIGHT-ONLY interlock (07:00) — the true stop; capture can't cross into the workday.
#   output/STOP-OVERNIGHT — touch this file to gracefully stop after the current search finishes.
# If a big category can't finish in one night, the reconciler re-renders the remainder next night so EVERY
# emailable lead ends up with a video — see feedback_every_email_gets_a_video.
MAX_SEARCHES="${MAX_SEARCHES:-1}"
MAX_RUN_HOURS="${MAX_RUN_HOURS:-10}"
# 2026-07-31 ROOT-CAUSE FIX (deep-rank "no card pullout / no blue lines", Chris caught batch-wide):
# WORKER_COUNT=2 ran two Chrome windows that COMPETE for macOS "frontmost" at grab time. The Maps
# card is frozen via a FULL-SCREEN `screencapture -x` + crop; deep-rank leads (>20) PAUSE live capture
# on the results frame and rely ENTIRELY on that injected grab for the card. When the two workers'
# timing phased badly, screencapture fired while the WRONG worker's window was front → the frozen frame
# showed the raw results list (no card, business not selected) — and once phased, it STAYED wrong for
# every subsequent lead ("broke partway, stayed broken"; hasDetail=true in the DOM but the pixels wrong).
# The recovery pass already uses WORKER_COUNT=1 precisely to avoid this screen-lock contention. Make the
# MAIN pass single-worker too: correctness > speed (a single-category night still finishes hours inside
# the capture window). See feedback_video_capture_screen_must_be_clear.md + feedback_worker_count_concurrency_limit.md.
WORKER_COUNT="${WORKER_COUNT:-1}"
# 2026-08-17 — the kill switch accepts EITHER path. A stale, empty STOP-OVERNIGHT sat in the repo ROOT
# from 2026-08-12 while every run since proceeded normally: only output/STOP-OVERNIGHT was ever read, so
# a flag dropped in the obvious place did nothing. A kill switch that silently fails to kill is worse
# than no kill switch, and the repo root is where anyone would put it.
STOP_FLAG="$SCRAPER_DIR/output/STOP-OVERNIGHT"
STOP_FLAG_ROOT="$SCRAPER_DIR/STOP-OVERNIGHT"

RUN_START=$(date +%s)
DEADLINE=$(( RUN_START + MAX_RUN_HOURS * 3600 ))
rm -f "$STOP_FLAG" 2>/dev/null   # clear any stale flag from a prior run

# Keep the machine awake only for the capped window (+30m buffer). Pipeline self-caffeinates too.
caffeinate -dimsu -t $(( MAX_RUN_HOURS * 3600 + 1800 )) &
CAFF_PID=$!
trap 'kill $CAFF_PID 2>/dev/null' EXIT

echo "=== overnight-local START $(date) — city-first, cap: ${MAX_SEARCHES} searches / ${MAX_RUN_HOURS}h, WC=${WORKER_COUNT} ===" | tee -a "$LOG"

# CONNECTIVITY WAIT (2026-07-27). launchd fires at 21:00 with NO network guard, but Chris's mobile
# data has been down at 21:00 before (out until ~21:40 on 07-23) — which would fail next-search +
# the very first Airtable/scrape call and lose the whole night. The Mac is already caffeinated above,
# so wait (up to NET_WAIT_MAX_MIN) for internet before ANY network work, re-checking the night window
# each iteration so a long outage never bleeds capture into the workday. This is the connectivity
# resilience the old external wrapper had, now built INTO the sole runner (per the 07-27 lesson: add
# it HERE, never unload-launchd + wrap). No-op when the internet is already up.
NET_WAIT_MAX_MIN="${NET_WAIT_MAX_MIN:-90}"
net_up() { local c; c=$(curl -s --max-time 8 -o /dev/null -w "%{http_code}" https://www.google.com/generate_204 2>/dev/null); [ "$c" = "204" ] || [ "$c" = "200" ]; }
if ! net_up; then
  echo ">>> no internet at start — waiting up to ${NET_WAIT_MAX_MIN}min for connectivity..." | tee -a "$LOG"
  _waited=0
  while ! net_up; do
    _nh=$(( 10#$(date +%H) ))
    if [ "$_nh" -ge 7 ] && [ "$_nh" -lt 21 ]; then
      echo ">>> internet still down and night window ended ($(date +%H:%M)) — skipping tonight." | tee -a "$LOG"
      alert_skip "no internet during the night window — tonight produced nothing (mobile data down?)."
      exit 0
    fi
    if [ "$_waited" -ge "$NET_WAIT_MAX_MIN" ]; then
      echo ">>> internet still down after ${NET_WAIT_MAX_MIN}min — skipping tonight." | tee -a "$LOG"
      alert_skip "no internet after ${NET_WAIT_MAX_MIN}min wait — tonight produced nothing (mobile data down?)."
      exit 0
    fi
    sleep 180; _waited=$(( _waited + 3 ))
  done
  echo ">>> internet up after ~${_waited}min — proceeding." | tee -a "$LOG"
fi

# Manually-flagged bad videos: ARM them (remove + block send + re-queue their search) and FINALIZE
# any that were re-rendered on a prior night. Chris ticks {Redo Video} in Airtable; this self-heals.
echo ">>> redo-flagged-videos: processing {Redo Video} flags" | tee -a "$LOG"
node scripts/redo-flagged-videos.mjs 2>&1 | tee -a "$LOG"

n=0
while [ "$n" -lt "$MAX_SEARCHES" ]; do
  # Wall-clock cap + graceful stop flag — checked BEFORE starting each new search.
  if [ "$(date +%s)" -ge "$DEADLINE" ]; then echo ">>> wall-clock cap (${MAX_RUN_HOURS}h) reached — stopping after $n search(es)." | tee -a "$LOG"; break; fi
  # NIGHT-ONLY (per-search): the startup interlock checks once; re-check before EACH new capture so a
  # long run that crosses into the workday (>=07:00) STOPS instead of filming the desktop. See feedback_video_capture_screen_must_be_clear.
  NH=$(( 10#$(date +%H) )); if [ "$NH" -ge 7 ] && [ "$NH" -lt 21 ]; then echo ">>> night window ended ($(date +%H:%M)) — stopping before the workday (after $n search(es)); no desktop-bleed risk." | tee -a "$LOG"; break; fi
  if [ -f "$STOP_FLAG" ] || [ -f "$STOP_FLAG_ROOT" ]; then echo ">>> STOP-OVERNIGHT flag found — graceful stop after $n search(es)." | tee -a "$LOG"; rm -f "$STOP_FLAG" "$STOP_FLAG_ROOT"; break; fi
  # next-search with RETRY (2026-07-27): a transient Airtable/network hiccup returns rc=2 and used
  # to kill the ENTIRE night (one API blip = zero videos, only a log line). Retry rc=2 up to 3x with
  # backoff. rc=3 (SoCal exhausted) is legitimate — break immediately, no retry. Final failure alerts.
  Q=""; RC=0
  for _try in 1 2 3; do
    Q=$(node scripts/next-search.mjs 2>>"$LOG"); RC=$?
    { [ "$RC" -eq 3 ]; } && break
    { [ "$RC" -eq 0 ] && [ -n "$Q" ]; } && break
    echo "!!! next-search transient failure (rc=$RC, try ${_try}/3) — retrying in $(( _try * 20 ))s" | tee -a "$LOG"
    sleep $(( _try * 20 ))
  done
  if [ "$RC" -eq 3 ]; then echo ">>> SoCal fully exhausted — nothing left to scrape. Done." | tee -a "$LOG"; break; fi
  if [ "$RC" -ne 0 ] || [ -z "$Q" ]; then
    echo "!!! next-search failed after 3 tries (rc=$RC) — stopping." | tee -a "$LOG"
    alert_skip "next-search failed 3x (rc=$RC — likely Airtable/network); tonight got no fresh scrape."
    break
  fi
  n=$((n+1))
  echo "" | tee -a "$LOG"
  echo ">>> [$n/${MAX_SEARCHES}] $(date +%H:%M) — scraping: \"$Q\"" | tee -a "$LOG"
  # Record the ATTEMPT before running, so a zero-yield search (no Lead rows written, e.g. an
  # all-art-studio "Painters" query) is never re-picked by next-search.mjs. Without this the
  # loop spins forever on such a search (cost 2026-07-01: 17 re-runs / ~13h on Painters).
  # See feedback_next_search_must_track_attempts.md.
  mkdir -p "$SCRAPER_DIR/output"
  echo "$Q" >> "$SCRAPER_DIR/output/attempted-searches.log"
  WORKER_COUNT="$WORKER_COUNT" ./scripts/overnight-pipeline.sh "$Q" 2>&1 | tee -a "$LOG"
  _prc=${PIPESTATUS[0]}
  if [ "$_prc" -ne 0 ]; then
    echo "!!! overnight-pipeline exited non-zero ($_prc) for \"$Q\" — some leads may have failed; the recovery pass + auto-audit below will surface any gaps." | tee -a "$LOG"
  fi
done
echo "=== overnight-local DONE $(date) — ran $n search(es) ===" | tee -a "$LOG"

# ============================================================
# RECOVERY PASS — GUARANTEE every emailed lead has a video (2026-07-11, Chris: "ALL emails we get MUST
# have a video"). The fast parallel loop above is pass 1. Now find any emailable lead that STILL has no
# Video URL and re-render it on a SLOWER pass: WORKER_COUNT=1 (no screen-lock contention between workers)
# + a longer per-lead timeout. Idempotency-skip means ONLY the missing leads render. Bounded by
# MAX_RECOVERY_SEARCHES, the wall-clock DEADLINE, and the night window. Leads that fail MAX_VIDEO_ATTEMPTS
# times are surfaced (Skip Reasons=video-unrenderable-Nx), never silently dropped or looped forever.
# See feedback_every_email_gets_a_video.md + feedback_landing_build_must_be_scoped.md.
# ============================================================
echo ">>> reconcile-missing-videos: finding emailable leads with no video" | tee -a "$LOG"
node scripts/reconcile-missing-videos.mjs 2>&1 | tee -a "$LOG"
MV_SEARCHES="$SCRAPER_DIR/output/missing-video-searches.txt"
MAX_RECOVERY_SEARCHES="${MAX_RECOVERY_SEARCHES:-3}"
if [ -s "$MV_SEARCHES" ]; then
  # 2026-07-29: FRESH Chrome before the recovery re-render. The main batch's failures are almost always
  # LATE-RUN Chrome state-drift/memory degradation (the 2026-07-28 run's 3 failures ALL choked on website-
  # capture as the last leads). Re-rendering with the same degraded profiles would just hit the same wall,
  # so wipe the step-3 profiles first → the retry gets a clean browser and transient stalls self-heal.
  # Safe: these are ephemeral scratch dirs, recreated on next Chrome launch. (protocol pitfall #7.)
  echo ">>> recovery: resetting step-3 Chrome profiles for a clean retry" | tee -a "$LOG"
  pkill -f "chrome-profile-step3" 2>/dev/null || true
  sleep 1
  rm -rf "$SCRAPER_DIR"/output/chrome-profile-step3* 2>/dev/null || true
  rc=0
  while IFS= read -r Q; do
    [ -z "$Q" ] && continue
    rc=$((rc+1))
    if [ "$rc" -gt "$MAX_RECOVERY_SEARCHES" ]; then echo ">>> recovery cap ($MAX_RECOVERY_SEARCHES) reached — remaining missing-video searches retried tomorrow." | tee -a "$LOG"; break; fi
    if [ "$(date +%s)" -ge "$DEADLINE" ]; then echo ">>> wall-clock cap reached — deferring remaining recovery to tomorrow." | tee -a "$LOG"; break; fi
    NH=$(( 10#$(date +%H) )); if [ "$NH" -ge 7 ] && [ "$NH" -lt 21 ]; then echo ">>> night window ended — deferring remaining recovery to tomorrow." | tee -a "$LOG"; break; fi
    echo "" | tee -a "$LOG"
    echo ">>> [recovery $rc] $(date +%H:%M) — slow single-worker re-render: \"$Q\"" | tee -a "$LOG"
    WORKER_COUNT=1 PER_LEAD_TIMEOUT_MIN="${RECOVERY_PER_LEAD_TIMEOUT_MIN:-15}" ./scripts/overnight-pipeline.sh "$Q" 2>&1 | tee -a "$LOG"
  done < "$MV_SEARCHES"
else
  echo ">>> no missing-video gap — every emailable lead has a video. ✓" | tee -a "$LOG"
fi

# ============================================================
# AUTO-AUDIT — verify NO failed videos, notify Chris if any (Chris 2026-07-11: "an auto audit to verify there
# are no failed videos and if there are ever to notify me and we fix the issue"). Runs AFTER the recovery pass
# so it audits the FINAL state. Alerts (macOS + persistent file) only on leads the system CAN'T self-heal
# (retries exhausted / no search term) — transient gaps that the next recovery pass will drain don't alarm.
# See feedback_failed_video_audit.md + feedback_every_email_gets_a_video.md.
# ============================================================
echo ">>> auto-audit: verifying no failed videos" | tee -a "$LOG"
node scripts/audit-failed-videos.mjs 2>&1 | tee -a "$LOG" || true

# File the night's deployed-video list into the dated reports/overnight-videos/YYYY/MM-Month/ tree.
# Pass the run's START date (DATE_STAMP) — a run that finishes after midnight must still file under
# the night it started (the log is named by start date).
echo ">>> filing overnight videos to dated report" | tee -a "$LOG"
DATE="$DATE_STAMP" node scripts/file-overnight-videos.mjs 2>&1 | tee -a "$LOG"

# OpenAI quota alert (HARD RULE): notify Chris if voiceover generation hit an OpenAI balance error.
bash scripts/notify-openai-quota.sh "/tmp/overnight-pipeline-$(date +%Y-%m-%d).log" 2>&1 | tee -a "$LOG"

# ============================================================
# ENQUEUE the in-chat report post (2026-08-10, Chris: "this report gets posted with link in the chat after
# each run … keeps getting skipped … fix it so it happens automatically as part of the pipeline"). The
# in-chat summary can only be POSTED by Claude on the next session (the launchd run has no chat), so we can't
# push it — but we can make it un-skippable: append this run's date to the Website-repo queue file. The
# UserPromptSubmit hook (scripts/prompt-submit-hook.sh in the Website repo) then re-injects the ready-to-paste
# summary on EVERY prompt until Claude posts it and clears the queue. See feedback_overnight_report_format.md.
# ============================================================
QUEUE="/Users/chris/RGA/Rocket Growth Agency Website VS Code/reports/.pending-chat-reports"
mkdir -p "$(dirname "$QUEUE")"
if ! grep -qxF "$DATE_STAMP" "$QUEUE" 2>/dev/null; then echo "$DATE_STAMP" >> "$QUEUE"; fi
echo ">>> enqueued $DATE_STAMP for the mandatory in-chat report post (hook re-injects until posted)" | tee -a "$LOG"
