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

# 1. Generate (respects daily post cap + cost ceiling internally)
node scripts/generate-blog-post.mjs --from-queue --publish 2>&1 | tee -a "$LOG"

# 2. Commit + push any new/changed blog content
cd "$WEBSITE_DIR"
if [ -n "$(git status --porcelain blog/ sitemap.xml 2>/dev/null)" ]; then
  echo ">>> new content — committing + pushing" | tee -a "$LOG"
  git add blog/ sitemap.xml
  git -c user.name=rocketgrowthagency -c user.email=hello@rocketgrowthagency.com \
    commit -q -m "blog: autonomous content engine — new local-SEO-by-vertical post(s) ${DATE_STAMP}" 2>&1 | tee -a "$LOG"
  if git push 2>&1 | tee -a "$LOG"; then
    echo ">>> pushed — Netlify will auto-deploy. Sitemap updated for Google rediscovery." | tee -a "$LOG"
  else
    echo "!!! push failed — content committed locally; will retry next run or push manually." | tee -a "$LOG"
  fi
else
  echo ">>> no new content this run (daily cap reached or queue exhausted)." | tee -a "$LOG"
fi
echo "=== blog-engine done $(date) ===" | tee -a "$LOG"
