import { describe, it, expect } from 'vitest';
import { successRate, averagePartialCompletion, totalExecutionTime, averageJourneyTime } from '../metrics/compute.js';
import type { JourneyResult, RunResult } from '../types.js';

function makeJourney(overrides: Partial<JourneyResult> = {}): JourneyResult {
  return {
    journeyId: 'J01',
    journeyName: 'Test Journey',
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

describe('Metrics', () => {
  describe('successRate (M1)', () => {
    it('returns 1.0 for all passed journeys', () => {
      const journeys = [makeJourney(), makeJourney(), makeJourney()];
      expect(successRate(journeys)).toBe(1.0);
    });

    it('returns 0.0 for all failed journeys', () => {
      const journeys = [
        makeJourney({ status: 'failed' }),
        makeJourney({ status: 'error' }),
      ];
      expect(successRate(journeys)).toBe(0.0);
    });

    it('returns correct ratio for mixed results', () => {
      const journeys = [
        makeJourney({ status: 'passed' }),
        makeJourney({ status: 'failed' }),
        makeJourney({ status: 'passed' }),
        makeJourney({ status: 'error' }),
      ];
      expect(successRate(journeys)).toBe(0.5);
    });

    it('returns 0 for empty array', () => {
      expect(successRate([])).toBe(0);
    });
  });

  describe('averagePartialCompletion (M2)', () => {
    it('returns 1.0 for fully completed journeys', () => {
      const journeys = [
        makeJourney({ partialCompletion: 1.0 }),
        makeJourney({ partialCompletion: 1.0 }),
      ];
      expect(averagePartialCompletion(journeys)).toBe(1.0);
    });

    it('computes correct average', () => {
      const journeys = [
        makeJourney({ partialCompletion: 0.8 }),
        makeJourney({ partialCompletion: 0.6 }),
      ];
      expect(averagePartialCompletion(journeys)).toBeCloseTo(0.7, 5);
    });

    it('returns 0 for empty array', () => {
      expect(averagePartialCompletion([])).toBe(0);
    });
  });

  describe('totalExecutionTime', () => {
    it('sums execution time from all journeys', () => {
      const result: RunResult = {
        startedAt: '2026-01-01T00:00:00Z',
        finishedAt: '2026-01-01T00:01:00Z',
        provider: 'test',
        site: 'webarena',
        targetUrl: 'http://localhost:7770',
        totalJourneys: 3,
        passed: 3,
        failed: 0,
        journeys: [
          makeJourney({ executionTimeMs: 1000 }),
          makeJourney({ executionTimeMs: 2000 }),
          makeJourney({ executionTimeMs: 3000 }),
        ],
      };
      expect(totalExecutionTime(result)).toBe(60000);
    });
  });

  describe('averageJourneyTime (M3)', () => {
    it('computes correct average', () => {
      const journeys = [
        makeJourney({ executionTimeMs: 10000 }),
        makeJourney({ executionTimeMs: 20000 }),
      ];
      expect(averageJourneyTime(journeys)).toBe(15000);
    });

    it('returns 0 for empty array', () => {
      expect(averageJourneyTime([])).toBe(0);
    });
  });
});
