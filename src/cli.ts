import { Command } from 'commander';
import path from 'path';
import { fileURLToPath } from 'url';
import { createProvider } from './webfuse/index.js';
import { BenchmarkRunner } from './runner/runner.js';
import { openDatabase, insertRun } from './db/index.js';
import { generateJsonReport, generateMarkdownReport } from './reporter/index.js';
import { GYM_CONFIG, resolveGymUrl } from './journeys/config.js';
import { J00TheGym } from './journeys/j00-the-gym.js';
import type { Journey } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const reportsDir = path.join(__dirname, '..', 'reports');
const dbPath = path.join(__dirname, '..', 'benchmark.db');

const program = new Command();

program
  .name('journey-benchmark')
  .description('4-Mode Gym Benchmark: 26-component diagnostic across M1-M4')
  .version('5.0.0')
  .option('--mode <mode>', 'Interaction mode: M1 (Playwright) | M2 (LLM+Playwright) | M3 (Webfuse Scripted) | M4 (Webfuse Agentic) | all', 'M1')
  .option('--runs <n>', 'Number of runs per component (default: 3)', '3')
  .option('--output <dir>', 'Output directory for evidence files', reportsDir)
  .option('--headless', 'Run browser in headless mode', true)
  .option('--no-headless', 'Run browser in non-headless mode')
  .option('--db <path>', 'Path to SQLite database', dbPath)
  .option('--diagnostic', 'Preserve Webfuse sessions (no termination)', false)
  .option('--llm-proxy-port <port>', 'Port for the in-process LLM proxy (default: 8999)', '8999')
  .action(async (options) => {
    const modeMap: Record<string, string> = {
      'M1': 'direct',
      'M2': 'llm-playwright',
      'M3': 'webfuse',
      'M4': 'webfuse-mcp',
    };

    const mode = options.mode.toUpperCase();
    if (mode !== 'ALL' && !modeMap[mode]) {
      console.error(`Invalid --mode: ${options.mode}. Must be M1, M2, M3, M4, or all.`);
      process.exit(1);
    }

    if (options.diagnostic) {
      process.env['DIAGNOSTIC_MODE'] = '1';
    }

    const proxyPort = parseInt(options.llmProxyPort ?? '8999', 10);
    const runs = parseInt(options.runs ?? '3', 10);

    // Resolve Gym URL
    resolveGymUrl();
    const gymUrl = process.env['GYM_URL'] ??
      (mode === 'M1' || mode === 'M2'
        ? `file://${path.resolve(__dirname, '..', 'journeys', 'journey-0', 'index.html')}`
        : GYM_CONFIG.baseUrl);

    const allJourneys: Record<string, Journey> = {
      J00: new J00TheGym({ baseUrl: gymUrl }),
    };

    const journey = allJourneys['J00']!;
    const modesToRun = mode === 'ALL' ? ['M1', 'M2', 'M3', 'M4'] : [mode];

    console.log(`\n4-Mode Gym Benchmark`);
    console.log(`   Mode(s):  ${modesToRun.join(', ')}`);
    console.log(`   Runs:     ${runs}`);
    console.log(`   Gym URL:  ${gymUrl}`);
    console.log(`   Headless: ${options.headless}`);
    if (options.diagnostic) console.log(`   Diagnostic: ON (sessions preserved)`);

    // Run each mode sequentially
    for (const currentMode of modesToRun) {
      const providerName = modeMap[currentMode]!;
      process.env['AUTOMATION_PROVIDER'] = providerName;

      let provider;
      try {
        provider = createProvider(options.headless, proxyPort);
      } catch (err) {
        console.error(`\n[${currentMode}] Failed to create provider: ${err instanceof Error ? err.message : err}`);
        continue;
      }

      console.log(`\n--- ${currentMode} (${providerName}) ---`);

      const runner = new BenchmarkRunner({
        provider,
        journeys: [journey],
        baseUrl: gymUrl,
        site: 'gym',
      });

      try {
        const result = await runner.run();

        const db = openDatabase(options.db);
        const dbRunId = insertRun(db, result);
        db.close();
        console.log(`  [${currentMode}] Saved to database (run #${dbRunId})`);

        const jsonPath = generateJsonReport(result, options.output);
        const mdPath = generateMarkdownReport(result, options.output);
        console.log(`  [${currentMode}] JSON: ${jsonPath}`);
        console.log(`  [${currentMode}] Markdown: ${mdPath}`);

        console.log(`  [${currentMode}] Passed: ${result.passed}/${result.totalJourneys}`);
      } catch (err) {
        console.error(`  [${currentMode}] Error: ${err instanceof Error ? err.message : err}`);
      } finally {
        await provider.close().catch(() => {});
      }
    }

    console.log(`\n=== Benchmark Complete ===`);
  });


program.parse();
