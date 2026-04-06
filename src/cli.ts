import { Command } from 'commander';
import path from 'path';
import { fileURLToPath } from 'url';
import { createProvider } from './webfuse/index.js';
import { GymBenchmarkRunner } from './runner/gym-benchmark.js';
import { GYM_CONFIG, resolveGymUrl } from './journeys/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const reportsDir = path.join(__dirname, '..', 'reports');

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

    resolveGymUrl();
    const gymUrl = process.env['GYM_URL'] ??
      (mode === 'M1' || mode === 'M2'
        ? `file://${path.resolve(__dirname, '..', 'journeys', 'journey-0', 'index.html')}`
        : GYM_CONFIG.baseUrl);

    const modesToRun = mode === 'ALL' ? ['M1', 'M2', 'M3', 'M4'] : [mode];
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const outputDir = path.join(options.output, `benchmark-${ts}`);

    console.log(`\n4-Mode Gym Benchmark`);
    console.log(`   Mode(s):  ${modesToRun.join(', ')}`);
    console.log(`   Runs:     ${runs}`);
    console.log(`   Gym URL:  ${gymUrl}`);
    console.log(`   Output:   ${outputDir}`);
    console.log(`   Headless: ${options.headless}`);
    if (options.diagnostic) console.log(`   Diagnostic: ON (sessions preserved)`);

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

      const runner = new GymBenchmarkRunner({
        mode: currentMode,
        provider,
        gymUrl,
        runs,
        outputDir,
        diagnostic: options.diagnostic,
      });

      try {
        await runner.run();
      } catch (err) {
        console.error(`  [${currentMode}] Fatal: ${err instanceof Error ? err.message : err}`);
      }
    }

    console.log(`\n=== Benchmark Complete ===`);
    console.log(`Evidence: ${outputDir}/`);
  });

program.parse();
