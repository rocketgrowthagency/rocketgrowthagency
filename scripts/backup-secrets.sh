#!/usr/bin/env bash
# backup-secrets.sh — an encrypted, offline copy of RGA's own credentials.
#
# ─── WHY ─────────────────────────────────────────────────────────────────────────────────────────
# SOP step 5 ("Set up secure access vault") exists because credentials should not live in exactly one
# place. Audited 2026-09-08:
#
#   client passwords held : 0   — GBP, GA4 and Search Console are DELEGATED (manager/admin/owner
#                                 invites). No credential exists to store, and access dies when the
#                                 client removes us. That is the better pattern, not a gap.
#   RGA's own secrets     : 13  in the scraper .env, on ONE machine, with NO backup.
#
# 🔴 That second line is the real exposure, and it is not a client-confidentiality problem — it is a
# CONTINUITY one. SUPABASE_SERVICE_ROLE_KEY alone is full database access that bypasses every RLS
# policy; SUPABASE_ACCESS_TOKEN can run migrations. If this machine dies, RGA loses the ability to
# operate its own systems.
#
# 🔑 A paid password manager does not fix that any better than this does. Bitwarden Teams becomes
# necessary when we hold a CLIENT's credential (a WordPress login has no delegated equivalent) or
# when a second person needs access — not before. See the step's own instructions.
#
# WHAT THIS DOES
#   Encrypts the .env files to a single AES-256 file on an external drive, with a restore note.
#
# 🔒 THE PASSPHRASE IS NEVER STORED, LOGGED, OR PASSED AS AN ARGUMENT. gpg prompts for it, so it
# does not appear in shell history, the process list, or this script.
#
#   bash scripts/backup-secrets.sh                 # lists drives, tells you what it would write
#   bash scripts/backup-secrets.sh "/Volumes/X10 Pro"
set -uo pipefail

SCRAPER="/Users/chris/RGA/Rocket Growth Agency Scraper VS Code"
WEBSITE="/Users/chris/RGA/Rocket Growth Agency Website VS Code"
DEST="${1:-}"
STAMP="$(date +%Y-%m-%d)"

command -v gpg >/dev/null 2>&1 || { echo "✗ gpg not installed"; exit 2; }

echo "── encrypted backup of RGA's own credentials ──"

# What we are protecting, by NAME only. 🔴 Never print a value.
SRC=()
[ -f "$SCRAPER/.env" ] && SRC+=("$SCRAPER/.env")
[ -f "$WEBSITE/.env" ] && SRC+=("$WEBSITE/.env")
if [ "${#SRC[@]}" -eq 0 ]; then echo "  ✗ no .env files found"; exit 2; fi

N=0
for f in "${SRC[@]}"; do
  c=$(grep -cE '^[A-Z0-9_]+=' "$f" 2>/dev/null || echo 0)
  echo "  $(basename "$(dirname "$f")")/.env — $c variable(s)"
  N=$((N + c))
done
echo "  total: $N"

if [ -z "$DEST" ]; then
  echo ""
  echo "  Mounted volumes:"
  ls /Volumes 2>/dev/null | grep -v 'com.apple' | sed 's/^/    /'
  echo ""
  echo "  Re-run with the drive you want, e.g.:"
  echo "    bash scripts/backup-secrets.sh \"/Volumes/X10 Pro\""
  exit 0
fi

[ -d "$DEST" ] || { echo "  ✗ not a mounted volume: $DEST"; exit 2; }

OUT_DIR="$DEST/RGA-secrets"
OUT="$OUT_DIR/rga-secrets-$STAMP.tar.gz.gpg"
mkdir -p "$OUT_DIR" || { echo "  ✗ cannot write to $OUT_DIR"; exit 1; }

# 🔑 Stage in a private temp dir, and remove it on EVERY exit path — including failure and Ctrl-C.
# A half-written plaintext tarball left on disk would be worse than no backup at all.
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT INT TERM
chmod 700 "$TMP"

cp "$SCRAPER/.env" "$TMP/scraper.env" 2>/dev/null
[ -f "$WEBSITE/.env" ] && cp "$WEBSITE/.env" "$TMP/website.env" 2>/dev/null

cat > "$TMP/RESTORE.txt" <<RESTORE
RGA credential backup — $STAMP
$N variables from the scraper (and website, if present) .env files.

TO RESTORE:
  gpg --decrypt rga-secrets-$STAMP.tar.gz.gpg > rga-secrets.tar.gz
  tar xzf rga-secrets.tar.gz
  # then copy scraper.env back to:
  #   $SCRAPER/.env

WHAT IS NOT IN HERE:
  No client passwords. RGA holds none — Google Business Profile, Analytics and Search
  Console are all DELEGATED access (we are added as manager/admin/owner), so there is no
  credential to store and access ends when the client removes us.

WHEN THIS IS NO LONGER ENOUGH:
  The day we hold a client's website/CMS login (no delegated equivalent exists), or the day
  a second person needs access. Then: Bitwarden Teams, \$4/user/month.
  Note Teams has NO account recovery — that is Enterprise-only — so keep this file and its
  passphrase somewhere physical regardless.
RESTORE

tar czf "$TMP/payload.tar.gz" -C "$TMP" $( [ -f "$TMP/scraper.env" ] && echo scraper.env ) \
  $( [ -f "$TMP/website.env" ] && echo website.env ) RESTORE.txt 2>/dev/null

echo ""
echo "  Encrypting to: $OUT"
echo "  🔑 Choose a passphrase you can retrieve WITHOUT this machine. Write it down physically."
echo "     It is never stored, logged, or passed as an argument — gpg will prompt you twice."
echo ""

gpg --symmetric --cipher-algo AES256 --output "$OUT" "$TMP/payload.tar.gz" || {
  echo "  ✗ encryption failed — nothing was written"; exit 1; }

chmod 600 "$OUT"

# 🔴 VERIFY BY DECRYPTING. A file that exists is not a backup; a file that opens is.
echo ""
echo "  Verifying — enter the same passphrase once more:"
if gpg --decrypt "$OUT" 2>/dev/null | tar tzf - >/dev/null 2>&1; then
  echo "  ✅ verified: the archive decrypts and lists cleanly"
  echo "     $(ls -lh "$OUT" | awk '{print $5}')  $OUT"
else
  echo "  🔴 the file was written but could NOT be decrypted+read back. Do not rely on it."
  exit 1
fi
