# Stakeholder Summary Report

Generated: 2026-03-31T20:55:16.746Z

## Executive Summary

Benchmark completed across 4 provider(s) and 8 journey(s). Overall success rate: 34.4%. Top-performing provider: DirectProvider (score: 100/100, 100.0% success). 8 journey(s) had at least one provider failure.

## Provider Ranking

| Rank | Provider | Success Rate | Avg Completion | Avg Time | Score |
|------|----------|-------------|----------------|----------|-------|
| 1 | DirectProvider | 100.0% | 100.0% | 11929ms | 100/100 |
| 2 | WebfuseProvider | 37.5% | 56.5% | 39254ms | 45/100 |
| 3 | BrowserUseProvider | 0.0% | 9.4% | 3188ms | 4/100 |
| 4 | WebfuseMcpProvider | 0.0% | 0.0% | 242ms | 0/100 |

## Journey Findings

| Journey | Category | Best Provider | Best Rate | Worst Provider | Worst Rate | Notes |
|---------|----------|--------------|-----------|----------------|------------|-------|
| J01: Simple Product Purchase | E-Commerce | WebfuseProvider | 100% | BrowserUseProvider | 0% | Performance varies significantly across providers. |
| J04: Cart Recovery (Expired Session) | E-Commerce | DirectProvider | 100% | BrowserUseProvider | 0% | Performance varies significantly across providers. |
| J05: Flight Search & Booking | Travel | DirectProvider | 100% | BrowserUseProvider | 0% | Performance varies significantly across providers. |
| J08: Account Registration + Email Verify | Authentication | WebfuseProvider | 100% | BrowserUseProvider | 0% | Performance varies significantly across providers. |
| J09: Password Reset | Authentication | WebfuseProvider | 100% | BrowserUseProvider | 0% | Performance varies significantly across providers. |
| J12: Government Long Form (4-page) | Government Services | DirectProvider | 100% | BrowserUseProvider | 0% | Performance varies significantly across providers. |
| J14: Product Comparison | E-Commerce | DirectProvider | 100% | BrowserUseProvider | 0% | Performance varies significantly across providers. |
| J17: Return/Refund Request | Returns & Refunds | DirectProvider | 100% | BrowserUseProvider | 0% | Performance varies significantly across providers. |

## Recommendations

- Consider DirectProvider as the primary automation provider given its 100 point lead over WebfuseMcpProvider.
- Investigate failures in: J01, J04, J05, J08, J09, J12, J14, J17.
- Optimize performance for: WebfuseProvider (avg > 30s per journey).

