# Sprint 4 — Flakiness Assessment (M4)

Generated: 2026-03-31T15:00Z
Provider: DirectProvider
Journeys: J01, J04, J05, J08, J09, J12, J14, J17
Runs per journey: 5

## Results

| Journey | Passed | Failed | M4 Flakiness | Avg Time |
|---------|--------|--------|--------------|----------|
| J01: Simple Product Purchase | 5/5 | 0 | 0.0% | ~53s |
| J04: Cart Recovery (Expired Session) | 5/5 | 0 | 0.0% | ~21s |
| J05: Flight Search & Booking | 5/5 | 0 | 0.0% | ~3.3s |
| J08: Account Registration + Email Verify | 5/5 | 0 | 0.0% | ~0.33s |
| J09: Password Reset | 5/5 | 0 | 0.0% | ~0.44s |
| J12: Government Long Form (4-page) | 5/5 | 0 | 0.0% | ~0.51s |
| J14: Product Comparison | 5/5 | 0 | 0.0% | ~15.7s |
| J17: Return/Refund Request | 5/5 | 0 | 0.0% | ~0.36s |

## Summary

**M4 Flakiness Score: 0.0% across all 8 journeys** (40/40 runs passed)

DirectProvider achieves perfect consistency — all 8 journeys pass 5/5 runs with no variation. This is expected for the L1 baseline: hardcoded selectors on a stable local environment produce deterministic results.

## Notes

- M4 = percentage of runs that failed across repeated executions (0% = perfectly stable)
- Flakiness runs executed sequentially on 2026-03-31
- BrowserUseProvider flakiness pending CDP bridge configuration
- WebfuseProvider (Track C) flakiness pending WEBFUSE_SESSION_ID provisioning
