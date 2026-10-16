// SQLite-хранилище аккаунтов и прогресса (ADR 0003). Встроенный node:sqlite, без зависимостей.
// Файл: $DATA_DIR/navyk.sqlite (по умолчанию ./data). Журнал WAL, версионные миграции.
// Сырые токены, пароли и адреса в логах не храним: токены — SHA-256, адрес в email_log — SHA-256.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

export type Db = DatabaseSync;

/** Миграции применяются по порядку и только вперёд. Существующие не менять — только добавлять новые. */
const MIGRATIONS: { version: number; name: string; sql: string }[] = [
  {
    version: 1,
    name: "accounts",
    sql: `
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        lang TEXT NOT NULL,
        email_confirmed_at INTEGER,
        created_at INTEGER NOT NULL,
        failed_logins INTEGER NOT NULL DEFAULT 0,
        locked_until INTEGER
      );
      CREATE TABLE sessions (
        id_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL
      );
      CREATE INDEX sessions_user ON sessions(user_id);
      CREATE INDEX sessions_expires ON sessions(expires_at);
      CREATE TABLE tokens (
        hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK (kind IN ('confirm', 'reset')),
        expires_at INTEGER NOT NULL,
        used_at INTEGER,
        -- только для confirm: хеш пароля из той регистрации, что выпустила ссылку (NULL — оставить текущий)
        password_hash TEXT
      );
      CREATE INDEX tokens_user ON tokens(user_id, kind);
      CREATE TABLE progress (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE email_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        kind TEXT NOT NULL,
        to_hash TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX email_log_created ON email_log(created_at);
    `,
  },
  {
    version: 2,
    name: "google_sign_in",
    sql: `
      ALTER TABLE users ADD COLUMN google_sub TEXT;
      CREATE UNIQUE INDEX users_google_sub ON users(google_sub) WHERE google_sub IS NOT NULL;
    `,
  },
];

export function dataDir(): string {
  return resolve(process.env.DATA_DIR ?? "./data");
}

export function openDb(path = join(dataDir(), "navyk.sqlite")): Db {
  if (path !== ":memory:") mkdirSync(resolve(path, ".."), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  migrate(db);
  return db;
}

export function migrate(db: Db): number[] {
  db.exec("CREATE TABLE IF NOT EXISTS migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)");
  const done = new Set((db.prepare("SELECT version FROM migrations").all() as { version: number }[]).map((r) => r.version));
  const applied: number[] = [];
  for (const m of MIGRATIONS) {
    if (done.has(m.version)) continue;
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(m.sql);
      db.prepare("INSERT INTO migrations (version, name, applied_at) VALUES (?, ?, ?)").run(m.version, m.name, Date.now());
      db.exec("COMMIT");
      applied.push(m.version);
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  return applied;
}

export function dbHealthy(db: Db | null): boolean {
  if (!db) return false;
  try {
    return (db.prepare("SELECT 1 AS ok").get() as { ok: number }).ok === 1;
  } catch {
    return false;
  }
}

/** Удаляет истёкшие сессии и токены, старые записи email_log (90 дней). */
export function cleanup(db: Db, now = Date.now()) {
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now);
  db.prepare("DELETE FROM tokens WHERE expires_at < ?").run(now - 24 * 3600_000);
  db.prepare("DELETE FROM email_log WHERE created_at < ?").run(now - 90 * 24 * 3600_000);
}
