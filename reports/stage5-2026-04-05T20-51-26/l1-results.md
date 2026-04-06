# Benchmark Run Report

## Summary

| Field | Value |
|-------|-------|
| Date | 2026-04-05T20:51:26.810Z |
| Provider | DirectProvider |
| Site | webarena |
| Target URL | http://localhost:8080 |
| Journeys | 9 |
| Passed | 5 |
| Failed | 4 |
| Success Rate (M1) | 55.6% |
| Avg Partial Completion (M2) | 60.7% |
| Total Time | 97930ms |
| Avg Journey Time (M3) | 10645ms |

## Journey Results

### J00: The Gym — Component Diagnostic [FAIL]

| Field | Value |
|-------|-------|
| Status | failed |
| Time | 30580ms |
| Steps | 13/28 |
| Partial Completion | 46.4% |
| Error | `locator.fill: Timeout 30000ms exceeded.
Call log:
  - waiting for getByLabel('Secret code input')
` |

#### Steps

| # | Step | Status | Time |
|---|------|--------|------|
| 1 | Navigate to The Gym | pass passed | 149ms |
| 2 | DatePicker — Select a date | pass passed | 33ms |
| 3 | Select — Choose an exercise | pass passed | 12ms |
| 4 | ContextMenu — Right-click and choose action | pass passed | 89ms |
| 5 | ClickableImage — Select an image | pass passed | 51ms |
| 6 | Textarea — Enter workout notes | pass passed | 13ms |
| 7 | HoverState — Reveal and click | pass passed | 82ms |
| 8 | ShadowDOM — Enter membership ID | pass passed | 53ms |
| 9 | NativeDate — Select a date with type=date | pass passed | 13ms |
| 10 | TimeInput — Select a time | pass passed | 12ms |
| 11 | DateTimeLocal — Select date and time | pass passed | 9ms |
| 12 | RangeSlider — Set intensity to 75 | pass passed | 12ms |
| 13 | NestedShadow — Type code and confirm | pass passed | 51ms |
| 14 | ClosedShadow — Enter secret code | FAIL failed | 30001ms |
| | | _locator.fill: Timeout 30000ms exceeded.
Call log:
  - waiting for getByLabel('Secret code input')
_ | |

### J01: Simple Product Purchase [FAIL]

| Field | Value |
|-------|-------|
| Status | failed |
| Time | 20095ms |
| Steps | 0/8 |
| Partial Completion | 0.0% |
| Error | `page.waitForSelector: Timeout 20000ms exceeded.
Call log:
  - waiting for locator('#search') to be visible
` |

#### Steps

| # | Step | Status | Time |
|---|------|--------|------|
| 1 | Navigate to homepage | FAIL failed | 20095ms |
| | | _page.waitForSelector: Timeout 20000ms exceeded.
Call log:
  - waiting for locator('#search') to be v_ | |

### J04: Cart Recovery (Expired Session) [FAIL]

| Field | Value |
|-------|-------|
| Status | failed |
| Time | 20120ms |
| Steps | 0/7 |
| Partial Completion | 0.0% |
| Error | `page.waitForSelector: Timeout 20000ms exceeded.
Call log:
  - waiting for locator('#search') to be visible
` |

#### Steps

| # | Step | Status | Time |
|---|------|--------|------|
| 1 | Navigate to homepage | FAIL failed | 20120ms |
| | | _page.waitForSelector: Timeout 20000ms exceeded.
Call log:
  - waiting for locator('#search') to be v_ | |

### J05: Flight Search & Booking [PASS]

| Field | Value |
|-------|-------|
| Status | passed |
| Time | 3300ms |
| Steps | 8/8 |
| Partial Completion | 100.0% |

### J08: Account Registration + Email Verify [PASS]

| Field | Value |
|-------|-------|
| Status | passed |
| Time | 316ms |
| Steps | 6/6 |
| Partial Completion | 100.0% |

### J09: Password Reset [PASS]

| Field | Value |
|-------|-------|
| Status | passed |
| Time | 431ms |
| Steps | 7/7 |
| Partial Completion | 100.0% |

### J12: Government Long Form (4-page) [PASS]

| Field | Value |
|-------|-------|
| Status | passed |
| Time | 526ms |
| Steps | 12/12 |
| Partial Completion | 100.0% |

### J14: Product Comparison [FAIL]

| Field | Value |
|-------|-------|
| Status | failed |
| Time | 20107ms |
| Steps | 0/8 |
| Partial Completion | 0.0% |
| Error | `page.waitForSelector: Timeout 20000ms exceeded.
Call log:
  - waiting for locator('#search') to be visible
` |

#### Steps

| # | Step | Status | Time |
|---|------|--------|------|
| 1 | Search for products | FAIL failed | 20107ms |
| | | _page.waitForSelector: Timeout 20000ms exceeded.
Call log:
  - waiting for locator('#search') to be v_ | |

### J17: Return/Refund Request [PASS]

| Field | Value |
|-------|-------|
| Status | passed |
| Time | 334ms |
| Steps | 9/9 |
| Partial Completion | 100.0% |

