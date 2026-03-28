import type { StepResult } from '../types.js';

/** Collects per-step timing and outcome metrics during a journey run */
export class MetricCollector {
  private results: StepResult[] = [];

  /**
   * Wrap a step execution, measuring time and capturing outcome.
   */
  async measure(stepIndex: number, stepName: string, fn: () => Promise<void>): Promise<StepResult> {
    const start = Date.now();
    let status: StepResult['status'] = 'passed';
    let errorMessage: string | undefined;

    try {
      await fn();
    } catch (err) {
      status = 'failed';
      errorMessage = err instanceof Error ? err.message : String(err);
    }

    const result: StepResult = {
      stepIndex,
      stepName,
      status,
      executionTimeMs: Date.now() - start,
      errorMessage,
    };
    this.results.push(result);
    return result;
  }

  getResults(): StepResult[] {
    return [...this.results];
  }

  getCompletedCount(): number {
    return this.results.filter(r => r.status === 'passed').length;
  }

  reset(): void {
    this.results = [];
  }
}
