# Sprint 4 — Provider Comparison Report

Generated: 2026-03-31T20:55:16Z
Journeys: J01, J04, J05, J08, J09, J12, J14, J17

## Summary

| Metric | DirectProvider | BrowserUseProvider | WebfuseProvider (Track C) |
|---|---|---|---|
| Success Rate | 100.0% | 100.0% | 37.5% |
| Avg Partial Completion | 100.0% | 100.0% | 56.5% |
| Avg Journey Time | 11929ms | 11796ms | 39254ms |

## Journey Results

| Journey | DirectProvider | BrowserUseProvider | WebfuseProvider (Track C) |
|---|---|---|---|
| J01: Simple Product Purchase | PASS 100% 53457ms | PASS 100% 52665ms | PASS 100% 163563ms |
| J04: Cart Recovery (Expired Session) | PASS 100% 21366ms | PASS 100% 20781ms | FAIL 29% 34301ms |
| J05: Flight Search & Booking | PASS 100% 3326ms | PASS 100% 3328ms | FAIL 38% 20589ms |
| J08: Account Registration + Email Verify | PASS 100% 342ms | PASS 100% 379ms | PASS 100% 10529ms |
| J09: Password Reset | PASS 100% 455ms | PASS 100% 456ms | PASS 100% 27292ms |
| J12: Government Long Form (4-page) | PASS 100% 515ms | PASS 100% 515ms | FAIL 25% 22176ms |
| J14: Product Comparison | PASS 100% 15632ms | PASS 100% 15874ms | FAIL 50% 14032ms |
| J17: Return/Refund Request | PASS 100% 335ms | PASS 100% 369ms | FAIL 11% 21549ms |

## L3 Handoff Rates (Track C)

| Journey | Result | L3 Handoff Required | Failure Mode |
|---|---|---|---|
| J01: Simple Product Purchase | PASS | No | — |
| J04: Cart Recovery (Expired Session) | FAIL 29% | Yes | Cart state lost — server-side session not preserved across MCP navigates |
| J05: Flight Search & Booking | FAIL 38% | Yes | Timeout on `.flight-card` selector — Webfuse DOM snapshot differs from direct |
| J08: Account Registration + Email Verify | PASS | No | — |
| J09: Password Reset | PASS | No | — |
| J12: Government Long Form (4-page) | FAIL 25% | Yes | Timeout on `#address-form` — multi-page form navigation fails in proxied DOM |
| J14: Product Comparison | FAIL 50% | Yes | Price extraction fails — domSnapshot HTML structure differs from Playwright |
| J17: Return/Refund Request | FAIL 11% | Yes | Timeout on `.order-card` — return portal selectors not found in Webfuse DOM |

**L3 Handoff Rate: 62.5%** (5/8 journeys require human intervention via Webfuse)

## M4 Flakiness (DirectProvider)

| Journey | M4 Score | Status |
|---|---|---|
| All 8 journeys | 0.0% | ✅ Stable (5 runs each, 40/40 passed) |

## Notes

- **DirectProvider (Track A)**: 8/8 passed (100%). Baseline Playwright automation.
- **BrowserUseProvider (Track B)**: 8/8 passed (100%). CDP bridge not configured — delegates to DirectProvider.
- **WebfuseProvider (Track C)**: 3/8 passed (37.5%). Real runs via Webfuse Session MCP Server with `WEBFUSE_AUTOMATION_KEY` (ak_*).

### Track C Analysis

**Passing journeys** (J01, J08, J09): Simple navigation + form fills with standard HTML selectors. Auth flows work reliably through Webfuse MCP despite 10-30× latency overhead.

**Failing journeys** root causes:
1. **DOM structure mismatch** (J05, J12, J14, J17): Webfuse `see_domSnapshot` returns HTML wrapped in Webfuse session UI; regex-based `selectorIn()` matching fails on selectors that work in direct Playwright.
2. **Server-side state loss** (J04): Cart session cookies don't persist when navigating via MCP `navigate` tool — the Webfuse proxy treats each navigation as a fresh context.
3. **Performance overhead**: Passing journeys take 3.1× (J01) to 60× (J09) longer via MCP due to HTTP round-trips for each perception/actuation call.

### Recommendations for Track C improvement
- Replace regex `selectorIn()` with proper CSS selector matching on Webfuse DOM snapshots
- Use `see_domSnapshot` with `webfuseIDs: true` and target elements by wf-id instead of CSS selectors
- Investigate session cookie persistence in Webfuse MCP navigate tool
