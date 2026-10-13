// Резервная копия базы: VACUUM INTO $DATA_DIR/backups/navyk-<YYYY-MM-DD>.sqlite, хранит 14 дней.
// Запуск в контейнере: node --no-warnings server/src/backup.ts  (вызывает deploy/backup.sh по таймеру).
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readdirSync, rmSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { dataDir } from "./db.ts";

export const KEEP_DAYS = 14;

export function backup(dir = dataDir(), now = new Date()): string {
  const src = join(dir, "navyk.sqlite");
  if (!existsSync(src)) throw new Error("database file not found");
  const out = join(dir, "backups");
  mkdirSync(out, { recursive: true });
  const target = join(out, `navyk-${now.toISOString().slice(0, 10)}.sqlite`);
  rmSync(target, { force: true }); // VACUUM INTO не перезаписывает существующий файл
  const db = new DatabaseSync(src);
  try {
    db.exec("PRAGMA busy_timeout = 10000");
    db.prepare("VACUUM INTO ?").run(target);
  } finally {
    db.close();
  }
  prune(out, now);
  return target;
}

export function prune(out: string, now = new Date(), keepDays = KEEP_DAYS): string[] {
  const cutoff = now.getTime() - keepDays * 24 * 3600_000;
  const removed: string[] = [];
  for (const f of readdirSync(out)) {
    const m = f.match(/^navyk-(\d{4}-\d{2}-\d{2})\.sqlite$/);
    if (!m) continue;
    if (Date.parse(`${m[1]}T00:00:00Z`) < cutoff) {
      rmSync(join(out, f), { force: true });
      removed.push(f);
    }
  }
  return removed;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const target = backup();
  console.log(JSON.stringify({ t: new Date().toISOString(), event: "backup", file: target, bytes: statSync(target).size }));
}
