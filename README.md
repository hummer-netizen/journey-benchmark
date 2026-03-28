# Journey Automation Benchmark

A browser automation benchmark framework for measuring the performance and reliability of web automation providers against real e-commerce shopping journeys.

## Overview

This framework runs a standardised set of shopping journeys (search, product comparison, add to cart, full checkout, session recovery) against a target e-commerce store, measures key P0 metrics, stores results in SQLite, and generates JSON and Markdown reports.

**Sprint 1 scope:** J01 (Simple Product Purchase), J04 (Cart Recovery), J14 (Product Comparison) on PrestaShop with two providers:
- **Direct** — Playwright drives the browser locally (baseline)
- **Webfuse** — Playwright drives the browser through the Webfuse/Surfly Automation API proxy layer

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
# All 3 Sprint 1 journeys with direct Playwright (default)
npm run benchmark

# Single journey
npm run benchmark -- --journeys J01

# Non-headless (see the browser)
npm run benchmark -- --no-headless

# Through Webfuse Automation API (requires WEBFUSE_API_KEY)
WEBFUSE_API_KEY=your-key npm run benchmark -- --provider webfuse
```

## Providers

### Direct (default)
Standard Playwright automation — launches Chromium, navigates directly to the shop. This is the L1 (deterministic scripted) baseline.

### Webfuse
Creates a Surfly co-browsing session pointing at the target shop URL, then drives Playwright through the Webfuse proxy layer. This measures automation quality through the Webfuse Automation API as described in the benchmark roadmap.

**Required env vars:**
- `WEBFUSE_API_KEY` — Surfly REST API key
- `WEBFUSE_API_URL` — API base URL (default: `https://app.surfly.com`)

**Architecture:**
```
Runner (Playwright) → Webfuse Session (Surfly proxy) → Target Shop (PrestaShop)
```

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

## Output

- **SQLite** — `benchmark.db` stores all run/journey/step results
- **JSON reports** — `reports/report_<timestamp>.json`
- **Markdown reports** — `reports/report_<timestamp>.md`

## CLI Options

```
Usage: journey-benchmark [options]

Options:
  --provider <type>    Automation provider: direct | webfuse (default: "direct")
  --journeys <list>    Comma-separated journey IDs (default: "J01,J04,J14")
  --headless           Run browser in headless mode (default: true)
  --no-headless        Run browser in non-headless mode
  --db <path>          Path to SQLite database (default: "./benchmark.db")
  --reports <dir>      Output directory for reports (default: "./reports")
```

## Docker Stack

The benchmark target is a standard PrestaShop instance:

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| shop | prestashop/prestashop:latest | 8080 | PrestaShop e-commerce store |
| mysql | mysql:5.7 | 3306 (internal) | Database backend |

Start: `cd docker && docker compose up -d`
Stop: `cd docker && docker compose down`
Reset: `cd docker && docker compose down -v && docker compose up -d`

## Architecture

```
┌──────────────┐     ┌───────────────────┐     ┌──────────────────┐
│   Benchmark  │────▶│  Provider          │────▶│  Target Site      │
│   Runner     │     │  (Direct/Webfuse)  │     │  (PrestaShop)     │
│              │◀────│                    │◀────│                   │
│  - Metrics   │     │  Direct: local     │     │  localhost:8080   │
│  - SQLite    │     │  Webfuse: Surfly   │     │                   │
│  - Reports   │     │    session proxy   │     │                   │
└──────────────┘     └───────────────────┘     └──────────────────┘
```

## Sprint 1 Shortcuts / Known Limitations

1. **Webfuse API connectivity**: The Webfuse/Surfly API endpoint (`app.surfly.com`) returns 501 from the dev machine network. The WebfuseProvider code is complete and follows the Surfly REST API spec, but cannot be E2E tested until API access is restored. Direct provider runs are fully verified.
2. **PrestaShop as WebArena proxy**: We use the official PrestaShop Docker image instead of the full WebArena shopping site Docker image (which bundles Magento). PrestaShop provides equivalent e-commerce journey coverage with faster startup and lower resource use.
3. **No agentic baseline yet**: Browser Use integration is Sprint 2 scope.
4. **Token cost (M6) deferred**: LLM proxy middleware is Sprint 2.

## Example Run Output

```
Journey Benchmark
   Provider: direct
   Journeys: J01, J04, J14
   Target:   http://localhost:8080

> Running J01: Simple Product Purchase
  [PASS] PASSED — 26902ms (100% complete)

> Running J04: Cart Recovery (Expired Session)
  [PASS] PASSED — 7073ms (100% complete)

> Running J14: Product Comparison
  [PASS] PASSED — 4197ms (100% complete)

---------------------------------
Passed:  3/3
Failed:  0/3
Success: 100.0%
```
