#!/bin/bash
# Stage 5: Diagnostic Run — All journeys across L1, L3 (scripted levels)
# L2 and L4 (agent levels) run J00 only due to LLM API cost.
# DIAGNOSTIC_MODE=1 preserves Webfuse sessions for review.

set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a

export GYM_URL="${GYM_URL:-https://gym-diagnostic.webfuse.it}"
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
for f in "${REPORT_DIR}"/report_*.json; do
  [ -f "$f" ] && mv "$f" "${REPORT_DIR}/l1-results.json" && break
done
for f in "${REPORT_DIR}"/report_*.md; do
  [ -f "$f" ] && mv "$f" "${REPORT_DIR}/l1-results.md" && break
done
echo ""

# --- L3: Scripted Webfuse (all journeys) ---
echo "=== L3: Scripted Webfuse ==="
node dist/cli.js --level 3 --journeys "$JOURNEYS" \
  --reports "$REPORT_DIR" \
  2>&1 | tee "${REPORT_DIR}/l3-output.log"
for f in "${REPORT_DIR}"/report_*.json; do
  [ -f "$f" ] && mv "$f" "${REPORT_DIR}/l3-results.json" && break
done
for f in "${REPORT_DIR}"/report_*.md; do
  [ -f "$f" ] && mv "$f" "${REPORT_DIR}/l3-results.md" && break
done
echo ""

# --- L2: LLM + Playwright (J00 only) ---
echo "=== L2: LLM + Playwright (J00 only) ==="
node dist/cli.js --level 2 --journeys J00 \
  --reports "$REPORT_DIR" \
  2>&1 | tee "${REPORT_DIR}/l2-output.log"
for f in "${REPORT_DIR}"/report_*.json; do
  [ -f "$f" ] && mv "$f" "${REPORT_DIR}/l2-results.json" && break
done
for f in "${REPORT_DIR}"/report_*.md; do
  [ -f "$f" ] && mv "$f" "${REPORT_DIR}/l2-results.md" && break
done
echo ""

# --- L4: Agentic Webfuse (J00 only) ---
echo "=== L4: Agentic Webfuse (J00 only) ==="
node dist/cli.js --level 4 --journeys J00 \
  --reports "$REPORT_DIR" \
  2>&1 | tee "${REPORT_DIR}/l4-output.log"
for f in "${REPORT_DIR}"/report_*.json; do
  [ -f "$f" ] && mv "$f" "${REPORT_DIR}/l4-results.json" && break
done
for f in "${REPORT_DIR}"/report_*.md; do
  [ -f "$f" ] && mv "$f" "${REPORT_DIR}/l4-results.md" && break
done
echo ""

echo "=== Stage 5 Complete ==="
echo "Reports: ${REPORT_DIR}/"
ls -la "${REPORT_DIR}/"
