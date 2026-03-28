# Journey Automation Benchmark

A browser automation benchmark framework for measuring the performance and reliability of web automation providers against real e-commerce shopping journeys.

## Overview

This framework runs a standardised set of shopping journeys (search, product comparison, add to cart, full checkout, session recovery) against a target e-commerce store, measures key P0 metrics, stores results in SQLite, and generates JSON and Markdown reports.

**Sprint 1 scope:** J01 (Simple Product Purchase), J04 (Cart Recovery), J14 (Product Comparison) on PrestaShop via local Playwright. Webfuse Automation API integration is Sprint 2.

## Quick Start

### 1. Install dependencies

```bash
npm install
npx playwright install chromium
```

### 2. Start the target shop

```bash
cd docker
docker compose up -d
# Wait ~3 minutes for PrestaShop auto-install to complete
```

Verify the shop is ready:
```bash
curl -s -o /dev/null -w '%{http_code}' http://localhost:8080/
# Should return 200
```

### 3. Run the benchmark

```bash
# All 3 Sprint 1 journeys (default)
npm run benchmark

# Single journey
npm run benchmark -- --journeys J01

# Non-headless (see the browser)
npm run benchmark -- --no-headless
```

> **Note:** `SITE_TYPE=prestashop` is the default. The shop runs on `http://localhost:8080` by default.

## Available Journeys

| ID  | Name                            | Steps | Description                                                         |
|-----|---------------------------------|-------|---------------------------------------------------------------------|
| J01 | Simple Product Purchase         | 9     | Homepage → PDP → Add to cart → Guest checkout (4 steps) → Confirm  |
| J04 | Cart Recovery (Expired Session) | 7     | Add items → Clear cookies (simulate expiry) → Re-add → Verify cart |
| J14 | Product Comparison              | 8     | View 2 products → Compare by price → Add cheaper one to cart       |

## Metrics

| ID | Metric                      | Description                                                       |
|----|-----------------------------|-------------------------------------------------------------------|
| M1 | Success Rate                | Fraction of journeys that completed successfully                  |
| M2 | Average Partial Completion  | Mean fraction of steps passed across all journeys (0.0–1.0)      |
| M3 | Execution Time              | Total run time and per-journey average                            |

## Example Output

From a verified passing run (2026-03-28):

```
Journey Benchmark
   Provider: direct
   Journeys: J01, J04, J14
   Target:   http://localhost:8080

> Running J01: Simple Product Purchase
  [PASS] PASSED — 26934ms (100% complete)

> Running J04: Cart Recovery (Expired Session)
  [PASS] PASSED — 6985ms (100% complete)

> Running J14: Product Comparison
  [PASS] PASSED — 4207ms (100% complete)

Passed:  3/3 | Success: 100.0%
```

See [`reports/example-run.md`](reports/example-run.md) for a full human-readable report and [`reports/example-run.json`](reports/example-run.json) for machine-readable output.

## CLI Options

```
Options:
  --provider <type>    Automation provider: direct | webfuse (default: "direct")
  --journeys <list>    Comma-separated journey IDs (default: "J01,J04,J14")
  --headless           Run in headless mode (default: true)
  --no-headless        Run in non-headless mode
  --db <path>          Path to SQLite database (default: ./benchmark.db)
  --reports <dir>      Output directory for reports (default: ./reports)
  -V, --version        Output the version number
  -h, --help           Display help
```

## Environment Variables

| Variable              | Default                    | Description                                             |
|-----------------------|----------------------------|---------------------------------------------------------|
| `SHOP_URL`            | `http://localhost:8080`    | Base URL of the target e-commerce store                 |
| `SITE_TYPE`           | `prestashop`               | Selector profile: `prestashop` or `magento`             |
| `SHOP_EMAIL`          | `test@example.com`         | Customer login email (used in credentials)              |
| `SHOP_PASSWORD`       | `test123`                  | Customer password                                       |
| `AUTOMATION_PROVIDER` | `direct`                   | Override provider (also set by `--provider`)            |
| `WEBFUSE_API_KEY`     | _(none)_                   | Required when using the `webfuse` provider (Sprint 2)   |

## Architecture

```
src/
  cli.ts                       CLI entry point (Commander)
  types.ts                     Shared TypeScript interfaces
  webfuse/
    provider.ts                AutomationProvider interface
    direct.ts                  DirectProvider (local Playwright)
    webfuse.ts                 WebfuseProvider stub (Sprint 2)
    index.ts                   Factory: createProvider()
  metrics/
    collector.ts               MetricCollector — per-step timing
    compute.ts                 M1/M2/M3 calculation functions
    index.ts
  db/
    schema.ts                  SQLite schema DDL (runs, journey_results, step_results)
    operations.ts              insertRun(), getRun()
    index.ts                   openDatabase()
  journeys/
    config.ts                  SiteConfig for PrestaShop (hummingbird) and Magento
    base.ts                    BaseJourney — shared execute() logic
    j01-product-purchase.ts    J01: full guest checkout flow
    j04-cart-recovery.ts       J04: session expiry simulation + recovery
    j14-product-comparison.ts  J14: two-product price comparison
    index.ts
  runner/
    runner.ts                  BenchmarkRunner — orchestrates journeys sequentially
    index.ts
  reporter/
    generator.ts               JSON and Markdown report generation
    index.ts
docker/
  docker-compose.yml           PrestaShop + MySQL stack
  seed.sh                      Wait-for-ready check
reports/
  example-run.json             Machine-readable output from verified passing run
  example-run.md               Human-readable summary from verified passing run
```

## Database Schema

Results are stored in `benchmark.db` (SQLite):

- **runs** — one row per benchmark invocation (provider, timestamps, pass/fail counts)
- **journey_results** — one row per journey per run (status, execution time, partial completion)
- **step_results** — one row per step per journey (name, status, timing, error message)

## Development

```bash
# Type-check without building
npm run typecheck

# Build to dist/
npm run build

# Run tests
npm test
```

## Webfuse Automation API (Sprint 2)

Sprint 2 wires in the `WebfuseProvider` so the runner controls journeys via the Webfuse Automation API instead of direct Playwright. Set `--provider webfuse` and `WEBFUSE_API_KEY` to activate. The journey code is provider-agnostic — no changes needed to journey implementations.

## Roadmap

| Sprint | Scope                                   | Status          |
|--------|-----------------------------------------|-----------------|
| 1      | WebArena/PrestaShop + 3 journeys (J01, J04, J14), P0 metrics, SQLite, reports | ✅ Done |
| 2      | Webfuse Automation API integration, token tracking (M6), agentic baseline (M7) | Planned |
| 3      | Travel + Auth journeys (J05, J08, J09)  | Planned         |
| 4      | Forms + Support journeys (J12, J17), full 8-journey suite | Planned |
| 5      | Nightly automation, regression alerting to Discord | Planned |
