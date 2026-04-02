import type { JourneyResult } from '../types.js';

/**
 * M8: Intervention rate.
 * Fraction of journeys that required human intervention.
 * Computed from journey results with optional `interventionRequired` metadata.
 */
export interface JourneyResultWithIntervention extends JourneyResult {
  interventionRequired?: boolean;
  interventionReason?: string;
}

export function interventionRate(results: JourneyResultWithIntervention[]): number {
  if (results.length === 0) return 0;
  const withIntervention = results.filter(r => r.interventionRequired === true).length;
  return withIntervention / results.length;
}

/**
 * M8: Build an intervention summary from results.
 * Returns map of journeyId → whether intervention was required and why.
 */
export interface InterventionSummary {
  journeyId: string;
  journeyName: string;
  interventionRequired: boolean;
  reason?: string;
}

export function interventionSummary(
  results: JourneyResultWithIntervention[]
): InterventionSummary[] {
  return results.map(r => ({
    journeyId: r.journeyId,
    journeyName: r.journeyName,
    interventionRequired: r.interventionRequired ?? false,
    reason: r.interventionReason,
  }));
}
