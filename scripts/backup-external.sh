#!/bin/bash
# backup-external.sh — off-machine backup of RGA's CRUCIAL, non-regenerable data to the Crucial
# X10 Pro external drive (2026-07-02; LaCie phased out 2026-07-02). Closes the "local-git-only"
# durability gap. Backs up: the memory (crown jewel), all scripts/config/lib, Netlify functions,
# Apps Scripts, reports, .env. EXCLUDES the regenerable + huge stuff (node_modules, step output,
# the /v videos + their 2GB git history — those live on Netlify + re-render). Keeps: a live MIRROR
# (latest) + dated memory SNAPSHOTS (90-day retain). Safe to run daily.
#
# LOUD on failure: since the X10 Pro is now the ONLY target, a not-connected / not-writable drive
# means NO off-machine backup happened — we surface that clearly rather than exit silently.
set -u
DRIVES=("/Volumes/X10 Pro")   # Crucial X10 Pro — sole backup target (LaCie retired)
SCR="/Users/chris/RGA/Rocket Growth Agency Scraper VS Code"
WEB="/Users/chris/RGA/Rocket Growth Agency Website VS Code"
AUTO="/Users/chris/.claude/projects/-Users-chris-RGA-Rocket-Growth-Agency-Website-VS-Code/memory"
DATE_STAMP=$(date +%Y-%m-%d)
export PATH="/opt/homebrew/bin:/usr/bin:/bin:$PATH"

backed_up=0
for DRIVE in "${DRIVES[@]}"; do
  if [ ! -d "$DRIVE" ]; then echo "[backup] ⚠ NOT CONNECTED: $DRIVE — no backup written. Plug it in."; continue; fi
  # Writability check (the X10 Pro's root can be owned root:wheel with Owners-Enabled → EPERM).
  if ! ( touch "$DRIVE/.rga-wtest" 2>/dev/null && rm -f "$DRIVE/.rga-wtest" 2>/dev/null ); then
    echo "[backup] ⚠ CONNECTED BUT NOT WRITABLE: $DRIVE — NO BACKUP WRITTEN."
    echo "         Fix once: Finder → Get Info on the drive → 'Ignore ownership on this volume'"
    echo "         (or: sudo diskutil disableOwnership \"$DRIVE\"). Then re-run this."
    continue
  fi
  DEST="$DRIVE/RGA-Backups"
  mkdir -p "$DEST/mirror/scraper" "$DEST/mirror/website" "$DEST/mirror/auto-memory" "$DEST/snapshots"
  echo "[backup] $(date) → $DEST"
  rsync -a --delete --exclude 'node_modules' --exclude 'output' --exclude '.DS_Store' \
    "$SCR/" "$DEST/mirror/scraper/"
  rsync -a --delete --exclude 'node_modules' --exclude 'v/' --exclude '.git' --exclude '.DS_Store' \
    "$WEB/" "$DEST/mirror/website/"
  rsync -a --delete "$AUTO/" "$DEST/mirror/auto-memory/"
  tar -czf "$DEST/snapshots/memory_${DATE_STAMP}.tar.gz" -C "$AUTO/.." "$(basename "$AUTO")" 2>/dev/null \
    && echo "[backup] memory snapshot → snapshots/memory_${DATE_STAMP}.tar.gz"
  find "$DEST/snapshots" -name 'memory_*.tar.gz' -mtime +90 -delete 2>/dev/null
  echo "[backup] ✅ DONE $DRIVE — mirror $(du -sh "$DEST/mirror" 2>/dev/null | cut -f1)"
  backed_up=1
done
if [ "$backed_up" = "0" ]; then echo "[backup] ‼ NO OFF-MACHINE BACKUP WRITTEN — connect + fix the X10 Pro."; exit 1; fi
exit 0
