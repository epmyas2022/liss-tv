import Database, { Database as DatabaseType } from "better-sqlite3";
import fs from "fs";
import path from "path";
import { StoredMovie } from "../types/movie";

const DB_PATH = path.join(process.cwd(), "data", "movies.db");

declare global {
  var __movieDb: DatabaseType | undefined;
}

interface LegacyJsonEntry {
  data?: unknown;
  updatedAt?: string;
  [key: string]: unknown;
}

function migrateJsonIfPresent(db: DatabaseType): void {
  const jsonPath = path.join(process.cwd(), "data", "movies.json");
  if (!fs.existsSync(jsonPath)) return;

  const countRow = db.prepare("SELECT COUNT(*) as count FROM movie_cache").get() as {
    count: number;
  };
  if (countRow.count > 0) return;

  try {
    const raw = fs.readFileSync(jsonPath, "utf-8");
    const json = JSON.parse(raw) as Record<string, LegacyJsonEntry>;
    const insert = db.prepare(`
      INSERT OR REPLACE INTO movie_cache (key, data, updated_at)
      VALUES (?, ?, ?)
    `);

    const transaction = db.transaction(() => {
      for (const [key, value] of Object.entries(json)) {
        if (!value) continue;
        if (value.data !== undefined && typeof value.updatedAt === "string") {
          insert.run(key, JSON.stringify(value.data), value.updatedAt);
        } else {
          const updatedAt =
            typeof value.updatedAt === "string"
              ? value.updatedAt
              : new Date().toISOString();
          insert.run(key, JSON.stringify(value), updatedAt);
        }
      }
    });

    transaction();
    console.info(
      `[SQLite] Successfully migrated ${Object.keys(json).length} items from movies.json to movies.db`,
    );
    fs.renameSync(jsonPath, `${jsonPath}.bak`);
  } catch (err) {
    console.error("[SQLite] Error migrating movies.json:", err);
  }
}

function getDatabase(): DatabaseType {
  if (!globalThis.__movieDb) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    const db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.exec(`
      CREATE TABLE IF NOT EXISTS movie_cache (
        key TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    migrateJsonIfPresent(db);
    globalThis.__movieDb = db;
  }
  return globalThis.__movieDb;
}

/** Upsert by link — merges partial data, never duplicates */
export function upsert(
  link: string,
  data: Partial<Omit<StoredMovie, "link" | "updatedAt">>,
): StoredMovie {
  const db = getDatabase();
  const existing = get(link) || ({} as StoredMovie);
  const updatedAt = new Date().toISOString();
  const merged: StoredMovie = {
    ...existing,
    ...data,
    link,
    updatedAt,
  };

  const stmt = db.prepare(`
    INSERT INTO movie_cache (key, data, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      data = excluded.data,
      updated_at = excluded.updated_at
  `);

  stmt.run(link, JSON.stringify(merged), updatedAt);
  return merged;
}

export function upsertAll<T>(prefix: string, data: T): void {
  const db = getDatabase();
  const updatedAt = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO movie_cache (key, data, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      data = excluded.data,
      updated_at = excluded.updated_at
  `);

  stmt.run(prefix, JSON.stringify(data), updatedAt);
}

export function get(link: string): StoredMovie | undefined {
  const db = getDatabase();
  const stmt = db.prepare(`SELECT data FROM movie_cache WHERE key = ?`);
  const row = stmt.get(link) as { data: string } | undefined;
  if (!row) return undefined;
  try {
    return JSON.parse(row.data) as StoredMovie;
  } catch {
    return undefined;
  }
}

export function remove(link: string): void {
  const db = getDatabase();
  const stmt = db.prepare(`DELETE FROM movie_cache WHERE key = ?`);
  stmt.run(link);
}

export function getAllData<A>(
  key: string,
): { data: A; updatedAt: string } | undefined {
  const db = getDatabase();
  const stmt = db.prepare(`SELECT data, updated_at FROM movie_cache WHERE key = ?`);
  const row = stmt.get(key) as { data: string; updated_at: string } | undefined;
  if (!row) return undefined;
  try {
    return {
      data: JSON.parse(row.data) as A,
      updatedAt: row.updated_at,
    };
  } catch {
    return undefined;
  }
}
