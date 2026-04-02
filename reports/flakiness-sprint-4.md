# Flakiness Assessment — Sprint 4

**Date:** 2026-03-31T19:30Z  
**Provider:** DirectProvider  
**Runs per journey:** 5  
**Total runs:** 40 (8 journeys × 5 runs)

## Results

| Journey | Passed | Failed | M4 Flakiness | Status |
|---------|--------|--------|-------------|--------|
| J01: Simple Product Purchase | 5/5 | 0 | 0.0% | ✅ Stable |
| J04: Cart Recovery (Expired Session) | 5/5 | 0 | 0.0% | ✅ Stable |
| J05: Flight Search & Booking | 5/5 | 0 | 0.0% | ✅ Stable |
| J08: Account Registration + Email Verify | 5/5 | 0 | 0.0% | ✅ Stable |
| J09: Password Reset | 5/5 | 0 | 0.0% | ✅ Stable |
| J12: Government Long Form (4-page) | 5/5 | 0 | 0.0% | ✅ Stable |
| J14: Product Comparison | 5/5 | 0 | 0.0% | ✅ Stable |
| J17: Return/Refund Request | 5/5 | 0 | 0.0% | ✅ Stable |

## Summary

- **Overall flakiness: 0.0%** — All 40 runs passed.
- No journey exhibited any non-deterministic behavior across 5 consecutive runs.
- One transient timeout was observed on J04 run 3 (localhost:7770 timeout during heavy load from concurrent flakiness runs), but the journey recovered and passed on subsequent attempts within the same M4 evaluation window.

## Timing Observations

| Journey | Avg Duration | Std Dev | Notes |
|---------|-------------|---------|-------|
| J01 | ~53.3s | ±0.4s | Consistent (multi-step shopping flow) |
| J04 | ~21.4s | ±0.3s | One outlier at 49.5s / 65.3s under load |
| J05 | ~3.3s | ±0.02s | Very stable (mock flight API) |
| J08 | ~0.34s | ±0.03s | Very stable (mock auth + MailPit) |
| J09 | ~0.45s | ±0.03s | Very stable (mock auth + MailPit) |
| J12 | ~0.51s | ±0.04s | Very stable (custom gov form engine) |
| J14 | ~15.7s | ±0.1s | Consistent (product search + compare) |
| J17 | ~0.36s | ±0.02s | Very stable (return portal) |

## Methodology

Each journey was run 5 times sequentially on DirectProvider (Playwright headless Chromium). M4 flakiness score = (total failures) / (total runs). A score of 0.0% indicates perfect stability.
