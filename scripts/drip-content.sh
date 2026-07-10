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

# TWO INDEPENDENT TRACKS:
#  - INDUSTRY pages STOP at 50 (the content-release-queue). Finite by design.
#  - BLOG posts NEVER stop (perpetual blog-topics queue; append more topics to extend forever).
# For the first ~50 days both tracks pick the same vertical, so the day's industry page + blog post
# PAIR and interlink. After the 50 industries are done, only the blog continues (long-tail topics).
IND=$(node scripts/next-content.mjs 2>>"$LOG"); RC_IND=$?
BLOG=$(node scripts/next-blog-topic.mjs 2>>"$LOG"); RC_BLOG=$?
[ "$RC_IND" -eq 3 ] && echo ">>> industry queue complete (all 50 industry pages live). Industry track idle." | tee -a "$LOG"
[ "$RC_BLOG" -eq 3 ] && echo ">>> blog queue exhausted — append topics to config/blog-topics.json." | tee -a "$LOG"
if { [ "$RC_IND" -ne 0 ] || [ -z "$IND" ]; } && { [ "$RC_BLOG" -ne 0 ] || [ -z "$BLOG" ]; }; then
  echo ">>> nothing pending in either track. Done." | tee -a "$LOG"; exit 0
fi
echo ">>> today — industry: \"${IND:-(none)}\"  |  blog: \"${BLOG:-(none)}\"" | tee -a "$LOG"

# 2. INDUSTRY track (if pending): generate the industry page.
if [ "$RC_IND" -eq 0 ] && [ -n "$IND" ]; then
  node scripts/generate-industry-page.mjs "$IND" --publish 2>&1 | tee -a "$LOG"
fi
# 3. BLOG track (perpetual): generate the day's blog post.
if [ "$RC_BLOG" -eq 0 ] && [ -n "$BLOG" ]; then
  node scripts/generate-blog-post.mjs "$BLOG" --publish 2>&1 | tee -a "$LOG"
fi
# 3b. CATEGORY-TOPIC track: fills the Maps SEO / GBP / Website blog sections (not just By Industry).
#     Runs every OTHER day (even day-of-year) so total publishing cadence stays conservative
#     (scaled-content safety). Each post is a unique, editor-gated (>=7/10) general topic.
if [ $(( 10#$(date +%j) % 2 )) -eq 0 ]; then
  TOPIC_LINE=$(node scripts/next-category-topic.mjs 2>>"$LOG"); RC_TOPIC=$?
  if [ "$RC_TOPIC" -eq 0 ] && [ -n "$TOPIC_LINE" ]; then
    TOPIC_TITLE="${TOPIC_LINE%%$'\t'*}"; TOPIC_CAT="${TOPIC_LINE##*$'\t'}"
    echo ">>> category topic: \"$TOPIC_TITLE\" [$TOPIC_CAT]" | tee -a "$LOG"
    node scripts/generate-blog-post.mjs --topic="$TOPIC_TITLE" --category="$TOPIC_CAT" --publish 2>&1 | tee -a "$LOG"
  elif [ "$RC_TOPIC" -eq 3 ]; then
    echo ">>> category topic queue exhausted — append to config/blog-topics-categories.json." | tee -a "$LOG"
  fi
fi
# 4. If the industry page was built AND its matching blog now exists, re-run it --force so the
#    industry->blog cross-link resolves (bidirectional interlinking).
if [ "$RC_IND" -eq 0 ] && [ -n "$IND" ]; then
  node scripts/generate-industry-page.mjs "$IND" --publish --force 2>&1 | tee -a "$LOG"
fi

# OpenAI balance/quota alert (HARD RULE): notify Chris immediately if a generator failed on quota.
bash scripts/notify-openai-quota.sh "$LOG"

# 2.4 OG link-preview cards (added 2026-07-10): render the tailored Map-Pack card for any NEW industry
# page / blog post (--all skips pages that already have a card → no churn) and patch its og:image so
# shares show the branded card, not the plain icon. Headless Chrome, offscreen — safe any time.
# Non-fatal: a render hiccup must NEVER block the content deploy. See project_og_cards_locked.
node scripts/build-og-cards.mjs --all 2>&1 | tee -a "$LOG" || echo ">>> og-card build skipped (non-fatal)" | tee -a "$LOG"

# 2.5 HARD LOCK GUARD (locked 2026-07-07): if ANY Chris-approved page regressed (lost its design
# markers — e.g. a generator reverted it from a stale template), ABORT before deploy so the reverted
# page can never go live. This is the net that would have caught the 2026-07-07 hub revert.
node scripts/check-locked-pages.mjs 2>&1 | tee -a "$LOG"
GUARD_RC=${PIPESTATUS[0]}
if [ "$GUARD_RC" -ne 0 ]; then
  echo ">>> ❌ LOCKED-PAGE REGRESSION — DEPLOY ABORTED. A protected page reverted; live site left untouched. Fix the page + the generator that rebuilt it." | tee -a "$LOG"
  bash scripts/notify-openai-quota.sh "$LOG" 2>/dev/null || true
  exit 1
fi

# 3. Deploy (whole dir; Netlify uploads only changed files). NOT git push (>2GB pack limit).
cd "$WEBSITE_DIR"
if [ -n "$(git status --porcelain industries/ blog/ sitemap.xml 2>/dev/null)" ]; then
  git add industries/ blog/ sitemap.xml
  git -c user.name=rocketgrowthagency -c user.email=hello@rocketgrowthagency.com \
    commit -q -m "drip: inbound content ${DATE_STAMP} — industry: ${IND:-none} | blog: ${BLOG:-none}" 2>&1 | tee -a "$LOG"
  export NETLIFY_AUTH_TOKEN="${NETLIFY_AUTH_TOKEN:-$(grep -E '^NETLIFY_AUTH_TOKEN=' "$SCRAPER_DIR/.env" 2>/dev/null | head -1 | cut -d= -f2-)}"
  export NETLIFY_SITE_ID="${NETLIFY_SITE_ID:-$(grep -E '^NETLIFY_SITE_ID=' "$SCRAPER_DIR/.env" 2>/dev/null | head -1 | cut -d= -f2-)}"
  netlify deploy --prod --dir=. 2>&1 | grep -iE "Production URL|Deploy complete|error" | tee -a "$LOG"
  echo ">>> deployed — industry: ${IND:-none}, blog: ${BLOG:-none}. Sitemap updated for Google rediscovery." | tee -a "$LOG"
else
  echo ">>> no changes to deploy (already built?)." | tee -a "$LOG"
fi
echo "=== drip-content done $(date) ===" | tee -a "$LOG"
