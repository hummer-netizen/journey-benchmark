import type { Page } from 'playwright';
import type { Journey, JourneyResult, JourneyStep, SiteConfig } from '../types.js';
import type { MetricCollector } from '../metrics/collector.js';

/** Base class with shared execution logic for all journeys */
export abstract class BaseJourney implements Journey {
  abstract id: string;
  abstract name: string;
  abstract steps: JourneyStep[];

  protected config: SiteConfig;

  constructor(config: SiteConfig) {
    this.config = config;
  }

  async execute(page: Page, collector: MetricCollector): Promise<JourneyResult> {
    collector.reset();
    const startedAt = new Date().toISOString();
    const journeyStart = Date.now();
    let status: JourneyResult['status'] = 'passed';
    let errorMessage: string | undefined;

    for (let i = 0; i < this.steps.length; i++) {
      const step = this.steps[i];
      if (!step) continue;
      const result = await collector.measure(i, step.name, () => step.execute(page));
      if (result.status === 'failed') {
        status = 'failed';
        errorMessage = result.errorMessage;
        // Mark remaining steps as skipped
        for (let j = i + 1; j < this.steps.length; j++) {
          const skippedStep = this.steps[j];
          if (skippedStep) {
            collector.getResults(); // access to trigger no-op
          }
        }
        break;
      }
    }

    const allResults = collector.getResults();
    const stepsCompleted = allResults.filter(r => r.status === 'passed').length;

    return {
      journeyId: this.id,
      journeyName: this.name,
      status,
      executionTimeMs: Date.now() - journeyStart,
      partialCompletion: this.steps.length > 0 ? stepsCompleted / this.steps.length : 0,
      stepsTotal: this.steps.length,
      stepsCompleted,
      steps: allResults,
      errorMessage,
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  }
}
