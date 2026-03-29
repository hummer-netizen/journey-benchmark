import Database from 'better-sqlite3';

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  provider TEXT NOT NULL,
  site TEXT,
  target_url TEXT,
  total_journeys INTEGER,
  passed INTEGER,
  failed INTEGER
);

CREATE TABLE IF NOT EXISTS journey_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER REFERENCES runs(id),
  journey_id TEXT NOT NULL,
  journey_name TEXT NOT NULL,
  status TEXT NOT NULL,
  execution_time_ms INTEGER,
  partial_completion REAL,
  steps_total INTEGER,
  steps_completed INTEGER,
  error_message TEXT,
  started_at TEXT,
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS step_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  journey_result_id INTEGER REFERENCES journey_results(id),
  step_index INTEGER,
  step_name TEXT,
  status TEXT NOT NULL,
  execution_time_ms INTEGER,
  error_message TEXT
);
`;

/** Initialize database schema */
export function initSchema(db: Database.Database): void {
  db.exec(SCHEMA_SQL);
}
