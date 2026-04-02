import { describe, it, expect } from 'vitest';
import { interventionRate, interventionSummary } from '../metrics/agentic-advanced.js';
import type { JourneyResultWithIntervention } from '../metrics/agentic-advanced.js';
import type { JourneyResult } from '../types.js';

function makeJourney(overrides: Partial<JourneyResult> = {}): JourneyResultWithIntervention {
  return {
    journeyId: 'J01',
    journeyName: 'Test Journey',
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

describe('M8: interventionRate', () => {
  it('returns 0 for empty array', () => {
    expect(interventionRate([])).toBe(0);
  });

  it('returns 0 when no interventions required', () => {
    const results = [
      makeJourney({ interventionRequired: false } as Partial<JourneyResultWithIntervention>),
      makeJourney(),
    ];
    expect(interventionRate(results)).toBe(0);
  });

  it('returns 1.0 when all journeys required intervention', () => {
    const results = [
      makeJourney({ interventionRequired: true } as Partial<JourneyResultWithIntervention>),
      makeJourney({ interventionRequired: true } as Partial<JourneyResultWithIntervention>),
    ];
    expect(interventionRate(results)).toBe(1.0);
  });

  it('returns correct fraction for mixed results', () => {
    const results = [
      makeJourney({ interventionRequired: true } as Partial<JourneyResultWithIntervention>),
      makeJourney({ interventionRequired: false } as Partial<JourneyResultWithIntervention>),
      makeJourney({ interventionRequired: true } as Partial<JourneyResultWithIntervention>),
      makeJourney({ interventionRequired: false } as Partial<JourneyResultWithIntervention>),
    ];
    expect(interventionRate(results)).toBe(0.5);
  });

  it('returns 0 when interventionRequired is undefined', () => {
    const results = [makeJourney(), makeJourney()];
    expect(interventionRate(results)).toBe(0);
  });
});

describe('M8: interventionSummary', () => {
  it('returns empty array for empty input', () => {
    expect(interventionSummary([])).toEqual([]);
  });

  it('maps each result to summary with correct fields', () => {
    const results: JourneyResultWithIntervention[] = [
      { ...makeJourney({ journeyId: 'J01', journeyName: 'Product Purchase' }), interventionRequired: true, interventionReason: 'CAPTCHA appeared' },
      { ...makeJourney({ journeyId: 'J05', journeyName: 'Flight Booking' }), interventionRequired: false },
    ];
    const summary = interventionSummary(results);
    expect(summary).toHaveLength(2);
    expect(summary[0]).toMatchObject({
      journeyId: 'J01',
      journeyName: 'Product Purchase',
      interventionRequired: true,
      reason: 'CAPTCHA appeared',
    });
    expect(summary[1]).toMatchObject({
      journeyId: 'J05',
      interventionRequired: false,
      reason: undefined,
    });
  });
});
