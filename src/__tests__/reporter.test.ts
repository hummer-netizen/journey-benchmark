import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { generateJsonReport, generateMarkdownReport } from '../reporter/generator.js';
import type { RunResult } from '../types.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'benchmark-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeRunResult(): RunResult {
  return {
    startedAt: '2026-03-29T00:00:00.000Z',
    finishedAt: '2026-03-29T00:01:00.000Z',
    provider: 'DirectProvider',
    site: 'webarena',
    targetUrl: 'http://localhost:7770',
    totalJourneys: 1,
    passed: 1,
    failed: 0,
    journeys: [
      {
        journeyId: 'J01',
        journeyName: 'Simple Product Purchase',
        status: 'passed',
        executionTimeMs: 30000,
        partialCompletion: 1.0,
        stepsTotal: 8,
        stepsCompleted: 8,
        steps: [
          { stepIndex: 0, stepName: 'Navigate', status: 'passed', executionTimeMs: 500 },
        ],
        startedAt: '2026-03-29T00:00:00.000Z',
        finishedAt: '2026-03-29T00:00:30.000Z',
      },
    ],
  };
}

describe('Report generation', () => {
  it('generates a JSON report file', () => {
    const filePath = generateJsonReport(makeRunResult(), tmpDir);
    expect(fs.existsSync(filePath)).toBe(true);
    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(content.provider).toBe('DirectProvider');
    expect(content.passed).toBe(1);
    expect(content.journeys).toHaveLength(1);
  });

  it('generates a Markdown report file', () => {
    const filePath = generateMarkdownReport(makeRunResult(), tmpDir);
    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('# Benchmark Run Report');
    expect(content).toContain('Success Rate (M1)');
    expect(content).toContain('J01');
    expect(content).toContain('PASS');
  });

  it('includes failure details in markdown', () => {
    const result = makeRunResult();
    result.journeys[0]!.status = 'failed';
    result.journeys[0]!.errorMessage = 'Order confirmation not found';
    result.passed = 0;
    result.failed = 1;

    const filePath = generateMarkdownReport(result, tmpDir);
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('FAIL');
  });
});
