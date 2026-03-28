import { Command } from 'commander';
import path from 'path';
import { fileURLToPath } from 'url';
import { createProvider } from './webfuse/index.js';
import { BenchmarkRunner } from './runner/runner.js';
import { openDatabase, insertRun } from './db/index.js';
import { generateJsonReport, generateMarkdownReport } from './reporter/index.js';
import { getSiteConfig } from './journeys/config.js';
import { J01ProductPurchase } from './journeys/j01-product-purchase.js';
import { J04CartRecovery } from './journeys/j04-cart-recovery.js';
import { J14ProductComparison } from './journeys/j14-product-comparison.js';
import type { Journey } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const reportsDir = path.join(__dirname, '..', 'reports');
const dbPath = path.join(__dirname, '..', 'benchmark.db');

const program = new Command();

program
  .name('journey-benchmark')
  .description('Browser automation benchmark for WebArena shopping journeys')
  .version('1.0.0')
  .option('--provider <type>', 'Automation provider: direct | webfuse', 'direct')
  .option('--journeys <list>', 'Comma-separated journey IDs to run (e.g. J01,J04,J14)', 'J01,J04,J14')
  .option('--headless', 'Run browser in headless mode', true)
  .option('--no-headless', 'Run browser in non-headless mode')
  .option('--db <path>', 'Path to SQLite database', dbPath)
  .option('--reports <dir>', 'Output directory for reports', reportsDir)
  .action(async (options) => {
    // Set provider env var
    process.env['AUTOMATION_PROVIDER'] = options.provider;

    const config = getSiteConfig();
    const journeyIds: string[] = options.journeys.split(',').map((j: string) => j.trim().toUpperCase());

    const allJourneys: Record<string, Journey> = {
      J01: new J01ProductPurchase(config),
      J04: new J04CartRecovery(config),
      J14: new J14ProductComparison(config),
    };

    const selectedJourneys = journeyIds
      .map(id => allJourneys[id])
      .filter((j): j is Journey => j !== undefined);

    if (selectedJourneys.length === 0) {
      console.error('No valid journeys selected. Available: J01, J04, J14');
      process.exit(1);
    }

    console.log(`\nJourney Benchmark`);
    console.log(`   Provider: ${options.provider}`);
    console.log(`   Journeys: ${journeyIds.join(', ')}`);
    console.log(`   Target:   ${config.baseUrl}`);
    console.log(`   Headless: ${options.headless}`);

    let provider;
    try {
      provider = createProvider(options.headless);
    } catch (err) {
      console.error(`Failed to create provider: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }

    const runner = new BenchmarkRunner({
      provider,
      journeys: selectedJourneys,
      baseUrl: config.baseUrl,
    });

    let exitCode = 0;
    try {
      const result = await runner.run();

      // Persist to SQLite
      const db = openDatabase(options.db);
      const runId = insertRun(db, result);
      db.close();
      console.log(`\nSaved to database (run #${runId})`);

      // Generate reports
      const jsonPath = generateJsonReport(result, options.reports);
      const mdPath = generateMarkdownReport(result, options.reports);
      console.log(`JSON report: ${jsonPath}`);
      console.log(`Markdown report: ${mdPath}`);

      // Summary
      console.log(`\n---------------------------------`);
      console.log(`Passed:  ${result.passed}/${result.totalJourneys}`);
      console.log(`Failed:  ${result.failed}/${result.totalJourneys}`);
      const successPct = result.totalJourneys > 0
        ? ((result.passed / result.totalJourneys) * 100).toFixed(1)
        : '0.0';
      console.log(`Success: ${successPct}%`);

      if (result.failed > 0) exitCode = 1;
    } finally {
      await provider.close().catch(() => {});
    }

    process.exit(exitCode);
  });

program.parse();
