import type { Page } from 'playwright';
import type { Journey, JourneyResult, RunResult } from '../types.js';
import type { AutomationProvider } from '../webfuse/provider.js';
import { MetricCollector } from '../metrics/collector.js';
import { startTrace, stopTrace, type TraceConfig } from './trace.js';

export interface RunnerOptions {
  provider: AutomationProvider;
  journeys: Journey[];
  baseUrl: string;
  site: string;
  /** Playwright trace/HAR/screenshot capture settings */
  trace?: TraceConfig;
  /** Called when a journey completes */
  onJourneyComplete?: (result: JourneyResult) => void;
}

/** Checks if a URL is reachable */
async function isReachable(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(url, { signal: controller.signal, method: 'HEAD' });
    clearTimeout(timeout);
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}

/** Benchmark runner — executes journeys sequentially and collects results */
export class BenchmarkRunner {
  private options: RunnerOptions;

  constructor(options: RunnerOptions) {
    this.options = options;
  }

  async run(): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    const journeyResults: JourneyResult[] = [];

    // Cache reachability results per URL to avoid redundant checks
    const reachabilityCache = new Map<string, boolean>();
    async function checkReachable(url: string): Promise<boolean> {
      if (reachabilityCache.has(url)) return reachabilityCache.get(url)!;
      const ok = await isReachable(url);
      reachabilityCache.set(url, ok);
      return ok;
    }

    for (const journey of this.options.journeys) {
      console.log(`\n> Running ${journey.id}: ${journey.name}`);

      // Determine the effective base URL for this journey
      const journeyBaseUrl = (journey as any).config?.baseUrl ?? this.options.baseUrl;
      const reachable = await checkReachable(journeyBaseUrl);

      let result: JourneyResult;

      if (!reachable) {
        console.warn(`  Warning: Target ${journeyBaseUrl} is not reachable.`);
        // Graceful degradation: record error without attempting to run
        result = {
          journeyId: journey.id,
          journeyName: journey.name,
          status: 'error',
          executionTimeMs: 0,
          partialCompletion: 0,
          stepsTotal: journey.steps.length,
          stepsCompleted: 0,
          steps: [],
          errorMessage: `Target unreachable: ${journeyBaseUrl}`,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
        };
      } else {
        let page: Page | null = null;
        try {
          page = await this.options.provider.openUrl(this.options.baseUrl);
          const traceConfig = this.options.trace;
          if (traceConfig?.enabled) {
            await startTrace(page.context(), traceConfig).catch(() => {});
          }
          const collector = new MetricCollector();
          result = await journey.execute(page, collector, this.options.provider);
          if (traceConfig?.enabled) {
            const tracePath = await stopTrace(page.context(), journey.id, traceConfig).catch(() => null);
            if (tracePath) console.log(`  Trace: ${tracePath}`);
          }
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          result = {
            journeyId: journey.id,
            journeyName: journey.name,
            status: 'error',
            executionTimeMs: 0,
            partialCompletion: 0,
            stepsTotal: journey.steps.length,
            stepsCompleted: 0,
            steps: [],
            errorMessage,
            startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
          };
        } finally {
          if (page) {
            await page.context().close().catch(() => {});
          }
        }
      }

      const icon = result.status === 'passed' ? 'PASS' : result.status === 'handoff' ? 'HANDOFF' : result.status === 'failed' ? 'FAIL' : 'ERROR';
      console.log(`  [${icon}] ${result.status.toUpperCase()} — ${result.executionTimeMs}ms (${(result.partialCompletion * 100).toFixed(0)}% complete)`);
      if (result.errorMessage) {
        console.log(`  Error: ${result.errorMessage}`);
      }

      journeyResults.push(result);
      this.options.onJourneyComplete?.(result);
    }

    const passed = journeyResults.filter(r => r.status === 'passed').length;
    const failed = journeyResults.length - passed;

    return {
      startedAt,
      finishedAt: new Date().toISOString(),
      provider: this.options.provider.constructor.name,
      site: this.options.site,
      targetUrl: this.options.baseUrl,
      totalJourneys: journeyResults.length,
      passed,
      failed,
      journeys: journeyResults,
    };
  }
}
