import { describe, it, expect } from 'vitest';
import {
  handoffRate,
  handoffAccuracy,
  handoffSummary,
  computeL3Score,
} from '../metrics/handoff.js';
import type { JourneyResultWithHandoff } from '../metrics/handoff.js';

function makeResult(overrides: Partial<JourneyResultWithHandoff> = {}): JourneyResultWithHandoff {
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

describe('handoffRate', () => {
  it('returns 0 for empty results', () => {
    expect(handoffRate([])).toBe(0);
  });

  it('returns 0 when no handoffs', () => {
    const results = [makeResult(), makeResult({ journeyId: 'J02' })];
    expect(handoffRate(results)).toBe(0);
  });

  it('returns 1 when all handoffs', () => {
    const results = [
      makeResult({ status: 'handoff', handoffReason: 'CAPTCHA' }),
      makeResult({ journeyId: 'J02', status: 'handoff', handoffReason: 'SSO' }),
    ];
    expect(handoffRate(results)).toBe(1);
  });

  it('returns correct fraction for mixed results', () => {
    const results = [
      makeResult({ journeyId: 'J01', status: 'passed' }),
      makeResult({ journeyId: 'J02', status: 'handoff', handoffReason: 'Auth wall' }),
      makeResult({ journeyId: 'J03', status: 'failed' }),
    ];
    expect(handoffRate(results)).toBeCloseTo(1 / 3, 5);
  });
});

describe('handoffAccuracy', () => {
  it('returns perfect accuracy when all expected handoffs fire', () => {
    const results = [
      makeResult({ journeyId: 'J05-L3', status: 'handoff' }),
      makeResult({ journeyId: 'J08-L3', status: 'handoff' }),
      makeResult({ journeyId: 'J01', status: 'passed' }),
    ];
    const expected = new Set(['J05-L3', 'J08-L3']);
    const { truePositive, falseNegative, falsePositive, accuracy } = handoffAccuracy(results, expected);
    expect(truePositive).toBe(2);
    expect(falseNegative).toBe(0);
    expect(falsePositive).toBe(0);
    expect(accuracy).toBe(1);
  });

  it('detects false negatives (expected handoff but passed)', () => {
    const results = [
      makeResult({ journeyId: 'J05-L3', status: 'passed' }),  // should have handed off
      makeResult({ journeyId: 'J08-L3', status: 'handoff' }),
    ];
    const expected = new Set(['J05-L3', 'J08-L3']);
    const { truePositive, falseNegative, accuracy } = handoffAccuracy(results, expected);
    expect(truePositive).toBe(1);
    expect(falseNegative).toBe(1);
    expect(accuracy).toBe(0.5);
  });

  it('detects false positives (unexpected handoff)', () => {
    const results = [
      makeResult({ journeyId: 'J01', status: 'handoff' }),  // should NOT have handed off
      makeResult({ journeyId: 'J05-L3', status: 'handoff' }),
    ];
    const expected = new Set(['J05-L3']);
    const { truePositive, falsePositive, accuracy } = handoffAccuracy(results, expected);
    expect(truePositive).toBe(1);
    expect(falsePositive).toBe(1);
    expect(accuracy).toBe(0.5);
  });

  it('returns accuracy=1 when no expected handoffs and none fired', () => {
    const results = [makeResult({ journeyId: 'J01', status: 'passed' })];
    const { accuracy } = handoffAccuracy(results, new Set());
    expect(accuracy).toBe(1);
  });
});

describe('handoffSummary', () => {
  it('produces correct summary entries', () => {
    const results = [
      makeResult({
        journeyId: 'J05-L3',
        journeyName: 'Flight Booking L3',
        status: 'handoff',
        handoffReason: 'SSO wall',
        stepsCompleted: 2,
        stepsTotal: 4,
      }),
      makeResult({
        journeyId: 'J01',
        journeyName: 'Product Purchase',
        status: 'passed',
        stepsCompleted: 5,
        stepsTotal: 5,
      }),
    ];

    const summary = handoffSummary(results);
    expect(summary).toHaveLength(2);
    expect(summary[0]).toEqual({
      journeyId: 'J05-L3',
      journeyName: 'Flight Booking L3',
      handoffTriggered: true,
      reason: 'SSO wall',
      stepsCompletedBeforeHandoff: 2,
      totalSteps: 4,
    });
    expect(summary[1]).toEqual({
      journeyId: 'J01',
      journeyName: 'Product Purchase',
      handoffTriggered: false,
      reason: undefined,
      stepsCompletedBeforeHandoff: 5,
      totalSteps: 5,
    });
  });
});

describe('computeL3Score', () => {
  it('returns 0 for empty results', () => {
    expect(computeL3Score([], new Set())).toBe(0);
  });

  it('returns high score when expected handoffs fire correctly', () => {
    const results = [
      makeResult({
        journeyId: 'J05-L3',
        status: 'handoff',
        partialCompletion: 0.5,
      }),
      makeResult({
        journeyId: 'J08-L3',
        status: 'handoff',
        partialCompletion: 0.75,
      }),
      makeResult({
        journeyId: 'J01',
        status: 'passed',
        partialCompletion: 1.0,
      }),
    ];
    const expected = new Set(['J05-L3', 'J08-L3']);
    const score = computeL3Score(results, expected);
    // accuracy = 1.0, avgPartial = (0.5 + 0.75) / 2 = 0.625
    // L3 = 0.7 * 1.0 + 0.3 * 0.625 = 0.7 + 0.1875 = 0.8875
    expect(score).toBeCloseTo(0.8875, 3);
  });

  it('penalises missed handoffs', () => {
    const results = [
      makeResult({
        journeyId: 'J05-L3',
        status: 'passed',  // should have handed off
        partialCompletion: 1.0,
      }),
    ];
    const expected = new Set(['J05-L3']);
    const score = computeL3Score(results, expected);
    // accuracy = 0/1 = 0, no handoffs → avgPartial = 0
    // L3 = 0.7 * 0 + 0.3 * 0 = 0
    expect(score).toBe(0);
  });
});
