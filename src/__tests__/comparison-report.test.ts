import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  buildComparisonReport,
  buildComparisonMarkdown,
  generateComparisonReport,
} from '../reporter/comparison.js';
import type { RunResult, JourneyResult } from '../types.js';

function makeJourney(id: string, overrides: Partial<JourneyResult> = {}): JourneyResult {
  return {
    journeyId: id,
    journeyName: `Journey ${id}`,
    status: 'passed',
    executionTimeMs: 3000,
    partialCompletion: 1.0,
    stepsTotal: 5,
    stepsCompleted: 5,
    steps: [],
    startedAt: '2026-01-01T00:00:00Z',
    finishedAt: '2026-01-01T00:00:03Z',
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

describe('buildComparisonReport', () => {
  it('lists all providers', () => {
    const results = [
      makeRun('direct', [makeJourney('J01')]),
      makeRun('webfuse', [makeJourney('J01')]),
    ];
    const report = buildComparisonReport(results);
    expect(report.providers).toEqual(['direct', 'webfuse']);
  });

  it('creates a row for each unique journey', () => {
    const results = [
      makeRun('direct', [makeJourney('J01'), makeJourney('J04')]),
      makeRun('webfuse', [makeJourney('J01'), makeJourney('J04')]),
    ];
    const report = buildComparisonReport(results);
    expect(report.rows).toHaveLength(2);
    expect(report.rows.map(r => r.journeyId)).toContain('J01');
    expect(report.rows.map(r => r.journeyId)).toContain('J04');
  });

  it('populates cells with status and timing', () => {
    const results = [
      makeRun('direct', [makeJourney('J01', { status: 'failed', partialCompletion: 0.5 })]),
      makeRun('webfuse', [makeJourney('J01', { status: 'passed', partialCompletion: 1.0 })]),
    ];
    const report = buildComparisonReport(results);
    const j01 = report.rows.find(r => r.journeyId === 'J01')!;
    expect(j01.cells['direct']!.status).toBe('failed');
    expect(j01.cells['direct']!.partialCompletion).toBe(0.5);
    expect(j01.cells['webfuse']!.status).toBe('passed');
    expect(j01.cells['webfuse']!.successRate).toBe(1);
  });

  it('marks missing provider cells as absent', () => {
    const results = [
      makeRun('direct', [makeJourney('J01')]),
      makeRun('webfuse', [makeJourney('J04')]),
    ];
    const report = buildComparisonReport(results);
    const j01 = report.rows.find(r => r.journeyId === 'J01')!;
    expect(j01.cells['webfuse']).toBeUndefined();
  });

  it('includes token costs in summary when provided', () => {
    const results = [makeRun('webfuse-mcp', [makeJourney('J01')])];
    const report = buildComparisonReport(results, { 'webfuse-mcp': 0.05 });
    expect(report.summary['webfuse-mcp']!.totalTokenCost).toBeCloseTo(0.05, 6);
  });

  it('computes correct success rate in summary', () => {
    const results = [
      makeRun('direct', [
        makeJourney('J01', { status: 'passed' }),
        makeJourney('J04', { status: 'failed' }),
      ]),
    ];
    const report = buildComparisonReport(results);
    expect(report.summary['direct']!.successRate).toBeCloseTo(0.5, 5);
  });
});

describe('buildComparisonMarkdown', () => {
  it('includes provider names in the header', () => {
    const results = [
      makeRun('direct', [makeJourney('J01')]),
      makeRun('webfuse', [makeJourney('J01')]),
    ];
    const report = buildComparisonReport(results);
    const md = buildComparisonMarkdown(report);
    expect(md).toContain('direct');
    expect(md).toContain('webfuse');
  });

  it('contains summary section', () => {
    const results = [makeRun('direct', [makeJourney('J01')])];
    const report = buildComparisonReport(results);
    const md = buildComparisonMarkdown(report);
    expect(md).toContain('## Summary');
    expect(md).toContain('Success Rate');
  });

  it('contains journey results section', () => {
    const results = [makeRun('direct', [makeJourney('J01')])];
    const report = buildComparisonReport(results);
    const md = buildComparisonMarkdown(report);
    expect(md).toContain('## Journey Results');
    expect(md).toContain('J01');
  });

  it('shows PASS / FAIL status icons', () => {
    const results = [
      makeRun('direct', [makeJourney('J01', { status: 'passed' })]),
      makeRun('webfuse', [makeJourney('J01', { status: 'failed' })]),
    ];
    const report = buildComparisonReport(results);
    const md = buildComparisonMarkdown(report);
    expect(md).toContain('PASS');
    expect(md).toContain('FAIL');
  });
});

describe('generateComparisonReport', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'comparison-'));
  });

  it('writes both json and markdown files', () => {
    const results = [
      makeRun('direct', [makeJourney('J01')]),
      makeRun('webfuse', [makeJourney('J01')]),
    ];
    const { json, markdown } = generateComparisonReport(results, tmpDir);
    expect(fs.existsSync(json)).toBe(true);
    expect(fs.existsSync(markdown)).toBe(true);
  });

  it('json file contains valid comparison report', () => {
    const results = [makeRun('direct', [makeJourney('J01')])];
    const { json } = generateComparisonReport(results, tmpDir);
    const parsed = JSON.parse(fs.readFileSync(json, 'utf-8'));
    expect(parsed.providers).toContain('direct');
    expect(parsed.rows).toHaveLength(1);
  });

  it('filenames include comparison_ prefix', () => {
    const results = [makeRun('direct', [makeJourney('J01')])];
    const { json, markdown } = generateComparisonReport(results, tmpDir);
    expect(path.basename(json)).toMatch(/^comparison_/);
    expect(path.basename(markdown)).toMatch(/^comparison_/);
  });
});
