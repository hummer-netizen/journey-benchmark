# Journey Automation Benchmark

A browser automation benchmark framework for measuring the performance and reliability of web automation providers against real e-commerce shopping journeys.

## Overview

This framework runs a set of standardised shopping journeys (search, add to cart, checkout, etc.) against a target e-commerce store, measures key metrics, stores results in SQLite, and generates JSON and Markdown reports.

It supports two automation backends:

- **direct** — Local Playwright/Chromium (default, works out of the box)
- **webfuse** — Webfuse Automation API (Sprint 2, requires `WEBFUSE_API_KEY`)

## Quick Start

### 1. Install dependencies

```bash
npm install
npx playwright install chromium
```

### 2. Start the target shop (optional)

```bash
cd docker
docker-compose up -d
# Wait ~2 minutes for PrestaShop to finish installing
bash seed.sh
```

### 3. Run the benchmark

```bash
# Against the local Docker shop (default)
npm run benchmark

# Against a remote shop
SHOP_URL=https://myshop.example.com npm run benchmark

# Run a specific journey only
npm run benchmark -- --journeys J01

# Non-headless mode (see the browser)
npm run benchmark -- --no-headless

# Against a Magento store (default selector set)
SITE_TYPE=magento npm run benchmark

# Against PrestaShop
SITE_TYPE=prestashop npm run benchmark
```

## Available Journeys

| ID  | Name                          | Steps | Description                                           |
|-----|-------------------------------|-------|-------------------------------------------------------|
| J01 | Simple Product Purchase       | 9     | Search → PDP → Add to cart → Checkout → Confirm order |
| J04 | Cart Recovery (Expired Session) | 7   | Add items, clear session, re-add items, verify cart   |
| J14 | Product Comparison            | 8     | Compare two products by price and buy the cheaper one |

## Metrics

| ID | Metric                    | Description                                        |
|----|---------------------------|----------------------------------------------------|
| M1 | Success Rate              | Fraction of journeys that completed successfully   |
| M2 | Average Partial Completion | Mean fraction of steps passed across all journeys |
| M3 | Execution Time            | Total run time and per-journey average             |

## CLI Options

```
Options:
  --provider <type>    Automation provider: direct | webfuse (default: "direct")
  --journeys <list>    Comma-separated journey IDs (default: "J01,J04,J14")
  --headless           Run browser in headless mode (default: true)
  --no-headless        Run browser in non-headless mode
  --db <path>          Path to SQLite database (default: ./benchmark.db)
  --reports <dir>      Output directory for reports (default: ./reports)
  -V, --version        Output the version number
  -h, --help           Display help
```

## Environment Variables

| Variable           | Default                   | Description                              |
|--------------------|---------------------------|------------------------------------------|
| `SHOP_URL`         | `http://localhost:8080`   | Base URL of the target e-commerce store  |
| `SHOP_EMAIL`       | `test@example.com`        | Customer login email                     |
| `SHOP_PASSWORD`    | `test123`                 | Customer login password                  |
| `SITE_TYPE`        | `magento`                 | Selector profile: `magento` or `prestashop` |
| `AUTOMATION_PROVIDER` | `direct`               | Override provider (also set by `--provider`) |
| `WEBFUSE_API_KEY`  | _(none)_                  | Required when using the `webfuse` provider |

## Architecture

```
src/
  cli.ts                    CLI entry point (Commander)
  types.ts                  Shared TypeScript interfaces
  webfuse/
    provider.ts             AutomationProvider interface
    direct.ts               DirectProvider (local Playwright)
    webfuse.ts              WebfuseProvider stub
    index.ts                Factory: createProvider()
  metrics/
    collector.ts            MetricCollector — per-step timing
    compute.ts              M1/M2/M3 calculation functions
    index.ts
  db/
    schema.ts               SQLite schema DDL
    operations.ts           insertRun(), getRun()
    index.ts                openDatabase()
  journeys/
    config.ts               SiteConfig for Magento / PrestaShop
    base.ts                 BaseJourney — shared execute() logic
    j01-product-purchase.ts J01 implementation
    j04-cart-recovery.ts    J04 implementation
    j14-product-comparison.ts J14 implementation
    index.ts
  runner/
    runner.ts               BenchmarkRunner — orchestrates journeys
    index.ts
  reporter/
    generator.ts            JSON and Markdown report generation
    index.ts
docker/
  docker-compose.yml        PrestaShop + MySQL stack
  seed.sh                   Wait-for-ready script
reports/                    Generated reports (gitignored except .gitkeep)
benchmark.db                SQLite results database (gitignored)
```

## Database Schema

Results are stored in `benchmark.db` (SQLite):

- **runs** — one row per benchmark invocation
- **journey_results** — one row per journey per run
- **step_results** — one row per step per journey

## Report Example

After a run, two files are created in `reports/`:

**report_2026-03-28_120000.json** — Full structured data:
```json
{
  "runId": 1,
  "startedAt": "2026-03-28T12:00:00.000Z",
  "provider": "DirectProvider",
  "totalJourneys": 3,
  "passed": 2,
  "failed": 1,
  "journeys": [...]
}
```

**report_2026-03-28_120000.md** — Human-readable summary table with per-journey step breakdowns for failures.

## Development

```bash
# Type-check without building
npm run typecheck

# Build to dist/
npm run build

# Run tests
npm test
```

## Adding a New Journey

1. Create `src/journeys/jNN-my-journey.ts` extending `BaseJourney`
2. Implement `id`, `name`, and `steps` using the `SiteConfig` selectors
3. Export from `src/journeys/index.ts`
4. Register in `src/cli.ts` `allJourneys` map

## Adding a New Site Config

Add a new `SiteConfig` constant to `src/journeys/config.ts` with the correct CSS selectors for the target platform, then extend `getSiteConfig()` to select it via `SITE_TYPE`.
