import { describe, it, expect } from 'vitest';
import { MetricCollector } from '../metrics/collector.js';
import type { GoalExecutionResult } from '../types.js';

describe('MetricCollector.measureWithHandoff', () => {
  it('records passed status for completed goals', async () => {
    const collector = new MetricCollector();
    const result = await collector.measureWithHandoff(0, 'test step', async () => ({
      outcome: 'completed' as const,
    }));
    expect(result.status).toBe('passed');
    expect(result.handoffReason).toBeUndefined();
  });

  it('records handoff status with reason', async () => {
    const collector = new MetricCollector();
    const result = await collector.measureWithHandoff(0, 'test step', async () => ({
      outcome: 'handoff' as const,
      handoffReason: 'CAPTCHA detected',
    }));
    expect(result.status).toBe('handoff');
    expect(result.handoffReason).toBe('CAPTCHA detected');
  });

  it('records failed status on thrown error', async () => {
    const collector = new MetricCollector();
    const result = await collector.measureWithHandoff(0, 'test step', async () => {
      throw new Error('Connection refused');
    });
    expect(result.status).toBe('failed');
    expect(result.errorMessage).toBe('Connection refused');
  });

  it('getHandoffCount returns correct count', async () => {
    const collector = new MetricCollector();
    await collector.measure(0, 'step1', async () => {});
    await collector.measureWithHandoff(1, 'step2', async () => ({
      outcome: 'handoff' as const,
      handoffReason: 'SSO wall',
    }));
    await collector.measure(2, 'step3', async () => {});
    expect(collector.getHandoffCount()).toBe(1);
    expect(collector.getCompletedCount()).toBe(2);
  });

  it('measures execution time for handoff steps', async () => {
    const collector = new MetricCollector();
    const result = await collector.measureWithHandoff(0, 'slow step', async () => {
      await new Promise(r => setTimeout(r, 50));
      return { outcome: 'handoff' as const, handoffReason: '2FA' };
    });
    expect(result.executionTimeMs).toBeGreaterThanOrEqual(40);
  });
});
