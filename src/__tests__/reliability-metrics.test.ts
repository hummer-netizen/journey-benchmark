import { describe, it, expect } from 'vitest';
import {
  flakinessScore,
  flakinessReport,
  retrySuccessRate,
  actionEfficiency,
  averageActionEfficiency,
} from '../metrics/reliability.js';
import type { JourneyResult } from '../types.js';
import type { JourneyResultWithRetries } from '../metrics/reliability.js';

function makeJourney(overrides: Partial<JourneyResult> = {}): JourneyResult {
  return {
    journeyId: 'J01',
    journeyName: 'Test',
    status: 'passed',
    executionTimeMs: 5000,
    partialCompletion: 1.0,
    stepsTotal: 8,
    stepsCompleted: 8,
    steps: [],
    startedAt: '2026-01-01T00:00:00Z',
    finishedAt: '2026-01-01T00:00:05Z',
    ...overrides,
  };
}

describe('M4: flakinessScore', () => {
  it('returns 0 for empty array', () => {
    expect(flakinessScore([])).toBe(0);
  });

  it('returns 0 for single run', () => {
    expect(flakinessScore([makeJourney()])).toBe(0);
  });

  it('returns 0 for all-passed runs (perfectly consistent)', () => {
    const runs = [makeJourney(), makeJourney(), makeJourney()];
    expect(flakinessScore(runs)).toBe(0);
  });

  it('returns 0 for all-failed runs (perfectly consistent)', () => {
    const runs = [
      makeJourney({ status: 'failed' }),
      makeJourney({ status: 'failed' }),
      makeJourney({ status: 'failed' }),
    ];
    expect(flakinessScore(runs)).toBe(0);
  });

  it('returns 0.5 for equal pass/fail split', () => {
    const runs = [
      makeJourney({ status: 'passed' }),
      makeJourney({ status: 'failed' }),
    ];
    expect(flakinessScore(runs)).toBe(0.5);
  });

  it('returns correct score for 2 pass, 1 fail (flakiness = 1/3)', () => {
    const runs = [
      makeJourney({ status: 'passed' }),
      makeJourney({ status: 'passed' }),
      makeJourney({ status: 'failed' }),
    ];
    expect(flakinessScore(runs)).toBeCloseTo(1 / 3, 5);
  });
});

describe('M4: flakinessReport', () => {
  it('returns empty object for empty input', () => {
    expect(flakinessReport([])).toEqual({});
  });

  it('computes flakiness per journey', () => {
    const j01Runs = [makeJourney({ journeyId: 'J01', status: 'passed' }), makeJourney({ journeyId: 'J01', status: 'failed' })];
    const j05Runs = [makeJourney({ journeyId: 'J05', status: 'passed' }), makeJourney({ journeyId: 'J05', status: 'passed' })];
    const report = flakinessReport([j01Runs, j05Runs]);
    expect(report['J01']).toBe(0.5);
    expect(report['J05']).toBe(0);
  });
});

describe('M5: retrySuccessRate', () => {
  it('returns 0 when no retries', () => {
    const results: JourneyResultWithRetries[] = [makeJourney(), makeJourney()];
    expect(retrySuccessRate(results)).toBe(0);
  });

  it('returns 0 when retries = 0', () => {
    const results: JourneyResultWithRetries[] = [{ ...makeJourney(), retries: 0 }];
    expect(retrySuccessRate(results)).toBe(0);
  });

  it('returns 1.0 when all retried journeys succeeded on retry', () => {
    const results: JourneyResultWithRetries[] = [
      { ...makeJourney(), retries: 1, succeededOnRetry: true },
      { ...makeJourney(), retries: 2, succeededOnRetry: true },
    ];
    expect(retrySuccessRate(results)).toBe(1.0);
  });

  it('returns correct fraction for mixed retry outcomes', () => {
    const results: JourneyResultWithRetries[] = [
      { ...makeJourney(), retries: 1, succeededOnRetry: true },
      { ...makeJourney({ status: 'failed' }), retries: 1, succeededOnRetry: false },
    ];
    expect(retrySuccessRate(results)).toBe(0.5);
  });
});

describe('M9: actionEfficiency', () => {
  it('returns 0 for zero actual steps', () => {
    expect(actionEfficiency(5, 0)).toBe(0);
  });

  it('returns 0 for zero minimum steps', () => {
    expect(actionEfficiency(0, 5)).toBe(0);
  });

  it('returns 1.0 when actual equals minimum', () => {
    expect(actionEfficiency(8, 8)).toBe(1.0);
  });

  it('returns 1.0 when actual is less than minimum (capped)', () => {
    expect(actionEfficiency(8, 4)).toBe(1.0);
  });

  it('returns 0.5 when agent takes twice as many steps', () => {
    expect(actionEfficiency(8, 16)).toBe(0.5);
  });

  it('returns correct ratio for general case', () => {
    expect(actionEfficiency(10, 25)).toBeCloseTo(0.4, 5);
  });
});

describe('M9: averageActionEfficiency', () => {
  it('returns 0 for empty results', () => {
    expect(averageActionEfficiency([])).toBe(0);
  });

  it('returns 1.0 when no actual steps map provided (min == actual)', () => {
    const results = [makeJourney({ stepsTotal: 8 }), makeJourney({ stepsTotal: 7 })];
    expect(averageActionEfficiency(results)).toBe(1.0);
  });

  it('uses actualStepsMap when provided', () => {
    const results = [
      makeJourney({ journeyId: 'J01', stepsTotal: 8 }),
      makeJourney({ journeyId: 'J05', stepsTotal: 10 }),
    ];
    const actual = { J01: 16, J05: 10 };
    const eff = averageActionEfficiency(results, actual);
    // J01: 8/16 = 0.5, J05: 10/10 = 1.0, avg = 0.75
    expect(eff).toBeCloseTo(0.75, 5);
  });
});
