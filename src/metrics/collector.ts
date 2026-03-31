import type { StepResult, GoalExecutionResult } from '../types.js';

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

  /**
   * Wrap a goal-aware step execution that may return a handoff signal.
   * The function should return a GoalExecutionResult indicating completed or handoff.
   */
  async measureWithHandoff(
    stepIndex: number,
    stepName: string,
    fn: () => Promise<GoalExecutionResult>,
  ): Promise<StepResult> {
    const start = Date.now();
    let status: StepResult['status'] = 'passed';
    let errorMessage: string | undefined;
    let handoffReason: string | undefined;

    try {
      const goalResult = await fn();
      if (goalResult.outcome === 'handoff') {
        status = 'handoff';
        handoffReason = goalResult.handoffReason;
      }
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
      handoffReason,
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

  getHandoffCount(): number {
    return this.results.filter(r => r.status === 'handoff').length;
  }

  reset(): void {
    this.results = [];
  }
}
