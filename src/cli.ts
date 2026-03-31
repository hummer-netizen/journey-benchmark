import { Command } from 'commander';
import path from 'path';
import { fileURLToPath } from 'url';
import { createProvider } from './webfuse/index.js';
import { BenchmarkRunner } from './runner/runner.js';
import { defaultTraceConfig } from './runner/trace.js';
import { openDatabase, insertRun } from './db/index.js';
import { generateJsonReport, generateMarkdownReport, generateComparisonReport, generateStakeholderReport } from './reporter/index.js';
import { getSiteConfig, FLIGHT_APP_CONFIG, AUTH_APP_CONFIG, GOV_FORMS_CONFIG, RETURN_PORTAL_CONFIG, resolveAppUrls } from './journeys/config.js';
import { J01ProductPurchase } from './journeys/j01-product-purchase.js';
import { J04CartRecovery } from './journeys/j04-cart-recovery.js';
import { J05FlightBooking } from './journeys/j05-flight-booking.js';
import { J08AccountRegistration } from './journeys/j08-account-registration.js';
import { J09PasswordReset } from './journeys/j09-password-reset.js';
import { J14ProductComparison } from './journeys/j14-product-comparison.js';
import { J12GovernmentForm } from './journeys/j12-government-form.js';
import { J17ReturnRefund } from './journeys/j17-return-refund.js';
import { flakinessScore } from './metrics/index.js';
import type { Journey, JourneyResult } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const reportsDir = path.join(__dirname, '..', 'reports');
const dbPath = path.join(__dirname, '..', 'benchmark.db');

const program = new Command();

program
  .name('journey-benchmark')
  .description('Browser automation benchmark for web journeys (shopping, flight booking, auth flows, government forms)')
  .version('4.0.0')
  .option('--provider <type>', 'Automation provider: direct | webfuse | webfuse-mcp | browser-use', 'direct')
  .option('--journeys <list>', 'Comma-separated journey IDs to run (e.g. J01,J04,J05,J08,J09,J12,J14,J17)', 'J01,J04,J05,J08,J09,J12,J14,J17')
  .option('--site <type>', 'Target site type: webarena | prestashop | magento', 'webarena')
  .option('--shop-url <url>', 'Override target shop URL', '')
  .option('--space-url <url>', 'Webfuse space URL to use for Webfuse provider', '')
  .option('--headless', 'Run browser in headless mode', true)
  .option('--no-headless', 'Run browser in non-headless mode')
  .option('--db <path>', 'Path to SQLite database', dbPath)
  .option('--reports <dir>', 'Output directory for reports', reportsDir)
  .option('--trace', 'Enable Playwright trace capture (saved to traces/<runId>/)', false)
  .option('--compare', 'Run all available providers and generate a comparison report', false)
  .option('--llm-proxy-port <port>', 'Port for the in-process LLM proxy (default: 8999)', '8999')
  .option('--flakiness-runs <n>', 'Run each journey N times and compute M4 flakiness score (default: 1)', '1')
  .option('--stakeholder', 'Generate stakeholder summary report after run', false)
  // TODO: WebfuseProvider carry-over for S4.7 — requires WEBFUSE_API_KEY env var
  .action(async (options) => {
    process.env['AUTOMATION_PROVIDER'] = options.provider;
    process.env['SITE_TYPE'] = options.site;
    if (options.shopUrl) process.env['SHOP_URL'] = options.shopUrl;
    if (options.spaceUrl) process.env['WEBFUSE_SPACE_URL'] = options.spaceUrl;

    // Re-resolve app URLs after setting AUTOMATION_PROVIDER (webfuse uses public tunnel URLs)
    resolveAppUrls();

    if (options.provider === 'webfuse' || options.provider === 'webfuse-mcp') {
      const webfuseTarget = process.env['WEBFUSE_TARGET_URL'] ?? 'https://webarena-shop.webfuse.it/';
      process.env['SHOP_URL'] = webfuseTarget;
    }

    const config = getSiteConfig();
    const journeyIds: string[] = options.journeys.split(',').map((j: string) => j.trim().toUpperCase());
    const proxyPort = parseInt(options.llmProxyPort ?? '8999', 10);
    const flakinessRuns = parseInt(options.flakinessRuns ?? '1', 10);

    const allJourneys: Record<string, Journey> = {
      J01: new J01ProductPurchase(config),
      J04: new J04CartRecovery(config),
      J05: new J05FlightBooking(FLIGHT_APP_CONFIG),
      J08: new J08AccountRegistration(AUTH_APP_CONFIG),
      J09: new J09PasswordReset(AUTH_APP_CONFIG),
      J12: new J12GovernmentForm(GOV_FORMS_CONFIG),
      J14: new J14ProductComparison(config),
      J17: new J17ReturnRefund(RETURN_PORTAL_CONFIG),
    };

    const selectedJourneys = journeyIds
      .map(id => allJourneys[id])
      .filter((j): j is Journey => j !== undefined);

    if (selectedJourneys.length === 0) {
      console.error('No valid journeys selected. Available: J01, J04, J05, J08, J09, J12, J14, J17');
      process.exit(1);
    }

    // --compare: run all available providers
    if (options.compare) {
      await runComparison(options, selectedJourneys, config, proxyPort);
      return;
    }

    console.log(`\nJourney Benchmark`);
    console.log(`   Provider: ${options.provider}`);
    console.log(`   Journeys: ${journeyIds.join(', ')}`);
    console.log(`   Site:     ${options.site}`);
    console.log(`   Target:   ${config.baseUrl}`);
    console.log(`   Headless: ${options.headless}`);
    if (options.trace) console.log(`   Trace:    enabled`);
    if (flakinessRuns > 1) console.log(`   Flakiness runs: ${flakinessRuns}`);

    let provider;
    try {
      provider = createProvider(options.headless, proxyPort);
    } catch (err) {
      console.error(`Failed to create provider: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }

    const runId = `${options.provider}_${Date.now()}`;
    const traceConfig = options.trace
      ? defaultTraceConfig(runId, path.join(__dirname, '..', 'traces'))
      : undefined;

    const runner = new BenchmarkRunner({
      provider,
      journeys: selectedJourneys,
      baseUrl: config.baseUrl,
      site: options.site,
      trace: traceConfig,
    });

    let exitCode = 0;
    try {
      const result = await runner.run();

      const db = openDatabase(options.db);
      const dbRunId = insertRun(db, result);
      db.close();
      console.log(`\nSaved to database (run #${dbRunId})`);

      const jsonPath = generateJsonReport(result, options.reports);
      const mdPath = generateMarkdownReport(result, options.reports);
      console.log(`JSON report: ${jsonPath}`);
      console.log(`Markdown report: ${mdPath}`);

      // --flakiness-runs: run each journey N-1 more times and compute M4
      if (flakinessRuns > 1) {
        console.log(`\nFlakiness Assessment (${flakinessRuns} runs per journey):`);
        for (const journey of selectedJourneys) {
          const allRuns: JourneyResult[] = [];
          // First run already in result
          const firstRun = result.journeys.find(j => j.journeyId === journey.id);
          if (firstRun) allRuns.push(firstRun);
          // Additional runs
          for (let i = 1; i < flakinessRuns; i++) {
            try {
              const extraResult = await runner.run();
              const jResult = extraResult.journeys.find(j => j.journeyId === journey.id);
              if (jResult) allRuns.push(jResult);
            } catch {
              // Skip failed runs
            }
          }
          const m4 = flakinessScore(allRuns);
          const pct = (m4 * 100).toFixed(1);
          console.log(`   ${journey.id}: M4 flakiness = ${pct}% (${allRuns.filter(r => r.status === 'passed').length}/${allRuns.length} passed)`);
        }
      }

      // --stakeholder: generate stakeholder summary
      if (options.stakeholder) {
        const { json: skJson, markdown: skMd } = generateStakeholderReport([result], options.reports);
        console.log(`Stakeholder JSON: ${skJson}`);
        console.log(`Stakeholder Markdown: ${skMd}`);
      }

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

async function runComparison(
  options: Record<string, unknown>,
  journeys: Journey[],
  config: ReturnType<typeof getSiteConfig>,
  proxyPort: number
): Promise<void> {
  const providerNames = ['direct', 'webfuse', 'webfuse-mcp', 'browser-use'];
  const results = [];
  const pendingCredentialProviders: string[] = [];

  console.log(`\nComparison Run — providers: ${providerNames.join(', ')}`);
  console.log(`Journeys: ${journeys.map(j => j.id).join(', ')}\n`);

  for (const providerName of providerNames) {
    process.env['AUTOMATION_PROVIDER'] = providerName;
    resolveAppUrls();  // Re-resolve URLs for each provider (webfuse needs public tunnel URLs)
    if (providerName === 'webfuse' || providerName === 'webfuse-mcp') {
      process.env['SHOP_URL'] = process.env['WEBFUSE_TARGET_URL'] ?? 'https://webarena-shop.webfuse.it/';
    } else {
      if (options.shopUrl) process.env['SHOP_URL'] = options.shopUrl as string;
    }

    let provider;
    try {
      provider = createProvider(options.headless as boolean, proxyPort);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`Skipping ${providerName}: ${errMsg}`);
      // For webfuse providers missing credentials, include a placeholder result
      if ((providerName === 'webfuse' || providerName === 'webfuse-mcp') && (errMsg.includes('PENDING_CREDENTIAL') || errMsg.includes('WEBFUSE_AUTOMATION_KEY is not set'))) {
        const now = new Date().toISOString();
        const displayName = providerName === 'webfuse' ? 'WebfuseProvider' : 'WebfuseMcpProvider';
        pendingCredentialProviders.push(displayName);
        results.push({
          startedAt: now,
          finishedAt: now,
          provider: displayName,
          site: options.site as string,
          targetUrl: '',
          totalJourneys: journeys.length,
          passed: 0,
          failed: journeys.length,
          journeys: journeys.map(j => ({
            journeyId: j.id,
            journeyName: j.name,
            status: 'error' as const,
            executionTimeMs: 0,
            partialCompletion: 0,
            stepsTotal: j.steps.length,
            stepsCompleted: 0,
            steps: [],
            errorMessage: 'PENDING_CREDENTIAL',
            startedAt: now,
            finishedAt: now,
          })),
        });
      }
      continue;
    }

    console.log(`--- Provider: ${providerName} ---`);
    const runner = new BenchmarkRunner({
      provider,
      journeys,
      baseUrl: config.baseUrl,
      site: options.site as string,
    });

    try {
      const result = await runner.run();
      results.push(result);
    } catch (err) {
      console.warn(`  Error: ${err instanceof Error ? err.message : err}`);
    } finally {
      await provider.close().catch(() => {});
    }
  }

  if (results.length === 0) {
    console.error('No results to compare.');
    process.exit(1);
  }

  const { json, markdown } = generateComparisonReport(results, options.reports as string);

  // Append PENDING_CREDENTIAL note to markdown if any webfuse providers were skipped
  if (pendingCredentialProviders.length > 0) {
    const fs = await import('fs');
    const note = `\n---\n\n**Note:** ${pendingCredentialProviders.join(', ')} (Track C): PENDING_CREDENTIAL — WEBFUSE_AUTOMATION_KEY not set on dev machine. Re-run required once a Space Automation API key is provisioned.\n`;
    fs.appendFileSync(markdown, note, 'utf-8');
  }

  console.log(`\nComparison JSON:     ${json}`);
  console.log(`Comparison Markdown: ${markdown}`);

  if (options.stakeholder) {
    const { json: skJson, markdown: skMd } = generateStakeholderReport(results, options.reports as string);
    console.log(`Stakeholder JSON:    ${skJson}`);
    console.log(`Stakeholder Markdown: ${skMd}`);
  }
}

program.parse();
