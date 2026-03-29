import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initSchema } from '../db/schema.js';
import { insertRun, getRun } from '../db/operations.js';
import type { RunResult } from '../types.js';

let db: Database.Database;

beforeEach(() => {
  db = new Database(':memory:');
  initSchema(db);
});

afterEach(() => {
  db.close();
});

function makeRunResult(): RunResult {
  return {
    startedAt: '2026-01-01T00:00:00Z',
    finishedAt: '2026-01-01T00:01:00Z',
    provider: 'DirectProvider',
    site: 'webarena',
    targetUrl: 'http://localhost:7770',
    totalJourneys: 2,
    passed: 1,
    failed: 1,
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
          { stepIndex: 0, stepName: 'Navigate to homepage', status: 'passed', executionTimeMs: 500 },
          { stepIndex: 1, stepName: 'Open product', status: 'passed', executionTimeMs: 200 },
        ],
        startedAt: '2026-01-01T00:00:00Z',
        finishedAt: '2026-01-01T00:00:30Z',
      },
      {
        journeyId: 'J04',
        journeyName: 'Cart Recovery',
        status: 'failed',
        executionTimeMs: 5000,
        partialCompletion: 0.5,
        stepsTotal: 7,
        stepsCompleted: 3,
        errorMessage: 'Cart empty after recovery',
        steps: [
          { stepIndex: 0, stepName: 'Navigate', status: 'passed', executionTimeMs: 100 },
          { stepIndex: 1, stepName: 'Add item', status: 'failed', executionTimeMs: 300, errorMessage: 'Cart empty' },
        ],
        startedAt: '2026-01-01T00:00:30Z',
        finishedAt: '2026-01-01T00:00:35Z',
      },
    ],
  };
}

describe('Database operations', () => {
  it('creates schema without errors', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    const tableNames = tables.map(t => t.name);
    expect(tableNames).toContain('runs');
    expect(tableNames).toContain('journey_results');
    expect(tableNames).toContain('step_results');
  });

  it('inserts a run and returns an ID', () => {
    const runId = insertRun(db, makeRunResult());
    expect(runId).toBeGreaterThan(0);
  });

  it('retrieves an inserted run with journeys and steps', () => {
    const runId = insertRun(db, makeRunResult());
    const run = getRun(db, runId);
    expect(run).not.toBeNull();
    expect(run!.provider).toBe('DirectProvider');
    expect(run!.totalJourneys).toBe(2);
    expect(run!.passed).toBe(1);
    expect(run!.failed).toBe(1);
    expect(run!.journeys).toHaveLength(2);

    const j01 = run!.journeys.find(j => j.journeyId === 'J01');
    expect(j01).toBeDefined();
    expect(j01!.status).toBe('passed');
    expect(j01!.steps).toHaveLength(2);

    const j04 = run!.journeys.find(j => j.journeyId === 'J04');
    expect(j04).toBeDefined();
    expect(j04!.status).toBe('failed');
    expect(j04!.errorMessage).toBe('Cart empty after recovery');
  });

  it('returns null for non-existent run', () => {
    const run = getRun(db, 999);
    expect(run).toBeNull();
  });

  it('handles multiple runs', () => {
    const id1 = insertRun(db, makeRunResult());
    const id2 = insertRun(db, makeRunResult());
    expect(id2).toBe(id1 + 1);

    const run1 = getRun(db, id1);
    const run2 = getRun(db, id2);
    expect(run1).not.toBeNull();
    expect(run2).not.toBeNull();
  });
});
