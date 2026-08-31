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
# 🔴 2026-08-17 — DETECT A SILENT TOTAL FAILURE.
# generate-industry-page.mjs exits 0 even when it produces ZERO pages (all retries rejected by the
# quality guard). The drip then carried on and committed "industry: <name>" as though it had worked.
# A stale guard broke industry generation for 14 CONSECUTIVE DAYS and nothing surfaced it: the same
# industry was re-picked and re-reported every night, because next-content.mjs picks the first vertical
# whose page does not exist. Now we check the filesystem for the page the generator claimed to build.
if [ "$RC_IND" -eq 0 ] && [ -n "$IND" ]; then
  node scripts/generate-industry-page.mjs "$IND" --publish 2>&1 | tee -a "$LOG"
  # NOTE: BSD sed (macOS) has no \+ — use -E. Getting this wrong makes the check below fire on every
  # run. Mirrors slugify() in scripts/next-content.mjs.
  IND_SLUG=$(printf '%s' "$IND" | tr '[:upper:]' '[:lower:]' | sed -E 's/&/ and /g; s/[^a-z0-9]+/-/g; s/^-+//; s/-+$//')
  if [ ! -f "$WEBSITE_DIR/industries/$IND_SLUG/index.html" ]; then
    echo ">>> ❌ INDUSTRY TRACK PRODUCED NOTHING for \"$IND\" (expected industries/$IND_SLUG/). The generator exited 0 with 0 pages — check the quality guard against the CURRENT template classes." | tee -a "$LOG"
    bash scripts/notify-openai-quota.sh "$LOG" 2>/dev/null || true
  fi
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

# 2.55 GEO pages (2026-07-11): generate a "Local SEO for <vertical> in <city>" page for any NEW vertical
# benchmark (--all skips combos that already have a page), then rebuild the /local-seo/ hub. Each page carries
# real per-city competitive data (anti-doorway). Self-growing: every new city+vertical we scrape → a new SEO
# page. Non-fatal. See project_programmatic_seo.md.
node scripts/generate-geo-vertical-page.mjs --all 2>&1 | tee -a "$LOG" || echo ">>> geo pages skipped (non-fatal)" | tee -a "$LOG"
node scripts/generate-geo-vertical-page.mjs --hub 2>&1 | tee -a "$LOG" || true
node scripts/generate-data-report.mjs 2>&1 | tee -a "$LOG" || true

# 2.6 SITEMAP regen (2026-07-11): rebuild sitemap.xml from disk so every new blog post / industry page is
# discoverable by Google/Bing (the old sitemap was hand-maintained + went stale). Runs from the WEBSITE repo.
# Non-fatal — a sitemap hiccup must NEVER block the content deploy. See project_sitemap_seo.md.
node "$WEBSITE_DIR/scripts/build-sitemap.mjs" 2>&1 | tee -a "$LOG" || echo ">>> sitemap build skipped (non-fatal)" | tee -a "$LOG"

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

# 2.6 SHARED-CHROME GUARD (added 2026-08-31): the locked-page guard above only protects PINNED
# pages — it cannot see a NEW page the generator just created. Three consecutive drip nights
# (08-29/30/31) shipped industry + blog pages with a BLUE promo bar and no Demo nav link, because
# the generators still carried the pre-08-28 chrome and nothing here checked their output.
#
# The gate existed and passed on demand; it simply was not wired into the path that publishes.
# A guard that does not run where the damage happens is not a guard.
node scripts/check-header-consistency.mjs 2>&1 | tee -a "$LOG"
  CHROME_RC0=${PIPESTATUS[0]}
  node scripts/check-shared-components-not-forked.mjs 2>&1 | tee -a "$LOG"
  node scripts/check-offer-prices-consistent.mjs 2>&1 | tee -a "$LOG"
  PRICE_RC=${PIPESTATUS[0]}
  if [ "$PRICE_RC" -ne 0 ]; then
    echo ">>> ❌ UNEXPLAINED PRICE ON A LIVE PAGE — DEPLOY ABORTED. See data/offer-pricing.json." | tee -a "$LOG"
    exit 1
  fi
  FORK_RC=${PIPESTATUS[0]}
  if [ "$FORK_RC" -ne 0 ]; then
    echo ">>> ❌ SHARED COMPONENT FORKED — DEPLOY ABORTED. A generated page redefines a component that lives in style.css." | tee -a "$LOG"
    exit 1
  fi
CHROME_RC=${PIPESTATUS[0]}
if [ "$CHROME_RC" -ne 0 ]; then
  echo ">>> ❌ SHARED-CHROME REGRESSION — DEPLOY ABORTED. A generated page redefines .promo-bar or is missing a nav link. Fix the GENERATOR, not just the page." | tee -a "$LOG"
  bash scripts/notify-openai-quota.sh "$LOG" 2>/dev/null || true
  exit 1
fi

# Escaped head markup must never render as visible page text.
node scripts/check-no-markup-in-text.mjs 2>&1 | tee -a "$LOG"
MARKUP_RC=${PIPESTATUS[0]}
if [ "$MARKUP_RC" -ne 0 ]; then
  echo ">>> ❌ MARKUP LEAKING INTO PAGE TEXT — DEPLOY ABORTED." | tee -a "$LOG"
  exit 1
fi

# 3. Deploy (whole dir; Netlify uploads only changed files). NOT git push (>2GB pack limit).
cd "$WEBSITE_DIR"
# 🔴 2026-08-28 — images/assets/og/ ADDED. The engine writes an OG card for every page it generates
# but this list never staged it, so the HTML shipped and the image did not: the page went live
# referencing an image that was never deployed, and Netlify served the 404 fallback for it.
#
# Silent by construction — the page looks perfect; only a link preview on LinkedIn/Slack/iMessage is
# broken, and nobody opens their own posts that way. Found by curling the referenced images and
# checking the CONTENT-TYPE: a 200 with `text/html` on a .jpg is the fallback page, not an image
# ([[feedback-curl-status-is-useless-check-content-type]]). 4 of 119 were broken this way.
#
# Recurs on EVERY drip run, so this is the fix that matters more than backfilling the 4.
if [ -n "$(git status --porcelain industries/ blog/ local-seo/ state-of-local-seo/ sitemap.xml images/assets/og/ 2>/dev/null)" ]; then
  git add industries/ blog/ local-seo/ state-of-local-seo/ sitemap.xml images/assets/og/
  git -c user.name=rocketgrowthagency -c user.email=hello@rocketgrowthagency.com \
    commit -q -m "drip: inbound content ${DATE_STAMP} — industry: ${IND:-none} | blog: ${BLOG:-none}" 2>&1 | tee -a "$LOG"
  export NETLIFY_AUTH_TOKEN="${NETLIFY_AUTH_TOKEN:-$(grep -E '^NETLIFY_AUTH_TOKEN=' "$SCRAPER_DIR/.env" 2>/dev/null | head -1 | cut -d= -f2-)}"
  export NETLIFY_SITE_ID="${NETLIFY_SITE_ID:-$(grep -E '^NETLIFY_SITE_ID=' "$SCRAPER_DIR/.env" 2>/dev/null | head -1 | cut -d= -f2-)}"
  netlify deploy --prod --dir=. 2>&1 | grep -iE "Production URL|Deploy complete|error" | tee -a "$LOG"
  # IndexNow ping AFTER deploy (needs the fresh sitemap + /{key}.txt live) → Bing/Yandex crawl new posts fast.
  node "$WEBSITE_DIR/scripts/indexnow-ping.mjs" 2>&1 | tee -a "$LOG" || true
  echo ">>> deployed — industry: ${IND:-none}, blog: ${BLOG:-none}. Sitemap regenerated + IndexNow pinged." | tee -a "$LOG"
else
  echo ">>> no changes to deploy (already built?)." | tee -a "$LOG"
fi
echo "=== drip-content done $(date) ===" | tee -a "$LOG"
