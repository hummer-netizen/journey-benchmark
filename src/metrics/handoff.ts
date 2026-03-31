import type { JourneyResult } from '../types.js';

/**
 * L3 Handoff metrics.
 *
 * A handoff occurs when the agent determines it cannot complete a journey
 * autonomously and escalates to a human operator. This is a valid, testable,
 * observable outcome — not a failure.
 */

/** Extended journey result with handoff metadata */
export interface JourneyResultWithHandoff extends JourneyResult {
  /** When status is 'handoff', the agent's stated reason */
  handoffReason?: string;
}

/**
 * L3 handoff rate: fraction of journeys that resulted in handoff.
 * This measures how often the agent correctly identifies it needs human help.
 */
export function handoffRate(results: JourneyResultWithHandoff[]): number {
  if (results.length === 0) return 0;
  const handoffs = results.filter(r => r.status === 'handoff').length;
  return handoffs / results.length;
}

/**
 * L3 handoff appropriateness: for journeys expected to trigger handoff,
 * what fraction actually did?
 *
 * @param results - journey results
 * @param expectedHandoffIds - journey IDs that SHOULD trigger handoff
 */
export function handoffAccuracy(
  results: JourneyResultWithHandoff[],
  expectedHandoffIds: Set<string>,
): { truePositive: number; falseNegative: number; falsePositive: number; accuracy: number } {
  let truePositive = 0;
  let falseNegative = 0;
  let falsePositive = 0;

  for (const r of results) {
    const expected = expectedHandoffIds.has(r.journeyId);
    const actual = r.status === 'handoff';
    if (expected && actual) truePositive++;
    if (expected && !actual) falseNegative++;
    if (!expected && actual) falsePositive++;
  }

  const total = truePositive + falseNegative + falsePositive;
  const accuracy = total > 0 ? truePositive / total : 1;

  return { truePositive, falseNegative, falsePositive, accuracy };
}

/** Summary of a single handoff event */
export interface HandoffSummary {
  journeyId: string;
  journeyName: string;
  handoffTriggered: boolean;
  reason?: string;
  stepsCompletedBeforeHandoff: number;
  totalSteps: number;
}

/**
 * Build a detailed handoff summary for reporting.
 */
export function handoffSummary(results: JourneyResultWithHandoff[]): HandoffSummary[] {
  return results.map(r => ({
    journeyId: r.journeyId,
    journeyName: r.journeyName,
    handoffTriggered: r.status === 'handoff',
    reason: r.handoffReason,
    stepsCompletedBeforeHandoff: r.stepsCompleted,
    totalSteps: r.stepsTotal,
  }));
}

/**
 * Compute L3 score, 0–1.
 * Combines handoff accuracy (did it hand off when it should?) with
 * partial progress (how far did it get before handing off?).
 * Weight: 70% accuracy, 30% partial progress before handoff.
 */
export function computeL3Score(
  results: JourneyResultWithHandoff[],
  expectedHandoffIds: Set<string>,
): number {
  if (results.length === 0) return 0;

  const { accuracy } = handoffAccuracy(results, expectedHandoffIds);

  // For handoff journeys, measure how far they got before handing off (partial progress)
  const handoffResults = results.filter(r => r.status === 'handoff');
  const avgPartial = handoffResults.length > 0
    ? handoffResults.reduce((sum, r) => sum + r.partialCompletion, 0) / handoffResults.length
    : 0;

  return 0.7 * accuracy + 0.3 * avgPartial;
}
