# Benchmark Run Report

## Summary

| Field | Value |
|-------|-------|
| Date | 2026-04-05T20:53:05.151Z |
| Provider | WebfuseProvider |
| Site | webarena |
| Target URL | https://webarena-shop.webfuse.it/ |
| Journeys | 9 |
| Passed | 2 |
| Failed | 7 |
| Success Rate (M1) | 22.2% |
| Avg Partial Completion (M2) | 28.0% |
| Total Time | 134504ms |
| Avg Journey Time (M3) | 10952ms |

## Journey Results

### J00: The Gym — Component Diagnostic [FAIL]

| Field | Value |
|-------|-------|
| Status | failed |
| Time | 20404ms |
| Steps | 4/28 |
| Partial Completion | 14.3% |
| Error | `Timeout waiting for selector: #image-status.success` |

#### Steps

| # | Step | Status | Time |
|---|------|--------|------|
| 1 | Navigate to The Gym | pass passed | 728ms |
| 2 | DatePicker — Select a date | pass passed | 3801ms |
| 3 | Select — Choose an exercise | pass passed | 1065ms |
| 4 | ContextMenu — Right-click and choose action | pass passed | 3645ms |
| 5 | ClickableImage — Select an image | FAIL failed | 11165ms |
| | | _Timeout waiting for selector: #image-status.success_ | |

### J01: Simple Product Purchase [ERROR]

| Field | Value |
|-------|-------|
| Status | error |
| Time | 0ms |
| Steps | 0/8 |
| Partial Completion | 0.0% |
| Error | `Target unreachable: https://webarena-shop.webfuse.it/` |

### J04: Cart Recovery (Expired Session) [ERROR]

| Field | Value |
|-------|-------|
| Status | error |
| Time | 0ms |
| Steps | 0/7 |
| Partial Completion | 0.0% |
| Error | `Target unreachable: https://webarena-shop.webfuse.it/` |

### J05: Flight Search & Booking [FAIL]

| Field | Value |
|-------|-------|
| Status | failed |
| Time | 22069ms |
| Steps | 3/8 |
| Partial Completion | 37.5% |
| Error | `Timeout waiting for selector: .flight-card, p` |

#### Steps

| # | Step | Status | Time |
|---|------|--------|------|
| 1 | Navigate to flight app homepage | pass passed | 455ms |
| 2 | Select origin airport | pass passed | 865ms |
| 3 | Select destination airport | pass passed | 868ms |
| 4 | Select departure date and search | FAIL failed | 19881ms |
| | | _Timeout waiting for selector: .flight-card, p_ | |

### J08: Account Registration + Email Verify [PASS]

| Field | Value |
|-------|-------|
| Status | passed |
| Time | 17146ms |
| Steps | 6/6 |
| Partial Completion | 100.0% |

### J09: Password Reset [PASS]

| Field | Value |
|-------|-------|
| Status | passed |
| Time | 18578ms |
| Steps | 7/7 |
| Partial Completion | 100.0% |

### J12: Government Long Form (4-page) [FAIL]

| Field | Value |
|-------|-------|
| Status | failed |
| Time | 10195ms |
| Steps | 0/12 |
| Partial Completion | 0.0% |
| Error | `Timeout waiting for selector: #start-application` |

#### Steps

| # | Step | Status | Time |
|---|------|--------|------|
| 1 | Navigate to gov-forms homepage | FAIL failed | 10195ms |
| | | _Timeout waiting for selector: #start-application_ | |

### J14: Product Comparison [ERROR]

| Field | Value |
|-------|-------|
| Status | error |
| Time | 0ms |
| Steps | 0/8 |
| Partial Completion | 0.0% |
| Error | `Target unreachable: https://webarena-shop.webfuse.it/` |

### J17: Return/Refund Request [FAIL]

| Field | Value |
|-------|-------|
| Status | failed |
| Time | 10176ms |
| Steps | 0/9 |
| Partial Completion | 0.0% |
| Error | `Timeout waiting for selector: #login-form` |

#### Steps

| # | Step | Status | Time |
|---|------|--------|------|
| 1 | Navigate to return portal | FAIL failed | 10175ms |
| | | _Timeout waiting for selector: #login-form_ | |

