import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

let dbInstance: DatabaseSync | null = null;
let transactionDepth = 0;

export function createDatabase(dbPath?: string): DatabaseSync {
  const resolvedPath = dbPath ?? config.databasePath;

  if (resolvedPath !== ':memory:') {
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new DatabaseSync(resolvedPath, {
    enableForeignKeyConstraints: true,
  });

  // Apply performance and integrity pragmas
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');

  if (resolvedPath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA synchronous = NORMAL;');
  }

  return db;
}

export function getDatabase(): DatabaseSync {
  if (!dbInstance) {
    dbInstance = createDatabase();
  }
  return dbInstance;
}

export function setDatabase(db: DatabaseSync | null): void {
  dbInstance = db;
  transactionDepth = 0;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    transactionDepth = 0;
  }
}

export function runTransaction<T>(db: DatabaseSync, action: () => T): T {
  if (transactionDepth > 0) {
    return action();
  }

  transactionDepth++;
  db.exec('BEGIN IMMEDIATE;');
  try {
    const result = action();
    db.exec('COMMIT;');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // Ignore secondary error
    }
    throw err;
  } finally {
    transactionDepth--;
  }
}
