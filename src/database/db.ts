import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.resolve(__dirname, '../../fintech.db');
const SCHEMA_PATH = path.resolve(__dirname, 'schema.sql');

// Initialize SQLite database instance
export const db = new Database(DB_PATH);

// Configure database for high-reliability financial operations
db.pragma('journal_mode = WAL'); // Write-Ahead Logging for concurrent throughput
db.pragma('foreign_keys = ON');  // Strict relational integrity
db.pragma('synchronous = NORMAL'); // Balance between durability and speed

// Initialize schema
export function initDatabase(): void {
  const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  db.exec(schemaSql);
}

// Helper to run operations inside an ACID transaction
export function runInTransaction<T>(fn: (dbInstance: Database.Database) => T): T {
  const transaction = db.transaction(() => {
    return fn(db);
  });
  return transaction();
}

// Auto-initialize on module load
initDatabase();
