#!/bin/bash
# drip-content.sh — RGA inbound-content DRIP (locked 2026-06-30, see project_inbound_seo_strategy).
#
# Releases exactly ONE industry+blog pair per run (per day via launchd), in the order of
# config/content-release-queue.json, skipping any already built. ONE pair/day is deliberate:
# bulk-publishing dozens of template pages trips Google's scaled-content-abuse policy. The pair
# is generated fresh (unique prompt) and bidirectionally interlinked (industry<->blog), then
# deployed. When the queue is exhausted it exits cleanly (no-op).
#
# Scheduled by ~/Library/LaunchAgents/com.rga.blog-engine.plist (daily). Pure API + file work,
# no screen capture — safe to run anytime.

set -u
SCRAPER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEBSITE_DIR="$(cd "$(dirname "$SCRAPER_DIR")" && pwd)/Rocket Growth Agency Website VS Code"
DATE_STAMP=$(date +%Y-%m-%d)
LOG="/tmp/rga-drip-content-${DATE_STAMP}.log"
echo "=== drip-content $(date) ===" | tee -a "$LOG"
cd "$SCRAPER_DIR"

# 1. Pick the next industry to release (exit 3 = queue complete).
NEXT=$(node scripts/next-content.mjs 2>>"$LOG")
RC=$?
if [ "$RC" -eq 3 ]; then echo ">>> release queue complete — all industries published. Nothing to do." | tee -a "$LOG"; exit 0; fi
if [ "$RC" -ne 0 ] || [ -z "$NEXT" ]; then echo "!!! next-content.mjs failed (rc=$RC) — aborting." | tee -a "$LOG"; exit 1; fi
echo ">>> releasing today: \"$NEXT\"" | tee -a "$LOG"

# 2. Generate the interlinked pair (industry page first so the blog can link to it, then blog so
#    the industry page's next run / hub picks it up; both --publish wire sitemap + hub/index).
node scripts/generate-industry-page.mjs "$NEXT" --publish 2>&1 | tee -a "$LOG"
node scripts/generate-blog-post.mjs "$NEXT" --publish 2>&1 | tee -a "$LOG"
# Re-run the industry page once more so its blog cross-link resolves now that the blog exists.
node scripts/generate-industry-page.mjs "$NEXT" --publish --force 2>&1 | tee -a "$LOG"

# 3. Deploy (whole dir; Netlify uploads only changed files). NOT git push (>2GB pack limit).
cd "$WEBSITE_DIR"
if [ -n "$(git status --porcelain industries/ blog/ sitemap.xml 2>/dev/null)" ]; then
  git add industries/ blog/ sitemap.xml
  git -c user.name=rocketgrowthagency -c user.email=hello@rocketgrowthagency.com \
    commit -q -m "drip: inbound content — ${NEXT} (industry + blog pair) ${DATE_STAMP}" 2>&1 | tee -a "$LOG"
  export NETLIFY_AUTH_TOKEN="${NETLIFY_AUTH_TOKEN:-$(grep -E '^NETLIFY_AUTH_TOKEN=' "$SCRAPER_DIR/.env" 2>/dev/null | head -1 | cut -d= -f2-)}"
  export NETLIFY_SITE_ID="${NETLIFY_SITE_ID:-$(grep -E '^NETLIFY_SITE_ID=' "$SCRAPER_DIR/.env" 2>/dev/null | head -1 | cut -d= -f2-)}"
  netlify deploy --prod --dir=. 2>&1 | grep -iE "Production URL|Deploy complete|error" | tee -a "$LOG"
  echo ">>> deployed: ${NEXT}. Sitemap updated for Google rediscovery." | tee -a "$LOG"
else
  echo ">>> no changes to deploy (already built?)." | tee -a "$LOG"
fi
echo "=== drip-content done $(date) ===" | tee -a "$LOG"
