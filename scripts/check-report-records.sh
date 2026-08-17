#!/usr/bin/env bash
# check-report-records.sh — the overnight report's record format survives real business names.
#
# Records are "<business name><RSEP><reason>". The name comes from Google, not from us, and real
# listings contain pipes:
#     William C. Knox, Broker | All Saints Lending, Inc
#     Dean Wong Team CrossCountry Mortgage, LLC | Los Angeles
# With "|" as the delimiter (until 2026-08-17) those rows printed half a business name in the CAUSE
# column of "Where the losses happened", and — the part that actually loses data — the end-of-run dedup
# keys on the text before the FIRST delimiter, so such a lead deduped on a truncated prefix and two
# businesses sharing that prefix would collapse into one row, silently dropping a failure.
#
# This asserts the three things the report does with a record: split for display, dedup, and strip the
# name off for the loss table. Exit 0 = format is safe, 1 = a real name breaks it.
set -uo pipefail

RSEP=$'\037'
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
fails=0
ok() { echo "  ✓ $1"; }
bad() { echo "  ✗ $1"; fails=$((fails+1)); }

NAME_A='William C. Knox, Broker | All Saints Lending, Inc'
NAME_B='Dean Wong Team CrossCountry Mortgage, LLC | Los Angeles'
NAME_C='Smashbox Studios'
REASON_A='verification below 6/6 — flagged for redo'
REASON_B='🚫 BLOCKED BY GATE — ACCEPTANCE GATE FAILED: NO RANK OVERLAY'
REASON_C='🚫 BLOCKED BY GATE — VISUAL GATE FAILED: [photo-band] 31.8s BLANK | flat band'

printf '%s\n' \
  "${NAME_A}${RSEP}${REASON_A}" \
  "${NAME_B}${RSEP}${REASON_B}" \
  "${NAME_C}${RSEP}${REASON_C}" > "$T/failed.txt"

# 1. DISPLAY SPLIT — the per-lead bullet list must recover both halves exactly.
while IFS="$RSEP" read -r name reason; do
  case "$name" in
    "$NAME_A") [ "$reason" = "$REASON_A" ] && ok "pipe-in-name splits correctly (A)" || bad "A reason mangled: $reason" ;;
    "$NAME_B") [ "$reason" = "$REASON_B" ] && ok "pipe-in-name splits correctly (B)" || bad "B reason mangled: $reason" ;;
    "$NAME_C") [ "$reason" = "$REASON_C" ] && ok "pipe-in-REASON survives (C)"      || bad "C reason mangled: $reason" ;;
    *) bad "unrecognised name after split: $name" ;;
  esac
done < "$T/failed.txt"

# 2. DEDUP — keys on the WHOLE name. Two different businesses sharing a prefix must stay two rows.
printf '%s\n' \
  "William C. Knox, Broker | All Saints Lending, Inc${RSEP}reason one" \
  "William C. Knox, Broker | Second Lending Co${RSEP}reason two" \
  "William C. Knox, Broker | All Saints Lending, Inc${RSEP}reason one" > "$T/dup.txt"
n=$(awk -v FS="$RSEP" '!fseen[$1]++' "$T/dup.txt" | wc -l | tr -d ' ')
[ "$n" = "2" ] && ok "dedup keeps two businesses sharing a prefix, drops the true duplicate" \
                || bad "dedup produced $n rows, expected 2 (prefix collision or no dedup)"

# 3. LOSS TABLE — stripping the name must leave the reason, with no name fragment.
out=$(sed "s/^[^$RSEP]*$RSEP//" "$T/failed.txt")
if echo "$out" | grep -q 'All Saints Lending\|Los Angeles'; then
  bad "loss table still contains a business-name fragment"
else
  ok "loss table strips the name cleanly"
fi
[ "$(echo "$out" | sed -n 1p)" = "$REASON_A" ] && ok "stripped reason is intact" || bad "stripped reason wrong"

# 4. NEGATIVE CONTROL — prove the old delimiter really did break, so this test has teeth.
oldsplit=$(printf '%s\n' "${NAME_A}|${REASON_A}" | sed 's/^[^|]*|//')
[ "$oldsplit" != "$REASON_A" ] && ok "negative control: '|' genuinely mangled these names" \
                              || bad "negative control failed — '|' would have worked, test proves nothing"

if [ "$fails" -gt 0 ]; then
  echo "❌ $fails report-record case(s) failed."
  exit 1
fi
echo "✅ report record format is safe for real business names."
