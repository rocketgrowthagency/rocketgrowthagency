#!/bin/bash
# scripts/run-tests.sh
# Runs all unit tests across the lib/. Returns non-zero if any fail.
# Add to pre-commit hook or CI when those exist.

set -e
cd "$(dirname "$0")/.."

echo "=== Running lib/ unit tests ==="
failed=0
for f in lib/*.test.cjs lib/*.test.mjs; do
  if [ -f "$f" ]; then
    echo ""
    echo "→ $f"
    if ! node "$f"; then
      failed=$((failed + 1))
    fi
  fi
done

echo ""
if [ $failed -gt 0 ]; then
  echo "❌ $failed test file(s) failed"
  exit 1
else
  echo "✅ All test files passed"
fi
