import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { tokenCost, agenticSuccessRate, DEFAULT_AGENTIC_RATES } from '../metrics/agentic.js';
import type { JourneyResult } from '../types.js';
import type { LLMCallLog } from '../services/llm-proxy/types.js';

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

function writeProxyLog(file: string, calls: Partial<LLMCallLog>[]): void {
  const lines = calls.map(c => JSON.stringify({
    id: c.id ?? 'x',
    timestamp: c.timestamp ?? new Date().toISOString(),
    model: c.model ?? 'gpt-4o',
    latencyMs: c.latencyMs ?? 100,
    promptTokens: c.promptTokens ?? 0,
    completionTokens: c.completionTokens ?? 0,
    totalTokens: (c.promptTokens ?? 0) + (c.completionTokens ?? 0),
    cost: c.cost ?? 0,
    endpoint: c.endpoint ?? '/v1/chat/completions',
  }));
  fs.writeFileSync(file, lines.join('\n') + '\n', 'utf-8');
}

describe('M6: tokenCost', () => {
  let tmpFile: string;

  beforeEach(() => {
    tmpFile = path.join(os.tmpdir(), `proxy-log-${Date.now()}-${Math.random()}.jsonl`);
  });

  it('returns 0 for non-existent file', () => {
    expect(tokenCost('/non/existent/file.jsonl')).toBe(0);
  });

  it('returns 0 for empty file', () => {
    fs.writeFileSync(tmpFile, '', 'utf-8');
    expect(tokenCost(tmpFile)).toBe(0);
  });

  it('computes cost from a single call', () => {
    // 1000 prompt tokens at gpt-4o $5/1M = $0.000005
    // 500 completion tokens at $15/1M = $0.0000075
    writeProxyLog(tmpFile, [{ model: 'gpt-4o', promptTokens: 1000, completionTokens: 500 }]);
    const cost = tokenCost(tmpFile);
    const expected = 1000 * 5 / 1e6 + 500 * 15 / 1e6;
    expect(cost).toBeCloseTo(expected, 10);
  });

  it('sums costs across multiple calls', () => {
    writeProxyLog(tmpFile, [
      { model: 'gpt-4o', promptTokens: 1000, completionTokens: 500 },
      { model: 'gpt-4o', promptTokens: 2000, completionTokens: 1000 },
    ]);
    const cost = tokenCost(tmpFile);
    const expected =
      (1000 * 5 / 1e6 + 500 * 15 / 1e6) +
      (2000 * 5 / 1e6 + 1000 * 15 / 1e6);
    expect(cost).toBeCloseTo(expected, 10);
  });

  it('uses stored cost for unknown model', () => {
    writeProxyLog(tmpFile, [{ model: 'mystery-model', cost: 0.042 }]);
    const cost = tokenCost(tmpFile);
    expect(cost).toBeCloseTo(0.042, 6);
  });

  it('uses custom rates when provided', () => {
    writeProxyLog(tmpFile, [{ model: 'cheap-model', promptTokens: 1_000_000, completionTokens: 0 }]);
    const cost = tokenCost(tmpFile, { 'cheap-model': { promptPer1M: 1, completionPer1M: 2 } });
    expect(cost).toBeCloseTo(1, 5);
  });

  it('skips malformed lines', () => {
    fs.writeFileSync(tmpFile, 'not json\n{"model":"gpt-4o","promptTokens":1000,"completionTokens":500,"cost":0}\n', 'utf-8');
    const cost = tokenCost(tmpFile, DEFAULT_AGENTIC_RATES);
    expect(cost).toBeGreaterThanOrEqual(0);
  });
});

describe('M7: agenticSuccessRate', () => {
  it('returns 0 for non-agentic provider', () => {
    const journeys = [makeJourney({ status: 'passed' }), makeJourney({ status: 'passed' })];
    expect(agenticSuccessRate(journeys, 'direct')).toBe(0);
    expect(agenticSuccessRate(journeys, 'webfuse')).toBe(0);
    expect(agenticSuccessRate(journeys, 'DirectProvider')).toBe(0);
  });

  it('returns 1.0 for all-passed agentic run', () => {
    const journeys = [makeJourney(), makeJourney(), makeJourney()];
    expect(agenticSuccessRate(journeys, 'webfuse-mcp')).toBe(1.0);
    expect(agenticSuccessRate(journeys, 'browser-use')).toBe(1.0);
    expect(agenticSuccessRate(journeys, 'WebfuseMcpProvider')).toBe(1.0);
    expect(agenticSuccessRate(journeys, 'BrowserUseProvider')).toBe(1.0);
  });

  it('returns correct fraction for mixed results', () => {
    const journeys = [
      makeJourney({ status: 'passed' }),
      makeJourney({ status: 'failed' }),
      makeJourney({ status: 'passed' }),
    ];
    expect(agenticSuccessRate(journeys, 'webfuse-mcp')).toBeCloseTo(2 / 3, 5);
  });

  it('returns 0 for empty journey list with agentic provider', () => {
    expect(agenticSuccessRate([], 'browser-use')).toBe(0);
  });

  it('returns 0 for all-failed agentic run', () => {
    const journeys = [
      makeJourney({ status: 'failed' }),
      makeJourney({ status: 'error' }),
    ];
    expect(agenticSuccessRate(journeys, 'webfuse-mcp')).toBe(0);
  });
});
