# scripts/lib/find-claude.sh — sourced by every Mac-scheduled job that runs the `claude` CLI (weekly-audit.sh, nightly-full-check.sh).
# 🔴 11-10: the Sunday weekly audit failed "claude not found" from Nov 8 (reminder 3) because Claude Code moved to ~/.npm-global/bin
# (Oct 12) and the job's launchd PATH only listed ~/.local/bin. A schedule's PATH is frozen when the plist is written; the install
# location is not. So every job finds claude itself, from every place it is installed, instead of trusting the PATH it was given.
# Gate: Scraper scripts/check-scheduled-jobs-find-claude.mjs
for _d in "$HOME/.npm-global/bin" "$HOME/.local/bin" "$HOME/.claude/local" /opt/homebrew/bin /usr/local/bin; do
  if [ -x "$_d/claude" ]; then case ":$PATH:" in *":$_d:"*) ;; *) PATH="$_d:$PATH" ;; esac; fi
done
export PATH
unset _d
