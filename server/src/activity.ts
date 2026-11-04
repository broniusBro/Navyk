// Учёт визитов для админки: «последняя сессия» и «время в приложении».
// Визит — непрерывная активность: запросы приложения (в т.ч. фоновый ping раз в 2 минуты, пока вкладка открыта).
// Перерыв больше VISIT_GAP_MS начинает новый визит. В базу пишем не чаще раза в минуту на пользователя.
import type { Db } from "./db.ts";

export const VISIT_GAP_MS = 30 * 60_000;
const WRITE_EVERY_MS = 60_000;
const lastWrite = new Map<string, number>();

export function touchVisit(db: Db | null, userId: string, now = Date.now()) {
  if (!db) return;
  const prevWrite = lastWrite.get(userId);
  if (prevWrite !== undefined && now - prevWrite < WRITE_EVERY_MS && now >= prevWrite) return;
  lastWrite.set(userId, now);
  if (lastWrite.size > 50_000) lastWrite.clear();
  const v = db.prepare("SELECT id, last_at FROM visits WHERE user_id = ? ORDER BY last_at DESC LIMIT 1").get(userId) as
    | { id: number; last_at: number }
    | undefined;
  if (v && now - v.last_at <= VISIT_GAP_MS && now >= v.last_at) db.prepare("UPDATE visits SET last_at = ? WHERE id = ?").run(now, v.id);
  else db.prepare("INSERT INTO visits (user_id, started_at, last_at) VALUES (?, ?, ?)").run(userId, now, now);
}

/** Для тестов: забыть, когда писали в последний раз. */
export const resetVisitThrottle = () => lastWrite.clear();
