// SQLite via Node's built-in node:sqlite (Node >= 22.13), so there are no native deps.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function openDb(path) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, token TEXT UNIQUE NOT NULL, created INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, mission_id TEXT NOT NULL,
      submitted TEXT NOT NULL, result TEXT NOT NULL, owner_id TEXT, ts INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tutor_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, mission_id TEXT NOT NULL,
      level INTEGER NOT NULL, source TEXT NOT NULL, blocked INTEGER NOT NULL, reasons TEXT,
      redactions INTEGER NOT NULL, ts INTEGER NOT NULL
    );
  `);
  return db;
}
