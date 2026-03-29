import { describe, it, expect } from 'vitest';
import { compositeScore, computeL1Score, computeL2Score } from '../metrics/composite.js';
import type { RunResult, JourneyResult } from '../types.js';

function makeJourney(overrides: Partial<JourneyResult> = {}): JourneyResult {
  return {
    journeyId: 'J01',
    journeyName: 'Test',
    status: 'passed',
    executionTimeMs: 5000,
    partialCompletion: 1.0,
    stepsTotal: 5,
    stepsCompleted: 5,
    steps: [],
    startedAt: '2026-01-01T00:00:00Z',
    finishedAt: '2026-01-01T00:00:05Z',
    ...overrides,
  };
}

function makeRun(provider: string, journeys: JourneyResult[]): RunResult {
  return {
    startedAt: '2026-01-01T00:00:00Z',
    finishedAt: '2026-01-01T00:01:00Z',
    provider,
    site: 'webarena',
    targetUrl: 'http://localhost:7770',
    totalJourneys: journeys.length,
    passed: journeys.filter(j => j.status === 'passed').length,
    failed: journeys.filter(j => j.status !== 'passed').length,
    journeys,
  };
}

describe('computeL1Score', () => {
  it('returns 0 with no deterministic providers', () => {
    const results = [makeRun('webfuse-mcp', [makeJourney()])];
    expect(computeL1Score(results)).toBe(0);
  });

  it('returns 1.0 for perfect deterministic run', () => {
    const results = [makeRun('direct', [makeJourney(), makeJourney()])];
    expect(computeL1Score(results)).toBeCloseTo(1.0, 5);
  });

  it('averages M1 and M2 for a partially-passing run', () => {
    const journeys = [
      makeJourney({ status: 'passed', partialCompletion: 1.0 }),
      makeJourney({ status: 'failed', partialCompletion: 0.5 }),
    ];
    const results = [makeRun('direct', journeys)];
    const m1 = 0.5; // 1/2 passed
    const m2 = 0.75; // (1.0 + 0.5) / 2
    expect(computeL1Score(results)).toBeCloseTo((m1 + m2) / 2, 5);
  });

  it('handles webfuse provider as deterministic', () => {
    const results = [makeRun('WebfuseProvider', [makeJourney()])];
    expect(computeL1Score(results)).toBeCloseTo(1.0, 5);
  });

  it('does NOT treat webfuse-mcp as deterministic', () => {
    const results = [makeRun('webfuse-mcp', [makeJourney()])];
    expect(computeL1Score(results)).toBe(0);
  });
});

describe('computeL2Score', () => {
  it('returns 0 with no agentic providers', () => {
    const results = [makeRun('direct', [makeJourney()])];
    expect(computeL2Score(results)).toBe(0);
  });

  it('returns high score for perfect agentic run with zero cost', () => {
    const results = [makeRun('webfuse-mcp', [makeJourney()])];
    // M1=1, M2=1, M7=1, M6_norm=1 (cost=0) → average = 1.0
    const score = computeL2Score(results, { 'webfuse-mcp': 0 });
    expect(score).toBeCloseTo(1.0, 5);
  });

  it('penalises high token cost', () => {
    const results = [makeRun('browser-use', [makeJourney()])];
    const lowCost = computeL2Score(results, { 'browser-use': 0 }, 1.0);
    const highCost = computeL2Score(results, { 'browser-use': 1.0 }, 1.0);
    expect(lowCost).toBeGreaterThan(highCost);
  });

  it('clamps M6_norm to 0 when cost exceeds baseline', () => {
    const results = [makeRun('webfuse-mcp', [makeJourney()])];
    // cost > baseline → M6_norm = 0
    const score = computeL2Score(results, { 'webfuse-mcp': 999 }, 1.0);
    // M1=1, M2=1, M7=1, M6_norm=0 → (1+1+1+0)/4 = 0.75
    expect(score).toBeCloseTo(0.75, 5);
  });
});

describe('compositeScore', () => {
  it('returns 0 for empty results', () => {
    expect(compositeScore([])).toBe(0);
  });

  it('scales to 0-100', () => {
    const results = [makeRun('direct', [makeJourney()])];
    const score = compositeScore(results);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('returns 100 for perfect deterministic-only run', () => {
    const results = [makeRun('direct', [makeJourney()])];
    expect(compositeScore(results)).toBeCloseTo(100, 5);
  });

  it('uses full L1 weight when only deterministic providers present', () => {
    const journeys = [makeJourney({ status: 'failed', partialCompletion: 0 })];
    const results = [makeRun('direct', journeys)];
    // M1=0, M2=0 → L1=0 → score=0
    expect(compositeScore(results)).toBeCloseTo(0, 5);
  });

  it('uses full L2 weight when only agentic providers present', () => {
    const results = [makeRun('webfuse-mcp', [makeJourney()])];
    const score = compositeScore(results, { 'webfuse-mcp': 0 }, 1.0);
    // L2=1.0 → 100
    expect(score).toBeCloseTo(100, 5);
  });

  it('averages L1 and L2 when both tiers present', () => {
    const results = [
      makeRun('direct', [makeJourney()]),        // L1=1.0
      makeRun('webfuse-mcp', [makeJourney()]),    // L2=1.0
    ];
    const score = compositeScore(results, { 'webfuse-mcp': 0 }, 1.0);
    expect(score).toBeCloseTo(100, 5);
  });

  it('mixes partial L1 and L2 correctly', () => {
    const failedJourney = makeJourney({ status: 'failed', partialCompletion: 0 });
    const results = [
      makeRun('direct', [failedJourney]),         // L1=0
      makeRun('webfuse-mcp', [makeJourney()]),    // L2=1.0
    ];
    const score = compositeScore(results, { 'webfuse-mcp': 0 }, 1.0);
    // 0.5 * 0 + 0.5 * 1.0 = 0.5 → 50
    expect(score).toBeCloseTo(50, 5);
  });
});
