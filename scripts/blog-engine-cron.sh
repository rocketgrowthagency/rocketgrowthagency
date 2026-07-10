#!/bin/bash
# blog-engine-cron.sh — autonomous daily inbound-content run (WS2, 2026-06-29).
#
# 1. Generate up to BLOG_MAX_PER_DAY (default 1) vertical posts from the queue,
#    gated by the deterministic quality guard + the LLM editor gate (>=7/10),
#    capped by BLOG_DAILY_COST_CEILING.
# 2. If new content landed, commit it (RGA identity, scoped to blog/ + sitemap)
#    and push — Netlify auto-builds and deploys. Google rediscovers via sitemap.
#
# Scheduled by ~/Library/LaunchAgents/com.rga.blog-engine.plist (daily).
# Safe to run anytime — pure API + file work, NO screen capture (unlike video).

set -u
SCRAPER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEBSITE_DIR="$(cd "$(dirname "$SCRAPER_DIR")" && pwd)/Rocket Growth Agency Website VS Code"
DATE_STAMP=$(date +%Y-%m-%d)
LOG="/tmp/rga-blog-engine-${DATE_STAMP}.log"

echo "=== blog-engine $(date) ===" | tee -a "$LOG"
cd "$SCRAPER_DIR"

# Cadence gate (2026-07-10): publish 3x/week (Mon/Wed/Fri), not daily — quality over volume now that the
# core verticals are covered. The launchd job still fires daily 9am; this just no-ops on off-days.
# Override for a manual run any day: BLOG_FORCE=1 bash scripts/blog-engine-cron.sh
if [ "${BLOG_FORCE:-0}" != "1" ]; then
  case "$(date +%u)" in
    1|3|5) : ;;                                                                 # Mon / Wed / Fri -> run
    *) echo "[blog-engine] $(date '+%A') is off-cadence (Mon/Wed/Fri only) - skipping." | tee -a "$LOG"; exit 0 ;;
  esac
fi

# 1. Generate the day's content — blog post (informational) + industry page
# (commercial), each pulling the next-highest-value uncovered vertical from the
# queue. They cross-link automatically (hub-and-spoke). Both respect their own
# daily cap + the shared cost ceiling.
node scripts/generate-blog-post.mjs --from-queue --publish 2>&1 | tee -a "$LOG"
node scripts/generate-industry-page.mjs --from-queue --publish 2>&1 | tee -a "$LOG"

# 1.5 HARD LOCK GUARD (locked 2026-07-07): abort before deploy if any approved page regressed.
node scripts/check-locked-pages.mjs 2>&1 | tee -a "$LOG"
if [ "${PIPESTATUS[0]}" -ne 0 ]; then
  echo "!!! LOCKED-PAGE REGRESSION — deploy ABORTED; live site left untouched." | tee -a "$LOG"; exit 1
fi

# 2. Deploy any new/changed blog + industry content.
# NOTE: this site deploys via `netlify deploy --prod` (direct CLI), NOT GitHub
# auto-build. GitHub is a backup mirror and is currently blocked by a >2GB pack
# limit (the /v/ video history) — so we deploy to Netlify directly and commit
# LOCALLY for versioning (no push). Netlify only uploads changed files (the new
# blog HTML + sitemap), so this is fast despite publish=".".
cd "$WEBSITE_DIR"
if [ -n "$(git status --porcelain blog/ industries/ sitemap.xml 2>/dev/null)" ]; then
  echo ">>> new content — committing locally + deploying to Netlify" | tee -a "$LOG"
  git add blog/ industries/ sitemap.xml
  git -c user.name=rocketgrowthagency -c user.email=hello@rocketgrowthagency.com \
    commit -q -m "blog: autonomous content engine — new local-SEO-by-vertical post(s) ${DATE_STAMP}" 2>&1 | tee -a "$LOG"
  export NETLIFY_AUTH_TOKEN="${NETLIFY_AUTH_TOKEN:-$(grep -E '^NETLIFY_AUTH_TOKEN=' "$SCRAPER_DIR/.env" 2>/dev/null | head -1 | cut -d= -f2-)}"
  export NETLIFY_SITE_ID="${NETLIFY_SITE_ID:-$(grep -E '^NETLIFY_SITE_ID=' "$SCRAPER_DIR/.env" 2>/dev/null | head -1 | cut -d= -f2-)}"
  if netlify deploy --prod --dir=. 2>&1 | grep -iE "Production|deploy|error|complete" | tee -a "$LOG"; then
    echo ">>> deployed to Netlify prod. Sitemap updated for Google rediscovery." | tee -a "$LOG"
  else
    echo "!!! netlify deploy failed — content committed locally; investigate." | tee -a "$LOG"
  fi
else
  echo ">>> no new content this run (daily cap reached or queue exhausted)." | tee -a "$LOG"
fi
echo "=== blog-engine done $(date) ===" | tee -a "$LOG"
