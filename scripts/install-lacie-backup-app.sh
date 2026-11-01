#!/bin/bash
# install-lacie-backup-app.sh — lets the 7 AM LaCie backup write to the drive. Run this yourself, once:
#   bash "scripts/install-lacie-backup-app.sh"
#
# WHY: the first scheduled run on 11-1 failed with "Operation not permitted" on every copy. macOS won't let a job started as plain
# /bin/bash write to a removable drive. Runs from a chat worked because that app already has the permission. The other LaCie backups on
# this Mac run through a small signed app, which macOS can be given the permission for, so this does the same for RGA.
#
# WHAT IT DOES: builds ~/Applications/RGA LaCie Backup.app, which only runs scripts/backup-lacie.sh. Keeps a copy of the current job
# file. Points com.rga.lacie-backup at the app, same schedule. Starts one backup now. macOS then asks once to allow the drive: press Allow.
# It removes nothing. To undo: restore the .before copy this prints, and reload the job.
set -euo pipefail

APP="$HOME/Applications/RGA LaCie Backup.app"
SCR="$(cd "$(dirname "$0")" && pwd)/backup-lacie.sh"
PL="$HOME/Library/LaunchAgents/com.rga.lacie-backup.plist"
[ -f "$SCR" ] || { echo "Can't find $SCR"; exit 1; }
[ -f "$PL" ] || { echo "Can't find $PL"; exit 1; }

BEFORE="$PL.before-app-$(date +%Y%m%d)"
cp "$PL" "$BEFORE"
echo "Kept a copy of the job file: $BEFORE"

mkdir -p "$HOME/Applications"
osacompile -o "$APP" -e "do shell script \"export PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin; /bin/bash '$SCR' >> /tmp/rga-lacie-backup.out.log 2>> /tmp/rga-lacie-backup.err.log\""
/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier com.rocketgrowthagency.lacie-backup" "$APP/Contents/Info.plist" 2>/dev/null \
  || /usr/libexec/PlistBuddy -c "Add :CFBundleIdentifier string com.rocketgrowthagency.lacie-backup" "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Add :LSUIElement bool true" "$APP/Contents/Info.plist" 2>/dev/null || true
codesign --force --deep -s - "$APP"
echo "Built $APP"

python3 -I - "$PL" "$APP" <<'EOF'
import sys, plistlib
p, app = sys.argv[1], sys.argv[2]
d = plistlib.load(open(p, "rb"))
d["ProgramArguments"] = ["/usr/bin/open", "-W", "-g", app]
plistlib.dump(d, open(p, "wb"))
print("The job now runs:", " ".join(d["ProgramArguments"]))
EOF

U="$(id -u)"
launchctl bootout "gui/$U/com.rga.lacie-backup" 2>/dev/null || true
launchctl bootstrap "gui/$U" "$PL"
echo "Job reloaded."

open -g "$APP"
echo
echo "A backup is starting. If macOS asks to allow access to the LaCie drive, press Allow."
echo "When it finishes, ~/.claude/backup-lacie-status.json should say \"ok\":true."
