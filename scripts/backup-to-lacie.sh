#!/bin/bash
# backup-to-lacie.sh — off-machine backup of RGA's CRUCIAL, non-regenerable data to the LaCie
# external drive (2026-07-02). Closes the "local-git-only" durability gap. Backs up: the memory
# (crown jewel), all scripts/config/lib, Netlify functions, Apps Scripts, reports, and .env.
# EXCLUDES the regenerable + huge stuff (node_modules, step-output intermediates, the /v videos +
# their git history — those live on Netlify and can be re-rendered). Skips gracefully if the drive
# isn't connected. Safe to run daily. Keeps: a live MIRROR (latest) + dated memory SNAPSHOTS.
set -u
DRIVE="/Volumes/LaCie - APFS (Mac)"
SCR="/Users/chris/RGA/Rocket Growth Agency Scraper VS Code"
WEB="/Users/chris/RGA/Rocket Growth Agency Website VS Code"
AUTO="/Users/chris/.claude/projects/-Users-chris-RGA-Rocket-Growth-Agency-Website-VS-Code/memory"
DEST="$DRIVE/RGA-Backups"
DATE_STAMP=$(date +%Y-%m-%d)
export PATH="/opt/homebrew/bin:/usr/bin:/bin:$PATH"

if [ ! -d "$DRIVE" ]; then echo "[backup] LaCie not connected ($DRIVE) — skipping."; exit 0; fi
mkdir -p "$DEST/mirror/scraper" "$DEST/mirror/website" "$DEST/mirror/auto-memory" "$DEST/snapshots"

echo "[backup] $(date) → $DEST"

# 1) MIRROR (incremental, latest state)
#    Scraper: keep .git (small history); drop node_modules + regenerable step output.
rsync -a --delete --exclude 'node_modules' --exclude 'output' --exclude '.DS_Store' \
  "$SCR/" "$DEST/mirror/scraper/"
#    Website: drop node_modules, the /v videos + .git (2GB+ video history) — keep everything else
#    (the .claude/memory mirror, netlify functions, apps-scripts, reports, site source).
rsync -a --delete --exclude 'node_modules' --exclude 'v/' --exclude '.git' --exclude '.DS_Store' \
  "$WEB/" "$DEST/mirror/website/"
#    The auto-memory directory (source of truth for memory).
rsync -a --delete "$AUTO/" "$DEST/mirror/auto-memory/"

# 2) DATED SNAPSHOT of the memory (crown jewel — tiny, keep point-in-time history).
tar -czf "$DEST/snapshots/memory_${DATE_STAMP}.tar.gz" -C "$AUTO/.." "$(basename "$AUTO")" 2>/dev/null \
  && echo "[backup] memory snapshot → snapshots/memory_${DATE_STAMP}.tar.gz"
# prune snapshots older than 90 days
find "$DEST/snapshots" -name 'memory_*.tar.gz' -mtime +90 -delete 2>/dev/null

BYTES=$(du -sh "$DEST/mirror" 2>/dev/null | cut -f1)
echo "[backup] DONE — mirror size ${BYTES}. Off-machine copy on LaCie is current."
