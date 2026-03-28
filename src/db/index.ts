import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { initSchema } from './schema.js';

export { initSchema } from './schema.js';
export { insertRun, getRun } from './operations.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Open (or create) the benchmark SQLite database */
export function openDatabase(dbPath?: string): Database.Database {
  const resolvedPath = dbPath ?? path.join(__dirname, '..', '..', 'benchmark.db');
  const db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');
  initSchema(db);
  return db;
}
