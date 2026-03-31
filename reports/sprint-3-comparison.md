# Sprint 3 — Provider Comparison Report

Generated: 2026-03-31T20:55:16Z
Journeys: J01, J04, J05, J08, J09, J14

## Summary

| Metric | DirectProvider | BrowserUseProvider | WebfuseProvider (Track C) |
|---|---|---|---|
| Success Rate | 100.0% | 100.0% | 50.0% |
| Avg Partial Completion | 100.0% | 100.0% | 69.5% |
| Avg Journey Time | 15763ms | 15762ms | 45044ms |

## Journey Results

| Journey | DirectProvider | BrowserUseProvider | WebfuseProvider (Track C) |
|---|---|---|---|
| J01: Simple Product Purchase | PASS 100% 53457ms | PASS 100% 53154ms | PASS 100% 163563ms |
| J04: Cart Recovery (Expired Session) | PASS 100% 21366ms | PASS 100% 21511ms | FAIL 29% 34301ms |
| J05: Flight Search & Booking | PASS 100% 3326ms | PASS 100% 3308ms | FAIL 38% 20589ms |
| J08: Account Registration + Email Verify | PASS 100% 342ms | PASS 100% 327ms | PASS 100% 10529ms |
| J09: Password Reset | PASS 100% 455ms | PASS 100% 479ms | PASS 100% 27292ms |
| J14: Product Comparison | PASS 100% 15632ms | PASS 100% 15794ms | FAIL 50% 14032ms |

## L3 Handoff Rates (Track C)

| Journey | L3 Handoff Required | Notes |
|---|---|---|
| J01: Simple Product Purchase | No | Completed autonomously via MCP |
| J04: Cart Recovery (Expired Session) | Yes — cart state lost through Webfuse session | MCP navigate/domSnapshot lost server-side session state |
| J05: Flight Search & Booking | Yes — selector timeout on `.flight-card` | Webfuse DOM snapshot returns simplified HTML; complex app selectors fail |
| J08: Account Registration + Email Verify | No | Completed autonomously via MCP |
| J09: Password Reset | No | Completed autonomously via MCP |
| J14: Product Comparison | Yes — price extraction failed | domSnapshot HTML structure differs from direct Playwright; regex-based extraction fails |

## Notes

- **DirectProvider (Track A)**: 6/6 passed (100%). Baseline Playwright automation.
- **BrowserUseProvider (Track B)**: 6/6 passed (100%). CDP bridge not configured — delegates to DirectProvider.
- **WebfuseProvider (Track C)**: 3/6 passed (50%). Real runs via Webfuse Session MCP Server. Passing journeys (J01, J08, J09) work end-to-end through MCP tool calls. Failing journeys hit selector/DOM structure mismatches between Webfuse proxied HTML and expected Playwright selectors.

### Track C Performance Observations

- J01 (Product Purchase) works but takes 163s vs 53s direct — 3.1× overhead from MCP round-trips
- Auth flows (J08, J09) work reliably through Webfuse — simpler DOM, fewer selectors
- Complex multi-step flows with server-side state (J04) or dynamic content (J05, J12, J14) fail due to:
  - DOM snapshot returning Webfuse-wrapped HTML with different structure
  - Session cookies/state not persisting across MCP navigate calls
  - Regex-based selector matching (selectorIn) failing on proxied HTML
