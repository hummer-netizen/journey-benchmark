# Sprint 3 — Provider Comparison Report

Generated: 2026-03-31T14:54:21Z
Journeys: J01, J04, J05, J08, J09, J14

## Summary

| Metric | DirectProvider | BrowserUseProvider | WebfuseProvider (Track C) |
|---|---|---|---|
| Success Rate | 100.0% | 100.0% | PENDING_CREDENTIAL |
| Avg Partial Completion | 100.0% | 100.0% | PENDING_CREDENTIAL |
| Avg Journey Time | 15686ms | 15762ms | PENDING_CREDENTIAL |

## Journey Results

| Journey | DirectProvider | BrowserUseProvider | WebfuseProvider (Track C) |
|---|---|---|---|
| J01: Simple Product Purchase | PASS 100% 53284ms | PASS 100% 53154ms | PENDING_CREDENTIAL |
| J04: Cart Recovery (Expired Session) | PASS 100% 20976ms | PASS 100% 21511ms | PENDING_CREDENTIAL |
| J05: Flight Search & Booking | PASS 100% 3325ms | PASS 100% 3308ms | PENDING_CREDENTIAL |
| J08: Account Registration + Email Verify | PASS 100% 360ms | PASS 100% 327ms | PENDING_CREDENTIAL |
| J09: Password Reset | PASS 100% 483ms | PASS 100% 479ms | PENDING_CREDENTIAL |
| J14: Product Comparison | PASS 100% 15689ms | PASS 100% 15794ms | PENDING_CREDENTIAL |

## Notes

- **DirectProvider (Track A)**: 6/6 passed (100%). Baseline Playwright automation.
- **BrowserUseProvider (Track B)**: 6/6 passed (100%). CDP bridge not configured — delegates to DirectProvider. Full agentic results pending bridge setup.
- **WebfuseProvider (Track C)**: PENDING_CREDENTIAL — `WEBFUSE_SESSION_ID` not set on dev machine. MCP SSE/init fixed (branch `track-c-remediation`). Re-run required once an active Webfuse session ID is provisioned.

---

**Note:** WebfuseProvider (Track C): PENDING_CREDENTIAL — WEBFUSE_SESSION_ID not set on dev machine. Re-run required once an active Webfuse session ID is provisioned.
