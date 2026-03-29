import Database from 'better-sqlite3';
import type { RunResult, JourneyResult, StepResult } from '../types.js';

/** Insert a completed run and all its nested results. Returns the run ID. */
export function insertRun(db: Database.Database, result: RunResult): number {
  const runStmt = db.prepare(`
    INSERT INTO runs (started_at, finished_at, provider, site, target_url, total_journeys, passed, failed)
    VALUES (@startedAt, @finishedAt, @provider, @site, @targetUrl, @totalJourneys, @passed, @failed)
  `);

  const journeyStmt = db.prepare(`
    INSERT INTO journey_results
      (run_id, journey_id, journey_name, status, execution_time_ms, partial_completion,
       steps_total, steps_completed, error_message, started_at, finished_at)
    VALUES
      (@runId, @journeyId, @journeyName, @status, @executionTimeMs, @partialCompletion,
       @stepsTotal, @stepsCompleted, @errorMessage, @startedAt, @finishedAt)
  `);

  const stepStmt = db.prepare(`
    INSERT INTO step_results
      (journey_result_id, step_index, step_name, status, execution_time_ms, error_message)
    VALUES
      (@journeyResultId, @stepIndex, @stepName, @status, @executionTimeMs, @errorMessage)
  `);

  const insertAll = db.transaction(() => {
    const runInfo = runStmt.run({
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
      provider: result.provider,
      site: result.site ?? 'unknown',
      targetUrl: result.targetUrl ?? '',
      totalJourneys: result.totalJourneys,
      passed: result.passed,
      failed: result.failed,
    });
    const runId = runInfo.lastInsertRowid as number;

    for (const journey of result.journeys) {
      const jInfo = journeyStmt.run({
        runId,
        journeyId: journey.journeyId,
        journeyName: journey.journeyName,
        status: journey.status,
        executionTimeMs: journey.executionTimeMs,
        partialCompletion: journey.partialCompletion,
        stepsTotal: journey.stepsTotal,
        stepsCompleted: journey.stepsCompleted,
        errorMessage: journey.errorMessage ?? null,
        startedAt: journey.startedAt,
        finishedAt: journey.finishedAt,
      });
      const journeyResultId = jInfo.lastInsertRowid as number;

      for (const step of journey.steps) {
        stepStmt.run({
          journeyResultId,
          stepIndex: step.stepIndex,
          stepName: step.stepName,
          status: step.status,
          executionTimeMs: step.executionTimeMs,
          errorMessage: step.errorMessage ?? null,
        });
      }
    }

    return runId;
  });

  return insertAll() as number;
}

/** Fetch a run with all journey and step results */
export function getRun(db: Database.Database, runId: number): RunResult | null {
  const run = db.prepare('SELECT * FROM runs WHERE id = ?').get(runId) as any;
  if (!run) return null;

  const journeys = db.prepare('SELECT * FROM journey_results WHERE run_id = ?').all(runId) as any[];

  return {
    runId: run.id,
    startedAt: run.started_at,
    finishedAt: run.finished_at,
    provider: run.provider,
    site: run.site ?? 'unknown',
    targetUrl: run.target_url ?? '',
    totalJourneys: run.total_journeys,
    passed: run.passed,
    failed: run.failed,
    journeys: journeys.map(j => {
      const steps = db.prepare('SELECT * FROM step_results WHERE journey_result_id = ?').all(j.id) as any[];
      return {
        journeyId: j.journey_id,
        journeyName: j.journey_name,
        status: j.status,
        executionTimeMs: j.execution_time_ms,
        partialCompletion: j.partial_completion,
        stepsTotal: j.steps_total,
        stepsCompleted: j.steps_completed,
        errorMessage: j.error_message,
        startedAt: j.started_at,
        finishedAt: j.finished_at,
        steps: steps.map(s => ({
          stepIndex: s.step_index,
          stepName: s.step_name,
          status: s.status,
          executionTimeMs: s.execution_time_ms,
          errorMessage: s.error_message,
        })),
      } as JourneyResult;
    }),
  };
}
