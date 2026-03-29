# Journey Automation Benchmark

A browser automation benchmark framework measuring the performance and reliability of web automation providers against real e-commerce shopping journeys.

## Overview

Sprint 1 implements the first proof slice from the [Journey Benchmark roadmap](https://github.com/Nichol4s/ateam-tasks/issues/31):

- **Target:** WebArena OneStopShop (Magento 2, pre-seeded with WebArena dataset — `webarenaimages/shopping_final_0712`)
- **Journeys:** J01 (Simple Product Purchase), J04 (Cart Recovery), J14 (Product Comparison)
- **Providers:** Direct (L1 scripted baseline) + Webfuse (Automation API proxy layer)
- **Metrics:** M1 (success rate), M2 (partial completion), M3 (execution time)
- **Storage:** SQLite (`benchmark.db`)
- **Reports:** JSON + Markdown per run (`reports/`)

The benchmark runner drives Playwright against the WebArena target, capturing P0 metrics at each step. Results persist to SQLite and generate per-run reports automatically.

## Architecture

```
┌──────────────────┐     ┌───────────────────────┐     ┌──────────────────────┐
│  Benchmark Runner │────▶│  Automation Provider   │────▶│  WebArena Shopping    │
│  (Playwright)     │     │                        │     │  (Magento 2, :7770)   │
│                   │◀────│  Direct: local browser  │◀────│                       │
│  J01 / J04 / J14  │     │  Webfuse: proxy session │     │  Pre-seeded dataset   │
└──────────────────┘     └───────────────────────┘     └──────────────────────┘
         │
         ▼
  SQLite + JSON/MD reports
```

**Webfuse provider flow (D3):** Benchmark runner opens a Webfuse space → Surfly creates a proxy session pointing at the WebArena target URL → Playwright drives the browser through the Webfuse proxy layer → session key available for MCP control.

## Quick Start

### 1. Install dependencies

```bash
npm install
npx playwright install chromium
```

### 2. Start the WebArena shopping target

```bash
cd docker
docker compose -f docker-compose.benchmark.yml up -d
# WebArena shopping available at http://localhost:7770
# Wait ~60s for healthcheck
```

Verify:
```bash
curl -s -o /dev/null -w '%{http_code}' http://localhost:7770/
# 200
```

### 3. Run the benchmark

```bash
# All 3 Sprint 1 journeys — Direct provider (L1 baseline)
npm run benchmark

# Single journey
npm run benchmark -- --journeys J01

# Through Webfuse Automation API (requires WEBFUSE_API_KEY + public target URL)
WEBFUSE_API_KEY=your-key WEBFUSE_SPACE_URL=https://webfu.se/+benchmark-webarena/ \
  npm run benchmark -- --provider webfuse
```

## Providers

### Direct (default)
Standard Playwright — launches Chromium locally, drives the WebArena shop directly. This is the **L1 (deterministic scripted) baseline** per the roadmap.

**Verified Sprint 1 path.** See `reports/example-direct-run.json` for a passing run (3/3, 100% success, 2026-03-29).

### Webfuse
Creates a Surfly co-browsing session pointing at the target URL, then drives Playwright through the Webfuse proxy layer. This is the **Automation API delivery path** (roadmap D3).

**Verified end-to-end on 2026-03-29.** See `reports/example-webfuse-run.json` — 3/3 journeys PASS through the Webfuse proxy:
- J01: PASS (62s, 8/8 steps through Surfly proxy)
- J04: PASS (40s, 7/7 steps through Surfly proxy)
- J14: PASS (38s, 8/8 steps through Surfly proxy)

The WebArena target is exposed publicly via Cloudflare Tunnel at `webarena-shop.webfuse.it` → `localhost:7770`. The Webfuse space `benchmark-webarena` opens this tunnel URL as its target.

**Required env vars:**
- `WEBFUSE_API_KEY` — Surfly REST API token (`ck_...`)
- `WEBFUSE_SPACE_URL` — Webfuse space URL (default: `https://webfu.se/+benchmark-webarena/`)
- `WEBFUSE_TARGET_URL` — Public target URL (default: `https://webarena-shop.webfuse.it/`)

**Space:** `benchmark-webarena` (id 1960), target: `webarena-shop.webfuse.it` (Cloudflare Tunnel → localhost:7770).

## Available Journeys

| ID  | Name                            | Steps | Description                                                         |
|-----|---------------------------------|-------|---------------------------------------------------------------------|
| J01 | Simple Product Purchase         | 8     | Homepage → search → PDP → add to cart → guest checkout → confirm   |
| J04 | Cart Recovery (Expired Session) | 7     | Add items → clear cookies (simulate expiry) → re-add → verify cart |
| J14 | Product Comparison              | 8     | View 2 products → compare by price → add cheaper to cart           |

## Metrics (P0 — Sprint 1)

| ID | Metric                      | Description                                                       |
|----|-----------------------------|-------------------------------------------------------------------|
| M1 | Success Rate                | Fraction of journeys that completed successfully                  |
| M2 | Average Partial Completion  | Mean fraction of steps passed across all journeys (0.0–1.0)      |
| M3 | Execution Time              | Total run time and per-journey average                            |

## Docker Stack

### WebArena (primary — Sprint 1)

`docker/docker-compose.benchmark.yml`:

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| shopping | webarenaimages/shopping_final_0712 | 7770 | WebArena Magento 2 store (pre-seeded) |

### PrestaShop (fallback — not Sprint 1 acceptance path)

`docker/docker-compose.yml` starts a fresh PrestaShop (port 8080). Supported for development but **not** the Sprint 1 acceptance configuration.

## CLI Options

```
Usage: journey-benchmark [options]

Options:
  --provider <type>    Automation provider: direct | webfuse (default: "direct")
  --journeys <list>    Comma-separated journey IDs (default: "J01,J04,J14")
  --site <type>        Target site: webarena | prestashop | magento (default: "webarena")
  --shop-url <url>     Override target shop URL
  --space-url <url>    Webfuse space URL (for webfuse provider)
  --headless           Run headless (default: true)
  --no-headless        Run non-headless
  --db <path>          SQLite database path (default: "./benchmark.db")
  --reports <dir>      Report output directory (default: "./reports")
```

## Example Output

### Direct provider (L1 baseline)
See `reports/example-direct-run.json` and `reports/example-direct-run.md` — verified 2026-03-29 08:03 UTC:
- Provider: DirectProvider → localhost:7770
- J01: PASS (51s), J04: PASS (17s), J14: PASS (10s)
- M1 Success Rate: 100%, M3 Avg: ~26s

### Webfuse provider (Automation API — D3)
See `reports/example-webfuse-run.json` and `reports/example-webfuse-run.md` — verified 2026-03-29 08:04 UTC:
- Provider: WebfuseProvider → Surfly proxy → webarena-shop.webfuse.it
- J01: PASS (62s), J04: PASS (40s), J14: PASS (38s)
- M1 Success Rate: 100%, M3 Avg: ~46s
- Session keys: s20LT2kMAq1PREgynrHXd3lEw, s20L4uL4nqNQY6yjWDQ8R69Jw, s20RbCCRgoQTNWDPtnBlY5sTg

## Deviations from Roadmap

| Item | Roadmap | Sprint 1 Actual | Reason |
|------|---------|----------------|--------|
| Webfuse provider | Verified end-to-end | ✅ Verified end-to-end (3/3 PASS through Surfly proxy, 2026-03-29) | Cloudflare Tunnel `webarena-shop.webfuse.it` exposes WebArena publicly |
| WebArena checkout (J01) | Full purchase flow | Guest checkout completes through order confirmation | WebArena Magento requires guest checkout flow; implemented and passing |
| J04 session expiry | Real session expiry | Cookie clear simulates expiry | Deterministic reset per D5 (speed) |

## Sprint 2 (next)

- Add Browser Use baseline (agentic L2)
- LLM token/cost tracking (M6)
- Comparison report (Direct vs Webfuse vs Browser Use)
