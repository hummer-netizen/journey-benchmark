import type { JourneyResult, RunResult } from '../types.js';

/** M1: Success rate — fraction of journeys that passed */
export function successRate(results: JourneyResult[]): number {
  if (results.length === 0) return 0;
  return results.filter(r => r.status === 'passed').length / results.length;
}

/** M2: Average partial completion across all journeys */
export function averagePartialCompletion(results: JourneyResult[]): number {
  if (results.length === 0) return 0;
  const total = results.reduce((sum, r) => sum + r.partialCompletion, 0);
  return total / results.length;
}

/** M3: Total execution time of a run in ms */
export function totalExecutionTime(result: RunResult): number {
  return new Date(result.finishedAt).getTime() - new Date(result.startedAt).getTime();
}

/** M3: Average journey execution time in ms */
export function averageJourneyTime(results: JourneyResult[]): number {
  if (results.length === 0) return 0;
  const total = results.reduce((sum, r) => sum + r.executionTimeMs, 0);
  return total / results.length;
}
