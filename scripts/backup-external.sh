#!/bin/bash
# backup-external.sh — off-machine backup of RGA's CRUCIAL, non-regenerable data to external
# drive(s) (2026-07-02). Closes the "local-git-only" durability gap. PRIMARY target = Crucial
# X10 Pro; LaCie is a secondary/redundant copy. Backs up: the memory (crown jewel), all
# scripts/config/lib, Netlify functions, Apps Scripts, reports, .env. EXCLUDES the regenerable +
# huge stuff (node_modules, step output, the /v videos + their 2GB git history — those live on
# Netlify + re-render). Backs up to EVERY listed drive that's connected; skips gracefully if none.
# Safe to run daily. Keeps: a live MIRROR (latest) + dated memory SNAPSHOTS (90-day retain).
set -u
DRIVES=("/Volumes/X10 Pro" "/Volumes/LaCie - APFS (Mac)")   # primary first
SCR="/Users/chris/RGA/Rocket Growth Agency Scraper VS Code"
WEB="/Users/chris/RGA/Rocket Growth Agency Website VS Code"
AUTO="/Users/chris/.claude/projects/-Users-chris-RGA-Rocket-Growth-Agency-Website-VS-Code/memory"
DATE_STAMP=$(date +%Y-%m-%d)
export PATH="/opt/homebrew/bin:/usr/bin:/bin:$PATH"

any=0
for DRIVE in "${DRIVES[@]}"; do
  [ -d "$DRIVE" ] || { echo "[backup] not connected: $DRIVE — skipping."; continue; }
  any=1
  DEST="$DRIVE/RGA-Backups"
  mkdir -p "$DEST/mirror/scraper" "$DEST/mirror/website" "$DEST/mirror/auto-memory" "$DEST/snapshots"
  echo "[backup] $(date) → $DEST"
  # 1) MIRROR (incremental, latest). Scraper keeps .git; drop node_modules + regenerable output.
  rsync -a --delete --exclude 'node_modules' --exclude 'output' --exclude '.DS_Store' \
    "$SCR/" "$DEST/mirror/scraper/"
  # Website: drop node_modules, the /v videos + .git (2GB+ video history) — keep everything else.
  rsync -a --delete --exclude 'node_modules' --exclude 'v/' --exclude '.git' --exclude '.DS_Store' \
    "$WEB/" "$DEST/mirror/website/"
  rsync -a --delete "$AUTO/" "$DEST/mirror/auto-memory/"
  # 2) DATED SNAPSHOT of memory (crown jewel), 90-day retention.
  tar -czf "$DEST/snapshots/memory_${DATE_STAMP}.tar.gz" -C "$AUTO/.." "$(basename "$AUTO")" 2>/dev/null \
    && echo "[backup] memory snapshot → snapshots/memory_${DATE_STAMP}.tar.gz"
  find "$DEST/snapshots" -name 'memory_*.tar.gz' -mtime +90 -delete 2>/dev/null
  echo "[backup] DONE $DRIVE — mirror $(du -sh "$DEST/mirror" 2>/dev/null | cut -f1)"
done
[ "$any" = "0" ] && echo "[backup] no external drive connected — nothing backed up."
exit 0
