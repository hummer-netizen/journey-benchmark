import type { JourneyResult } from '../types.js';

/**
 * M4: Flakiness score for a single journey across N runs.
 * flakiness = 1 - consistency
 * consistency = (fraction of runs with same outcome as majority)
 * Returns 0 (perfectly consistent) to 1 (completely inconsistent).
 */
export function flakinessScore(runs: JourneyResult[]): number {
  if (runs.length <= 1) return 0;
  const passed = runs.filter(r => r.status === 'passed').length;
  const failed = runs.length - passed;
  const majority = Math.max(passed, failed);
  const consistency = majority / runs.length;
  return 1 - consistency;
}

/**
 * M4: Compute flakiness for all journeys given multiple run sets.
 * Input: Array of run arrays — each inner array contains results for a single journey across N runs.
 * Returns map of journeyId → flakiness score.
 */
export function flakinessReport(runSets: JourneyResult[][]): Record<string, number> {
  const report: Record<string, number> = {};
  for (const runs of runSets) {
    if (runs.length === 0) continue;
    const journeyId = runs[0]!.journeyId;
    report[journeyId] = flakinessScore(runs);
  }
  return report;
}

/**
 * M5: Retry success rate.
 * Given results that include retry metadata, computes fraction of journeys
 * that succeeded after at least one retry.
 * Uses optional `retries` field on JourneyResult (extended metadata).
 */
export interface JourneyResultWithRetries extends JourneyResult {
  retries?: number;
  succeededOnRetry?: boolean;
}

export function retrySuccessRate(results: JourneyResultWithRetries[]): number {
  const withRetries = results.filter(r => (r.retries ?? 0) > 0);
  if (withRetries.length === 0) return 0;
  const succeededOnRetry = withRetries.filter(r => r.succeededOnRetry === true).length;
  return succeededOnRetry / withRetries.length;
}

/**
 * M9: Action efficiency ratio.
 * Ratio of minimum steps (stepsTotal) to actual steps taken.
 * When an agent takes more steps than the minimum, efficiency < 1.
 * For deterministic providers, actual === minimum, so efficiency = 1.
 *
 * actualSteps: total steps executed (including redundant/extra steps by agentic provider)
 * minimumSteps: the known minimum steps to complete the journey (stepsTotal from journey definition)
 */
export function actionEfficiency(minimumSteps: number, actualSteps: number): number {
  if (actualSteps <= 0) return 0;
  if (minimumSteps <= 0) return 0;
  return Math.min(1, minimumSteps / actualSteps);
}

/**
 * M9: Compute average action efficiency across a set of results.
 * Uses stepsTotal as the minimum and stepsCompleted + skipped as proxy for actual
 * (or a provided actualSteps map).
 */
export function averageActionEfficiency(
  results: JourneyResult[],
  actualStepsMap?: Record<string, number>
): number {
  if (results.length === 0) return 0;
  const efficiencies = results.map(r => {
    const min = r.stepsTotal;
    const actual = actualStepsMap?.[r.journeyId] ?? r.stepsTotal;
    return actionEfficiency(min, actual);
  });
  return efficiencies.reduce((a, b) => a + b, 0) / efficiencies.length;
}
