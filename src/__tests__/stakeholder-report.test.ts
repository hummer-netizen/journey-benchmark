import { describe, it, expect } from 'vitest';
import { buildStakeholderReport, buildStakeholderMarkdown } from '../reporter/stakeholder.js';
import type { RunResult } from '../types.js';

function makeRunResult(provider: string, overrides: Partial<RunResult> = {}): RunResult {
  return {
    startedAt: '2026-01-01T00:00:00Z',
    finishedAt: '2026-01-01T00:05:00Z',
    provider,
    site: 'webarena',
    targetUrl: 'http://localhost:7770',
    totalJourneys: 3,
    passed: 3,
    failed: 0,
    journeys: [
      {
        journeyId: 'J01',
        journeyName: 'Product Purchase',
        status: 'passed',
        executionTimeMs: 10000,
        partialCompletion: 1.0,
        stepsTotal: 7,
        stepsCompleted: 7,
        steps: [],
        startedAt: '2026-01-01T00:00:00Z',
        finishedAt: '2026-01-01T00:00:10Z',
      },
      {
        journeyId: 'J05',
        journeyName: 'Flight Booking',
        status: 'passed',
        executionTimeMs: 8000,
        partialCompletion: 1.0,
        stepsTotal: 8,
        stepsCompleted: 8,
        steps: [],
        startedAt: '2026-01-01T00:00:10Z',
        finishedAt: '2026-01-01T00:00:18Z',
      },
      {
        journeyId: 'J12',
        journeyName: 'Government Long Form (4-page)',
        status: 'passed',
        executionTimeMs: 15000,
        partialCompletion: 1.0,
        stepsTotal: 12,
        stepsCompleted: 12,
        steps: [],
        startedAt: '2026-01-01T00:00:18Z',
        finishedAt: '2026-01-01T00:00:33Z',
      },
    ],
    ...overrides,
  };
}

describe('buildStakeholderReport', () => {
  it('returns empty report for no results', () => {
    const report = buildStakeholderReport([]);
    expect(report.executiveSummary).toBe('No results available.');
    expect(report.providerRanking).toHaveLength(0);
    expect(report.journeyFindings).toHaveLength(0);
  });

  it('produces correct provider ranking for single provider', () => {
    const result = makeRunResult('direct');
    const report = buildStakeholderReport([result]);
    expect(report.providerRanking).toHaveLength(1);
    expect(report.providerRanking[0]!.provider).toBe('direct');
    expect(report.providerRanking[0]!.rank).toBe(1);
    expect(report.providerRanking[0]!.successRate).toBe(1.0);
  });

  it('ranks providers correctly by score', () => {
    const directResult = makeRunResult('direct');
    const agentResult = makeRunResult('browser-use', {
      passed: 1,
      failed: 2,
      journeys: [
        { ...directResult.journeys[0]!, status: 'passed' },
        { ...directResult.journeys[1]!, status: 'failed' },
        { ...directResult.journeys[2]!, status: 'failed' },
      ],
    });
    const report = buildStakeholderReport([directResult, agentResult]);
    expect(report.providerRanking[0]!.provider).toBe('direct');
    expect(report.providerRanking[1]!.provider).toBe('browser-use');
    expect(report.providerRanking[0]!.rank).toBe(1);
    expect(report.providerRanking[1]!.rank).toBe(2);
  });

  it('produces journey findings with correct categories', () => {
    const report = buildStakeholderReport([makeRunResult('direct')]);
    const j01 = report.journeyFindings.find(j => j.journeyId === 'J01');
    expect(j01?.category).toBe('E-Commerce');
    const j12 = report.journeyFindings.find(j => j.journeyId === 'J12');
    expect(j12?.category).toBe('Government Services');
    const j05 = report.journeyFindings.find(j => j.journeyId === 'J05');
    expect(j05?.category).toBe('Travel');
  });

  it('includes executive summary with key stats', () => {
    const report = buildStakeholderReport([makeRunResult('direct')]);
    expect(report.executiveSummary).toContain('1 provider');
    expect(report.executiveSummary).toContain('100.0%');
  });

  it('includes recommendations', () => {
    const report = buildStakeholderReport([makeRunResult('direct')]);
    expect(report.recommendations.length).toBeGreaterThan(0);
  });
});

describe('buildStakeholderMarkdown', () => {
  it('produces valid markdown with all sections', () => {
    const report = buildStakeholderReport([makeRunResult('direct')]);
    const md = buildStakeholderMarkdown(report);
    expect(md).toContain('# Stakeholder Summary Report');
    expect(md).toContain('## Executive Summary');
    expect(md).toContain('## Provider Ranking');
    expect(md).toContain('## Journey Findings');
    expect(md).toContain('## Recommendations');
  });

  it('includes provider name in ranking table', () => {
    const report = buildStakeholderReport([makeRunResult('direct')]);
    const md = buildStakeholderMarkdown(report);
    expect(md).toContain('direct');
  });

  it('includes journey categories', () => {
    const report = buildStakeholderReport([makeRunResult('direct')]);
    const md = buildStakeholderMarkdown(report);
    expect(md).toContain('E-Commerce');
    expect(md).toContain('Government Services');
  });
});
