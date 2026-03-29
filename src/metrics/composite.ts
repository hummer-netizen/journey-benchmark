import type { RunResult } from '../types.js';
import { successRate, averagePartialCompletion } from './compute.js';
import { agenticSuccessRate } from './agentic.js';

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
 * Composite score, 0–100.
 * Weights: L1 = 0.50, L2 = 0.50.
 * If only one tier has results, that tier carries the full weight.
 */
export function compositeScore(
  results: RunResult[],
  tokenCostByProvider: Record<string, number> = {},
  maxCostBaseline = 1.0
): number {
  const hasDet = results.some(r => isDeterministic(r.provider));
  const hasAgt = results.some(r => isAgentic(r.provider));

  const l1 = computeL1Score(results);
  const l2 = computeL2Score(results, tokenCostByProvider, maxCostBaseline);

  let score: number;
  if (hasDet && hasAgt) {
    score = 0.5 * l1 + 0.5 * l2;
  } else if (hasDet) {
    score = l1;
  } else if (hasAgt) {
    score = l2;
  } else {
    score = 0;
  }

  return Math.min(100, Math.max(0, score * 100));
}
