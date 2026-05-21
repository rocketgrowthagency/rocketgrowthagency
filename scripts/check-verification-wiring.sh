#!/bin/bash
# scripts/check-verification-wiring.sh
#
# Wiring audit — checks that the verification-gate hardening is actually
# WIRED into the production system, not just sitting as dormant code.
# Companion to scripts/regression-audit-detectors.mjs + scripts/check-absence-finding-gates.mjs.
#
# This script answers: "if a future commit silently disconnects part of the
# verification-gate system, will we notice?"
#
# Exit 0 = all 6 wiring points connected, exit 1 = at least one disconnect.
#
# Run periodically (and definitely after any pipeline orchestration change).
# Memory: feedback_verification_gates_must_be_strict.md.

set -u
SCRAPER_DIR="/Volumes/LaCie - APFS (Mac)/ALL NEWS SITES/Rocket Growth Agency/Rocket Growth Agency Scraper VS Code"
WEBSITE_DIR="/Volumes/LaCie - APFS (Mac)/ALL NEWS SITES/Rocket Growth Agency/Rocket Growth Agency Website VS Code"
cd "$SCRAPER_DIR"

FAIL=0
echo "=== Verification-gate wiring audit ==="
echo

echo "1) step-2.5 sets every verified flag step-6 expects:"
for flag in websiteAuditVerified mobileAuditVerified hoursVerified reviewsParsedCount postsVerified descriptionVerified gbpSocialProfilesVerified; do
  cnt=$(grep -c "findings\.${flag}[[:space:]]*=\|${flag}[[:space:]]*:" step-2.5-audit.mjs)
  if [ "$cnt" -gt 0 ]; then echo "  ✓  $flag ($cnt)"
  else echo "  ✗  $flag NEVER SET"; FAIL=1; fi
done
echo

echo "2) Overnight orchestrator runs pre-flight guards:"
if grep -qE "regression-audit-detectors" scripts/overnight-pipeline.sh && grep -qE "check-absence-finding-gates" scripts/overnight-pipeline.sh; then
  echo "  ✓ both pre-flight scripts wired"
else
  echo "  ✗ pre-flight guards NOT wired into orchestrator"; FAIL=1
fi
echo

echo "3) step-6 emits verification-state to per-lead manifest:"
if grep -q "manifest.verificationState" step-6-voiceover.mjs; then
  echo "  ✓ verificationState block written"
else
  echo "  ✗ verificationState NOT written to manifest"; FAIL=1
fi
echo

echo "4) Morning report surfaces verification summary:"
if grep -q "verificationState" scripts/overnight-pipeline.sh; then
  echo "  ✓ report includes per-lead summary"
else
  echo "  ✗ morning report missing summary"; FAIL=1
fi
echo

echo "5) CLAUDE.md documents verification-gate rule as a hard rule:"
if grep -q "Verification-gate rule" "$WEBSITE_DIR/CLAUDE.md"; then
  echo "  ✓ documented for future Claude sessions"
else
  echo "  ✗ NOT in CLAUDE.md"; FAIL=1
fi
echo

echo "6) Both test suites pass:"
if node scripts/regression-audit-detectors.mjs >/dev/null 2>&1; then
  echo "  ✓ runtime regression suite"
else
  echo "  ✗ regression suite FAILING"; FAIL=1
fi
if node scripts/check-absence-finding-gates.mjs >/dev/null 2>&1; then
  echo "  ✓ static absence-gate scanner"
else
  echo "  ✗ absence-gate scanner FAILING"; FAIL=1
fi
echo

if [ "$FAIL" -eq 0 ]; then
  echo "✓ All 6 wiring points connected — verification-gate system is live end-to-end."
  exit 0
else
  echo "✗ Wiring disconnect detected. Fix the failing item(s) above before next overnight run."
  exit 1
fi
