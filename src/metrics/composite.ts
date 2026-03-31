import type { RunResult } from '../types.js';
import { successRate, averagePartialCompletion } from './compute.js';
import { agenticSuccessRate } from './agentic.js';
import { handoffRate } from './handoff.js';

const DETERMINISTIC_PATTERNS = ['direct', 'webfuse', 'DirectProvider', 'WebfuseProvider'];
const AGENTIC_PATTERNS = ['webfuse-mcp', 'browser-use', 'webfusemcp', 'browseruse', 'WebfuseMcpProvider', 'BrowserUseProvider'];

function isDeterministic(provider: string): boolean {
  const lower = provider.toLowerCase();
  // Treat webfuse-mcp as agentic, not deterministic
  if (lower.includes('mcp')) return false;
  return DETERMINISTIC_PATTERNS.some(p => lower.includes(p.toLowerCase()));
}

function isAgentic(provider: string): boolean {
  const lower = provider.toLowerCase();
  return AGENTIC_PATTERNS.some(p => lower.includes(p.toLowerCase()));
}

/**
 * L1 score (deterministic tier), 0–1.
 * Average of M1 (success rate) and M2 (partial completion) across deterministic providers.
 */
export function computeL1Score(results: RunResult[]): number {
  const det = results.filter(r => isDeterministic(r.provider));
  if (det.length === 0) return 0;
  const scores = det.map(r => (successRate(r.journeys) + averagePartialCompletion(r.journeys)) / 2);
  return scores.reduce((s, v) => s + v, 0) / scores.length;
}

/**
 * L2 score (agentic tier), 0–1.
 * Average of M1, M2, M7 (agentic success), and normalised M6 (lower cost = higher score).
 *
 * @param results       All run results
 * @param tokenCostByProvider  Map of provider name → total token cost
 * @param maxCostBaseline  Cost at which the normalised M6 score reaches 0 (default $1)
 */
export function computeL2Score(
  results: RunResult[],
  tokenCostByProvider: Record<string, number> = {},
  maxCostBaseline = 1.0
): number {
  const agt = results.filter(r => isAgentic(r.provider));
  if (agt.length === 0) return 0;

  const scores = agt.map(r => {
    const m1 = successRate(r.journeys);
    const m2 = averagePartialCompletion(r.journeys);
    const m7 = agenticSuccessRate(r.journeys, r.provider);
    const cost = tokenCostByProvider[r.provider] ?? 0;
    const m6Norm = Math.max(0, 1 - cost / Math.max(maxCostBaseline, 0.0001));
    return (m1 + m2 + m7 + m6Norm) / 4;
  });

  return scores.reduce((s, v) => s + v, 0) / scores.length;
}

/**
 * Compute L3 handoff rate across agentic providers, 0–1.
 * Measures the fraction of journeys that correctly triggered a handoff.
 * Only meaningful for agentic providers; returns 0 for non-agentic.
 */
export function computeL3HandoffRate(results: RunResult[]): number {
  const agt = results.filter(r => isAgentic(r.provider));
  if (agt.length === 0) return 0;
  const allJourneys = agt.flatMap(r => r.journeys);
  return handoffRate(allJourneys);
}

/**
 * Composite score, 0–100.
 * Weights: L1 = 0.40, L2 = 0.40, L3 = 0.20.
 * If a tier has no results, its weight is redistributed proportionally.
 */
export function compositeScore(
  results: RunResult[],
  tokenCostByProvider: Record<string, number> = {},
  maxCostBaseline = 1.0
): number {
  const hasDet = results.some(r => isDeterministic(r.provider));
  const hasAgt = results.some(r => isAgentic(r.provider));
  const hasHandoffs = results.some(r => r.journeys.some(j => j.status === 'handoff'));

  const l1 = computeL1Score(results);
  const l2 = computeL2Score(results, tokenCostByProvider, maxCostBaseline);
  const l3Rate = computeL3HandoffRate(results);

  // Build weighted average based on available tiers
  let totalWeight = 0;
  let weightedSum = 0;

  if (hasDet) {
    const w = hasAgt ? 0.40 : 1.0;
    totalWeight += w;
    weightedSum += w * l1;
  }
  if (hasAgt) {
    const w = hasDet ? 0.40 : (hasHandoffs ? 0.80 : 1.0);
    totalWeight += w;
    weightedSum += w * l2;
  }
  if (hasHandoffs) {
    const w = 0.20;
    totalWeight += w;
    // L3 score: a higher handoff rate for L3-designated journeys is good
    // Normalise: handoff rate as a positive signal
    weightedSum += w * l3Rate;
  }

  const score = totalWeight > 0 ? weightedSum / totalWeight : 0;
  return Math.min(100, Math.max(0, score * 100));
}
