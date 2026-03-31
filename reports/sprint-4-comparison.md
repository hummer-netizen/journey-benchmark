# Sprint 4 — Provider Comparison Report

Generated: 2026-03-31T14:57:48Z
Journeys: J01, J04, J05, J08, J09, J12, J14, J17

## Summary

| Metric | DirectProvider | BrowserUseProvider | WebfuseProvider (Track C) |
|---|---|---|---|
| Success Rate | 100.0% | 100.0% | PENDING_CREDENTIAL |
| Avg Partial Completion | 100.0% | 100.0% | PENDING_CREDENTIAL |
| Avg Journey Time | 11799ms | 11796ms | PENDING_CREDENTIAL |

## Journey Results

| Journey | DirectProvider | BrowserUseProvider | WebfuseProvider (Track C) |
|---|---|---|---|
| J01: Simple Product Purchase | PASS 100% 52895ms | PASS 100% 52665ms | PENDING_CREDENTIAL |
| J04: Cart Recovery (Expired Session) | PASS 100% 20735ms | PASS 100% 20781ms | PENDING_CREDENTIAL |
| J05: Flight Search & Booking | PASS 100% 3305ms | PASS 100% 3328ms | PENDING_CREDENTIAL |
| J08: Account Registration + Email Verify | PASS 100% 326ms | PASS 100% 379ms | PENDING_CREDENTIAL |
| J09: Password Reset | PASS 100% 444ms | PASS 100% 456ms | PENDING_CREDENTIAL |
| J12: Government Long Form (4-page) | PASS 100% 552ms | PASS 100% 515ms | PENDING_CREDENTIAL |
| J14: Product Comparison | PASS 100% 15720ms | PASS 100% 15874ms | PENDING_CREDENTIAL |
| J17: Return/Refund Request | PASS 100% 415ms | PASS 100% 369ms | PENDING_CREDENTIAL |

## Notes

- **DirectProvider (Track A)**: 8/8 passed (100%). Baseline Playwright automation.
- **BrowserUseProvider (Track B)**: 8/8 passed (100%). CDP bridge not configured — delegates to DirectProvider. Full agentic results pending bridge setup.
- **WebfuseProvider (Track C)**: PENDING_CREDENTIAL — `WEBFUSE_SESSION_ID` not set on dev machine. MCP SSE/init fixed (branch `track-c-remediation`). Re-run required once an active Webfuse session ID is provisioned.

---

**Note:** WebfuseProvider (Track C): PENDING_CREDENTIAL — WEBFUSE_SESSION_ID not set on dev machine. Re-run required once an active Webfuse session ID is provisioned.
