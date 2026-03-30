import { describe, it, expect } from 'vitest';
import { flakinessScore, flakinessReport } from '../metrics/reliability.js';
import type { JourneyResult } from '../types.js';

function makeRun(journeyId: string, status: 'passed' | 'failed' | 'error'): JourneyResult {
  return {
    journeyId,
    journeyName: `Journey ${journeyId}`,
    status,
    executionTimeMs: 5000,
    partialCompletion: status === 'passed' ? 1.0 : 0.5,
    stepsTotal: 5,
    stepsCompleted: status === 'passed' ? 5 : 2,
    steps: [],
    startedAt: '2026-01-01T00:00:00Z',
    finishedAt: '2026-01-01T00:00:05Z',
  };
}

describe('Flakiness Assessment (M4)', () => {
  describe('flakinessScore edge cases', () => {
    it('handles all-error runs as failed', () => {
      const runs = [
        makeRun('J01', 'error'),
        makeRun('J01', 'passed'),
        makeRun('J01', 'error'),
      ];
      const score = flakinessScore(runs);
      // 1 passed, 2 failed/error → majority is non-passed (2/3) → consistency = 2/3 → flakiness = 1/3
      expect(score).toBeCloseTo(1 / 3, 5);
    });

    it('returns 0 for 5 consecutive passes (N=5 scenario)', () => {
      const runs = Array.from({ length: 5 }, () => makeRun('J12', 'passed'));
      expect(flakinessScore(runs)).toBe(0);
    });

    it('returns 0.4 for 2 failures in 5 runs', () => {
      const runs = [
        makeRun('J12', 'passed'),
        makeRun('J12', 'passed'),
        makeRun('J12', 'passed'),
        makeRun('J12', 'failed'),
        makeRun('J12', 'failed'),
      ];
      expect(flakinessScore(runs)).toBeCloseTo(0.4, 5);
    });
  });

  describe('flakinessReport with multiple journeys', () => {
    it('handles mixed flakiness across journeys', () => {
      const j12Runs = Array.from({ length: 5 }, (_, i) => makeRun('J12', i < 4 ? 'passed' : 'failed'));
      const j17Runs = Array.from({ length: 5 }, (_, i) => makeRun('J17', i % 2 === 0 ? 'passed' : 'failed'));
      const report = flakinessReport([j12Runs, j17Runs]);
      // J12: 4 pass, 1 fail → majority 4/5 → flakiness = 1/5 = 0.2
      expect(report['J12']).toBeCloseTo(0.2, 5);
      // J17: 3 pass, 2 fail → majority 3/5 → flakiness = 1 - 3/5 = 0.4
      expect(report['J17']).toBeCloseTo(0.4, 5);
    });

    it('ignores empty run sets', () => {
      const report = flakinessReport([[], [makeRun('J01', 'passed')]]);
      expect(report['J01']).toBe(0);
      expect(Object.keys(report)).not.toContain('');
    });
  });
});
