#!/bin/bash
# Stage 5: Diagnostic Run — All journeys across L1, L3 (scripted levels)
# L2 and L4 (agent levels) run J00 only due to LLM API cost.
# DIAGNOSTIC_MODE=1 preserves Webfuse sessions for review.

set -uo pipefail
# Note: NOT using set -e because benchmark CLI returns non-zero on journey failures
cd "$(dirname "$0")/.."
set -a; source .env; set +a

export GYM_URL="${GYM_URL:-https://gym-diagnostic.webfuse.it}"
export SHOP_URL="${SHOP_URL:-http://localhost:8080}"
export SITE_TYPE="${SITE_TYPE:-prestashop}"
export DIAGNOSTIC_MODE=1

JOURNEYS="J00,J01,J04,J05,J08,J09,J12,J14,J17"
TS=$(date -u +%Y-%m-%dT%H-%M-%S)
REPORT_DIR="reports/stage5-${TS}"
mkdir -p "$REPORT_DIR"

echo "=== Stage 5: Diagnostic Run (${TS}) ==="
echo "Journeys: ${JOURNEYS}"
echo "Diagnostic Mode: ON (sessions preserved)"
echo "Report dir: ${REPORT_DIR}"
echo ""

# --- L1: Scripted Playwright (all journeys) ---
echo "=== L1: Scripted Playwright ==="
node dist/cli.js --level 1 --journeys "$JOURNEYS" \
  --reports "$REPORT_DIR" \
  2>&1 | tee "${REPORT_DIR}/l1-output.log"
# Rename reports
mv "$(ls -t "${REPORT_DIR}"/report_*.json 2>/dev/null | head -1)" "${REPORT_DIR}/l1-results.json" 2>/dev/null || true
mv "$(ls -t "${REPORT_DIR}"/report_*.md 2>/dev/null | head -1)" "${REPORT_DIR}/l1-results.md" 2>/dev/null || true
echo ""

# --- L3: Scripted Webfuse (all journeys) ---
echo "=== L3: Scripted Webfuse ==="
node dist/cli.js --level 3 --journeys "$JOURNEYS" \
  --reports "$REPORT_DIR" \
  2>&1 | tee "${REPORT_DIR}/l3-output.log"
mv "$(ls -t "${REPORT_DIR}"/report_*.json 2>/dev/null | head -1)" "${REPORT_DIR}/l3-results.json" 2>/dev/null || true
mv "$(ls -t "${REPORT_DIR}"/report_*.md 2>/dev/null | head -1)" "${REPORT_DIR}/l3-results.md" 2>/dev/null || true
echo ""

# --- L2: LLM + Playwright (J00 only) ---
echo "=== L2: LLM + Playwright (J00 only) ==="
node dist/cli.js --level 2 --journeys J00 \
  --reports "$REPORT_DIR" \
  2>&1 | tee "${REPORT_DIR}/l2-output.log"
mv "$(ls -t "${REPORT_DIR}"/report_*.json 2>/dev/null | head -1)" "${REPORT_DIR}/l2-results.json" 2>/dev/null || true
mv "$(ls -t "${REPORT_DIR}"/report_*.md 2>/dev/null | head -1)" "${REPORT_DIR}/l2-results.md" 2>/dev/null || true
echo ""

# --- L4: Agentic Webfuse (J00 only) ---
echo "=== L4: Agentic Webfuse (J00 only) ==="
node dist/cli.js --level 4 --journeys J00 \
  --reports "$REPORT_DIR" \
  2>&1 | tee "${REPORT_DIR}/l4-output.log"
mv "$(ls -t "${REPORT_DIR}"/report_*.json 2>/dev/null | head -1)" "${REPORT_DIR}/l4-results.json" 2>/dev/null || true
mv "$(ls -t "${REPORT_DIR}"/report_*.md 2>/dev/null | head -1)" "${REPORT_DIR}/l4-results.md" 2>/dev/null || true
echo ""

echo "=== Stage 5 Complete ==="
echo "Reports: ${REPORT_DIR}/"
ls -la "${REPORT_DIR}/"
