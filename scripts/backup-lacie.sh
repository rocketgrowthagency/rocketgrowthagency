#!/bin/bash
# backup-lacie.sh — a daily copy of RGA's chats, memory and both repos (Chris 10-31:
# "make sure we have all backups saved ... chat histories on Mac and LaCie").
#
# Time Machine (the X10 Pro) stays the versioned backup. This is the second copy, and it runs
# whether or not the X10 Pro is plugged in; on 10-31 the X10 had been away for 12 days.
#
# 🔴 ADD-ONLY. No --delete anywhere: Claude Code removes old chats from ~/.claude/projects, and a
# mirror would then remove them from the backup too.
# 🔴 NO SECRETS. .env files stay out; scripts/backup-secrets.sh makes the encrypted copy.
#
#   bash scripts/backup-lacie.sh           everything
#   bash scripts/backup-lacie.sh --chats   chats and memory only
#
# BACKUP_LACIE and BACKUP_MAC point it at copies, so it can be tested without touching the drive.
set -u
export PATH="/opt/homebrew/bin:/usr/bin:/bin:$PATH"

LACIE="${BACKUP_LACIE:-/Volumes/LaCie - APFS (Mac)}"
MAC_CHATS="${BACKUP_MAC:-$HOME/Claude-chat-histories}"
CHATS_SRC="${BACKUP_CHATS_SRC:-$HOME/.claude/projects}"
WEBSITE="${BACKUP_WEBSITE:-/Users/chris/RGA/Rocket Growth Agency Website VS Code}"
SCRAPER="${BACKUP_SCRAPER:-/Users/chris/RGA/Rocket Growth Agency Scraper VS Code}"
STATUS="${BACKUP_STATUS:-$HOME/.claude/backup-lacie-status.json}"
STAMP=$(date +%Y-%m-%d)
ONLY_CHATS=0; [ "${1:-}" = "--chats" ] && ONLY_CHATS=1

problems=()
note() { echo "[backup] $*"; }
problem() { echo "[backup] 🔴 $*"; problems+=("$*"); }

write_status() {
  local ok=true; [ "${#problems[@]}" -gt 0 ] && ok=false
  local joined=""; [ "${#problems[@]}" -gt 0 ] && joined=$(printf '%s; ' "${problems[@]}" | sed 's/"/'"'"'/g')
  printf '{"at":"%s","ok":%s,"chats_only":%s,"problems":"%s"}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$ok" "$([ $ONLY_CHATS = 1 ] && echo true || echo false)" "$joined" > "$STATUS"
}

tell_chris() {
  osascript -e "display notification \"$1\" with title \"RGA backup failed\"" >/dev/null 2>&1 || true
}

# A copied chat must exist on the far side at at least the size it had when we started: chats only
# grow, and one still being written may be ahead of what we copied.
check_copy() {
  local src="$1" dest="$2" name="$3" missing
  missing=$(cd "$src" && find . -name '*.jsonl' -type f -print0 | while IFS= read -r -d '' f; do
    [ -f "$dest/$f" ] || echo "$f"
  done | wc -l | tr -d ' ')
  [ "$missing" = "0" ] || problem "$name is missing $missing chat file(s)"
}

copy_chats() {
  local dest="$1" name="$2"
  mkdir -p "$dest" || { problem "can't write to $name"; return; }
  rsync -a --exclude '.DS_Store' "$CHATS_SRC/" "$dest/" || problem "copying chats to $name failed"
  [ -f "$HOME/.claude/history.jsonl" ] && [ -z "${BACKUP_CHATS_SRC:-}" ] && cp -p "$HOME/.claude/history.jsonl" "$dest/history.jsonl"
  check_copy "$CHATS_SRC" "$dest" "$name"
}

copy_repo() {
  local src="$1" name="$2" dest="$LACIE/RGA-Backups/live/$2"
  [ -d "$src/.git" ] || { problem "$name: no repo at $src"; return; }
  mkdir -p "$dest" "$LACIE/RGA-Backups/git-bundles" || { problem "can't write the $name backup"; return; }
  # Git history as one file. Every commit, including the ones not on GitHub.
  local bundle="$LACIE/RGA-Backups/git-bundles/$name-$STAMP.bundle"
  if git -C "$src" bundle create "$bundle.tmp" --all >/dev/null 2>&1 \
     && git -C "$src" bundle verify "$bundle.tmp" >/dev/null 2>&1; then
    mv "$bundle.tmp" "$bundle"
    find "$LACIE/RGA-Backups/git-bundles" -name "$name-*.bundle" -mtime +30 -delete 2>/dev/null
    note "$name history: $(basename "$bundle")"
  else
    rm -f "$bundle.tmp"; problem "$name: the git bundle didn't verify"
  fi
  # The files as they are now, including uncommitted work. .git is the bundle's job.
  rsync -a --exclude '.DS_Store' --exclude 'node_modules' --exclude '.git' --exclude '.env*' \
    --exclude '*.pem' --exclude 'id_rsa*' --exclude 'id_ed25519*' "$src/" "$dest/" \
    || problem "$name: copying the files failed"
}

note "$(date) start"
if [ ! -d "$LACIE" ]; then
  problem "LaCie isn't connected: chats copied to the Mac only, nothing else backed up"
else
  copy_chats "$LACIE/Claude chat histories" "LaCie"
fi
copy_chats "$MAC_CHATS" "the Mac copy"

if [ -d "$LACIE" ] && [ $ONLY_CHATS = 0 ]; then
  copy_repo "$WEBSITE" website
  copy_repo "$SCRAPER" scraper
fi

write_status
if [ "${#problems[@]}" -gt 0 ]; then
  tell_chris "${problems[0]}"
  note "finished with ${#problems[@]} problem(s)"
  exit 1
fi
note "✅ done $(date)"
exit 0
