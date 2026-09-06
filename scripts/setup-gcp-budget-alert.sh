#!/usr/bin/env bash
# setup-gcp-budget-alert.sh — create the Google Cloud budget alert that both incidents needed.
#
# ─── WHY ────────────────────────────────────────────────────────────────────────────────────────
# Two runaway spends have happened and NEITHER was caught by a notification:
#   $755  2026-05-07  found because Google SUSPENDED billing
#   ~$204/mo (capped) found 2026-09-06 because a feature had been quietly stuck for months
#
# A budget alert is the cheapest insurance available. Neither incident would have run as long.
#
# 🔴 CLAUDE CANNOT RUN THIS UNATTENDED. Creating a budget needs the Cloud Billing Budget API, and
# our OAuth grant holds analytics.readonly / webmasters.readonly / business.manage — no billing
# scope, deliberately. gcloud is installed but unauthenticated, and `gcloud auth login` opens a
# browser. So Chris runs step 1; everything after is automatic.
#
#   1.  gcloud auth login            ← Chris, once. Opens a browser.
#   2.  bash scripts/setup-gcp-budget-alert.sh          ← dry run, shows what it would create
#   3.  bash scripts/setup-gcp-budget-alert.sh --commit ← creates it
set -u
set -o pipefail

PROJECT="rocket-growth-agency"
BUDGET_NAME="RGA runaway-spend alarm"
AMOUNT_USD="${BUDGET_AMOUNT_USD:-50}"     # deliberately LOW — this is a tripwire, not a forecast
COMMIT=0
[ "${1:-}" = "--commit" ] && COMMIT=1

echo "── GCP budget alert ──"

if ! command -v gcloud >/dev/null 2>&1; then
  echo "  🔴 gcloud CLI not installed."
  exit 2
fi

# 🔴 Capture then test — never `$(cmd || echo …)`, which APPENDS on non-zero exit.
ACCT_OUT=$(gcloud auth list --format="value(account)" 2>/dev/null) || true
ACCT=$(printf '%s' "$ACCT_OUT" | head -1)
if [ -z "$ACCT" ]; then
  echo "  🔴 gcloud is not authenticated — this is the one step that needs a browser."
  echo ""
  echo "     Run this, then re-run this script:"
  echo "       gcloud auth login"
  echo ""
  echo "     Or set it in the console instead (same result, ~60 seconds):"
  echo "       https://console.cloud.google.com/billing → Budgets & alerts → Create budget"
  echo "       Scope: project ${PROJECT} · Amount: \$${AMOUNT_USD}/month · Alerts at 50% / 90% / 100%"
  exit 2
fi
echo "  authenticated as: $ACCT"

BILL_OUT=$(gcloud billing accounts list --format="value(name)" 2>/dev/null) || true
BILLING=$(printf '%s' "$BILL_OUT" | head -1)
if [ -z "$BILLING" ]; then
  echo "  🔴 no billing account visible to this login — it may lack Billing Account Administrator."
  exit 2
fi
echo "  billing account : $BILLING"
echo "  project         : $PROJECT"
echo "  threshold       : \$${AMOUNT_USD}/month, alerts at 50% / 90% / 100%"
echo ""
echo "  🔑 \$${AMOUNT_USD} is a TRIPWIRE, not a forecast. Normal spend is a few dollars a month, so"
echo "     this fires long before anything resembling the \$755 event, and well before a"
echo "     suspension. Raise it only if legitimate usage genuinely grows into it."

if [ "$COMMIT" -ne 1 ]; then
  echo ""
  echo "  DRY RUN — nothing created. Re-run with --commit."
  exit 0
fi

echo ""
gcloud billing budgets create \
  --billing-account="$BILLING" \
  --display-name="$BUDGET_NAME" \
  --budget-amount="${AMOUNT_USD}USD" \
  --filter-projects="projects/${PROJECT}" \
  --threshold-rule=percent=0.5 \
  --threshold-rule=percent=0.9 \
  --threshold-rule=percent=1.0 2>&1 | sed 's/^/  /'
RC=${PIPESTATUS[0]}

echo ""
if [ "$RC" -ne 0 ]; then
  echo "  🔴 budget creation failed (exit $RC). Most likely cause: the Cloud Billing Budget API is"
  echo "     not enabled, or this login lacks Billing Account Administrator."
  echo "     Enable it: https://console.cloud.google.com/apis/library/billingbudgets.googleapis.com?project=${PROJECT}"
  exit 1
fi

# 🔴 Verify by RE-READING. A create that returned 0 is not proof the budget exists.
echo "  verifying by re-read…"
LIST=$(gcloud billing budgets list --billing-account="$BILLING" --format="value(displayName)" 2>/dev/null) || true
if printf '%s' "$LIST" | grep -qF "$BUDGET_NAME"; then
  echo "  ✅ budget exists and is named \"$BUDGET_NAME\""
else
  echo "  🔴 create reported success but the budget is NOT in the list — do not assume it worked."
  exit 1
fi
