// API админки (только на хосте admin.*): /api/admin/*.
// Доступ: вход по сессии этого хоста + роль в admin_roles; сессия админки действует не дольше ADMIN_SESSION_MAX_MS.
import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Db } from "../db.ts";
import { send, readJsonBody, log } from "../httputil.ts";
// @ts-ignore — общий с клиентом модуль на чистом JS
import { normalizeProgress } from "../../../web/js/engine/progress.js";
import { readSession, sha256, type UserRow } from "../auth/sessions.ts";
import { parseCookies } from "../httputil.ts";
import { cookieName } from "../auth/sessions.ts";
import { can, canManage, isRole, maskEmail, PERMISSIONS, ROLES, type Permission, type Role } from "./roles.ts";

export const ADMIN_SESSION_MAX_MS = 12 * 3600_000;
const DAY = 24 * 3600_000;

// ---------------- курс: какие уроки в каком уровне ----------------

interface CourseMap {
  levels: { id: string; title: Record<string, string>; modules: { id: string; title: Record<string, string>; lessons: { id: string; title: Record<string, string> }[] }[] }[];
  levelOf: Map<string, string>;
}

let courseCache: CourseMap | null = null;
function course(): CourseMap {
  if (courseCache) return courseCache;
  const raw = JSON.parse(readFileSync(new URL("../../../content/course.json", import.meta.url), "utf8"));
  const levelOf = new Map<string, string>();
  const levels = raw.levels.map((l: any) => ({
    id: l.id,
    title: l.title,
    modules: l.modules.map((m: any) => {
      for (const ls of m.lessons) levelOf.set(ls.id, l.id);
      return { id: m.id, title: m.title, lessons: m.lessons.map((ls: any) => ({ id: ls.id, title: ls.title })) };
    }),
  }));
  courseCache = { levels, levelOf };
  return courseCache;
}

// ---------------- прогресс ----------------

interface LessonRec {
  firstCompletedAt?: string;
  lastCompletedAt?: string;
  bestXp?: number;
  runs?: number;
}

export interface ProgressSummary {
  xp: number;
  activeDays: number;
  lastActiveDay: string | null;
  streak: number;
  completed: number;
  levels: { id: string; done: number; total: number }[];
  /** Уровень, в котором ученик сейчас занимается: уровень последнего пройденного урока. */
  currentLevel: string | null;
}

const isDay = (d: unknown): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);

export function summarizeProgress(raw: any, todayIso: string): ProgressSummary {
  const data = normalizeProgress(raw); // старые записи могли сохраниться до строгой проверки
  const c = course();
  const lessons: Record<string, LessonRec> = data && typeof data.lessons === "object" && data.lessons ? data.lessons : {};
  const days = Array.isArray(data?.days) ? [...new Set(data.days.filter(isDay))].sort() : [];
  const done = new Set(Object.keys(lessons).filter((id) => c.levelOf.has(id)));
  const levels = c.levels.map((l) => {
    const ids = l.modules.flatMap((m) => m.lessons.map((x) => x.id));
    return { id: l.id, done: ids.filter((id) => done.has(id)).length, total: ids.length };
  });
  let last: { id: string; at: string } | null = null;
  for (const id of done) {
    const at = lessons[id]?.lastCompletedAt ?? "";
    if (!last || at > last.at) last = { id, at };
  }
  // серия: дни подряд, заканчивая сегодня или вчера
  const set = new Set(days);
  let streak = 0;
  let d = new Date(`${todayIso}T00:00:00Z`);
  if (!set.has(todayIso)) d = new Date(d.getTime() - DAY);
  while (set.has(d.toISOString().slice(0, 10))) {
    streak++;
    d = new Date(d.getTime() - DAY);
  }
  return {
    xp: Number.isFinite(data?.xp) ? Math.max(0, Math.floor(data.xp)) : 0,
    activeDays: days.length,
    lastActiveDay: days.at(-1) ?? null,
    streak,
    completed: done.size,
    levels,
    currentLevel: last ? (c.levelOf.get(last.id) ?? null) : null,
  };
}

// ---------------- доступ ----------------

export interface AdminCtx {
  user: UserRow;
  role: Role;
  sessionHash: string;
}

export function roleOf(db: Db, userId: string): Role | null {
  const r = db.prepare("SELECT role FROM admin_roles WHERE user_id = ?").get(userId) as { role: string } | undefined;
  return r && isRole(r.role) ? r.role : null;
}

export function audit(db: Db, actorId: string | null, action: string, targetId: string | null, details: Record<string, unknown> = {}, now = Date.now()) {
  db.prepare("INSERT INTO admin_audit (at, actor_id, action, target_id, details) VALUES (?, ?, ?, ?, ?)").run(
    now,
    actorId,
    action,
    targetId,
    JSON.stringify(details),
  );
}

export function createAdmin(opts: { db: Db | null; now?: () => number }) {
  const db = opts.db;
  const now = opts.now ?? Date.now;

  /** Сессия этого хоста + роль. null — ответ уже отправлен. */
  function ctx(req: IncomingMessage, res: ServerResponse, need: Permission): AdminCtx | null {
    const s = readSession(db, req, now());
    if (!s) return send(res, 401, { error: "unauthorized" }), null;
    const secret = parseCookies(req)[cookieName()] ?? "";
    const row = db!.prepare("SELECT created_at FROM sessions WHERE id_hash = ?").get(sha256(secret)) as { created_at: number } | undefined;
    if (!row || now() - row.created_at > ADMIN_SESSION_MAX_MS) return send(res, 401, { error: "reauth" }), null;
    const role = roleOf(db!, s.user.id);
    if (!role) return send(res, 403, { error: "not_admin" }), null;
    if (!can(role, need)) return send(res, 403, { error: "forbidden" }), null;
    return { user: s.user, role, sessionHash: sha256(secret) };
  }

  const today = () => new Date(now()).toISOString().slice(0, 10);
  const iso = (ms: number | null | undefined) => (ms ? new Date(ms).toISOString() : null);

  function visitStats(): Map<string, { visits: number; totalMs: number; lastStart: number; lastEnd: number; week: number }> {
    const out = new Map();
    const weekAgo = now() - 7 * DAY;
    for (const r of db!.prepare(
      `SELECT user_id, COUNT(*) AS n, SUM(last_at - started_at) AS total, MAX(last_at) AS last_end,
              SUM(CASE WHEN last_at >= ? THEN last_at - started_at ELSE 0 END) AS week
       FROM visits GROUP BY user_id`,
    ).all(weekAgo) as any[]) {
      out.set(r.user_id, { visits: r.n, totalMs: r.total ?? 0, lastStart: 0, lastEnd: r.last_end, week: r.week ?? 0 });
    }
    for (const r of db!.prepare(
      `SELECT v.user_id, v.started_at FROM visits v
       JOIN (SELECT user_id, MAX(last_at) AS m FROM visits GROUP BY user_id) x ON x.user_id = v.user_id AND x.m = v.last_at`,
    ).all() as any[]) {
      const s = out.get(r.user_id);
      if (s) s.lastStart = r.started_at;
    }
    return out;
  }

  function userRows(role: Role) {
    const visits = visitStats();
    const t = today();
    const rows = db!.prepare(
      `SELECT u.id, u.email, u.lang, u.created_at, u.email_confirmed_at, u.google_sub, p.data, p.updated_at, r.role
       FROM users u LEFT JOIN progress p ON p.user_id = u.id LEFT JOIN admin_roles r ON r.user_id = u.id`,
    ).all() as any[];
    return rows.map((u) => {
      let data: any = null;
      try {
        data = u.data ? JSON.parse(u.data) : null;
      } catch {
        data = null;
      }
      const p = summarizeProgress(data, t);
      const v = visits.get(u.id);
      return {
        id: u.id,
        email: can(role, "users.contacts") ? u.email : maskEmail(u.email),
        lang: u.lang,
        createdAt: iso(u.created_at),
        confirmed: u.email_confirmed_at !== null,
        signIn: u.google_sub ? "google" : "password",
        role: u.role ?? null,
        lastSeenAt: iso(v?.lastEnd),
        lastVisit: v ? { startedAt: iso(v.lastStart), endedAt: iso(v.lastEnd), minutes: Math.round((v.lastEnd - v.lastStart) / 60_000) } : null,
        visits: v?.visits ?? 0,
        totalMinutes: Math.round((v?.totalMs ?? 0) / 60_000),
        weekMinutes: Math.round((v?.week ?? 0) / 60_000),
        progress: p,
      };
    });
  }

  // ---------------- handlers ----------------

  function me(req: IncomingMessage, res: ServerResponse) {
    const c = ctx(req, res, "stats.read");
    if (!c) return;
    send(res, 200, { user: { id: c.user.id, email: c.user.email }, role: c.role, permissions: PERMISSIONS[c.role], roles: PERMISSIONS }, { "cache-control": "no-store" });
  }

  function stats(req: IncomingMessage, res: ServerResponse) {
    const c = ctx(req, res, "stats.read");
    if (!c) return;
    const rows = userRows(c.role);
    const t = now();
    const activeSince = (ms: number) => rows.filter((r) => r.lastSeenAt && Date.parse(r.lastSeenAt) >= t - ms).length;
    const byDay: Record<string, number> = {};
    for (let i = 29; i >= 0; i--) byDay[new Date(t - i * DAY).toISOString().slice(0, 10)] = 0;
    for (const r of rows) {
      const d = r.createdAt?.slice(0, 10);
      if (d && d in byDay) byDay[d]++;
    }
    const levels = course().levels.map((l) => ({
      id: l.id,
      title: l.title,
      lessons: l.modules.reduce((n, m) => n + m.lessons.length, 0),
      started: rows.filter((r) => (r.progress.levels.find((x) => x.id === l.id)?.done ?? 0) > 0).length,
      finished: rows.filter((r) => {
        const x = r.progress.levels.find((y) => y.id === l.id);
        return x && x.total > 0 && x.done === x.total;
      }).length,
      current: rows.filter((r) => r.progress.currentLevel === l.id).length,
    }));
    const visitsWeek = db!.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(last_at - started_at), 0) AS ms FROM visits WHERE last_at >= ?").get(t - 7 * DAY) as {
      n: number;
      ms: number;
    };
    send(
      res,
      200,
      {
        users: {
          total: rows.length,
          confirmed: rows.filter((r) => r.confirmed).length,
          google: rows.filter((r) => r.signIn === "google").length,
          new7d: rows.filter((r) => r.createdAt && Date.parse(r.createdAt) >= t - 7 * DAY).length,
          active1d: activeSince(DAY),
          active7d: activeSince(7 * DAY),
          active30d: activeSince(30 * DAY),
        },
        visits7d: { count: visitsWeek.n, avgMinutes: visitsWeek.n ? Math.round(visitsWeek.ms / visitsWeek.n / 60_000) : 0 },
        lessonsCompleted: rows.reduce((n, r) => n + r.progress.completed, 0),
        registrationsByDay: byDay,
        levels,
      },
      { "cache-control": "no-store" },
    );
  }

  function users(req: IncomingMessage, res: ServerResponse, url: URL) {
    const c = ctx(req, res, "users.read");
    if (!c) return;
    const q = (url.searchParams.get("q") ?? "").trim().toLowerCase().slice(0, 254);
    const level = url.searchParams.get("level") ?? "";
    const sort = url.searchParams.get("sort") ?? "created";
    const page = Math.min(100_000, Math.max(1, Math.floor(Number(url.searchParams.get("page") ?? 1)) || 1));
    const size = 50;
    let rows = userRows(c.role);
    if (q) rows = rows.filter((r) => r.email.toLowerCase().includes(q) || r.id === q);
    if (level) rows = rows.filter((r) => (level === "none" ? !r.progress.currentLevel : r.progress.currentLevel === level));
    const key: Record<string, (r: (typeof rows)[number]) => number | string> = {
      created: (r) => r.createdAt ?? "",
      seen: (r) => r.lastSeenAt ?? "",
      xp: (r) => r.progress.xp,
      completed: (r) => r.progress.completed,
      time: (r) => r.totalMinutes,
    };
    const k = Object.hasOwn(key, sort) ? key[sort] : key.created;
    rows.sort((a, b) => (k(a) < k(b) ? 1 : k(a) > k(b) ? -1 : 0));
    send(res, 200, { total: rows.length, page, pageSize: size, users: rows.slice((page - 1) * size, page * size) }, { "cache-control": "no-store" });
  }

  function userDetail(req: IncomingMessage, res: ServerResponse, id: string) {
    const c = ctx(req, res, "progress.read");
    if (!c) return;
    const row = userRows(c.role).find((r) => r.id === id);
    if (!row) return send(res, 404, { error: "not_found" });
    const p = db!.prepare("SELECT data FROM progress WHERE user_id = ?").get(id) as { data: string } | undefined;
    let data: any = null;
    try {
      data = p ? normalizeProgress(JSON.parse(p.data)) : null;
    } catch {
      data = null;
    }
    const lessons: Record<string, LessonRec> = data?.lessons ?? {};
    const levels = course().levels.map((l) => ({
      id: l.id,
      title: l.title,
      modules: l.modules.map((m) => ({
        id: m.id,
        title: m.title,
        lessons: m.lessons.map((ls) => {
          const r = lessons[ls.id];
          return {
            id: ls.id,
            title: ls.title,
            done: !!r,
            firstCompletedAt: r?.firstCompletedAt ?? null,
            lastCompletedAt: r?.lastCompletedAt ?? null,
            bestXp: r?.bestXp ?? null,
            runs: r?.runs ?? 0,
          };
        }),
      })),
    }));
    const visits = (db!.prepare("SELECT started_at, last_at FROM visits WHERE user_id = ? ORDER BY last_at DESC LIMIT 50").all(id) as any[]).map((v) => ({
      startedAt: iso(v.started_at),
      endedAt: iso(v.last_at),
      minutes: Math.round((v.last_at - v.started_at) / 60_000),
    }));
    const activeSessions = (db!.prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND expires_at > ?").get(id, now()) as { n: number }).n;
    send(res, 200, { user: row, levels, visits, activeSessions, days: Array.isArray(data?.days) ? data.days.slice(-60) : [] }, { "cache-control": "no-store" });
  }

  function admins(req: IncomingMessage, res: ServerResponse) {
    const c = ctx(req, res, "admins.read");
    if (!c) return;
    const rows = (db!.prepare(
      `SELECT r.user_id, r.role, r.granted_at, u.email, g.email AS granted_by_email
       FROM admin_roles r JOIN users u ON u.id = r.user_id LEFT JOIN users g ON g.id = r.granted_by ORDER BY r.granted_at`,
    ).all() as any[]).map((r) => ({ userId: r.user_id, email: r.email, role: r.role, grantedAt: iso(r.granted_at), grantedBy: r.granted_by_email ?? null }));
    send(res, 200, { admins: rows, roles: ROLES, permissions: PERMISSIONS }, { "cache-control": "no-store" });
  }

  async function grant(req: IncomingMessage, res: ServerResponse) {
    const c = ctx(req, res, "admins.manage");
    if (!c) return;
    let body: any;
    try {
      body = await readJsonBody(req, 2048);
    } catch {
      return send(res, 400, { error: "bad_request" });
    }
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const role = body?.role;
    if (!email || !isRole(role)) return send(res, 400, { error: "bad_request" });
    const target = db!.prepare("SELECT * FROM users WHERE email = ?").get(email) as UserRow | undefined;
    if (!target) return send(res, 404, { error: "user_not_found" });
    if (target.email_confirmed_at === null) return send(res, 409, { error: "email_not_confirmed" });
    const current = roleOf(db!, target.id);
    if (!canManage(c.role, current, role)) return send(res, 403, { error: "forbidden" });
    if (current === role) return send(res, 200, { ok: true, unchanged: true });
    if (current === "owner" && role !== "owner" && ownersCount() <= 1) return send(res, 409, { error: "last_owner" });
    db!.prepare(
      "INSERT INTO admin_roles (user_id, role, granted_by, granted_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET role = excluded.role, granted_by = excluded.granted_by, granted_at = excluded.granted_at",
    ).run(target.id, role, c.user.id, now());
    audit(db!, c.user.id, current ? "role_change" : "grant", target.id, { email, from: current, to: role }, now());
    log({ event: "admin_grant", role, changed: !!current });
    send(res, 200, { ok: true });
  }

  function revoke(req: IncomingMessage, res: ServerResponse, userId: string) {
    const c = ctx(req, res, "admins.manage");
    if (!c) return;
    const current = roleOf(db!, userId);
    if (!current) return send(res, 404, { error: "not_found" });
    if (!canManage(c.role, current, null)) return send(res, 403, { error: "forbidden" });
    if (current === "owner" && ownersCount() <= 1) return send(res, 409, { error: "last_owner" });
    db!.prepare("DELETE FROM admin_roles WHERE user_id = ?").run(userId);
    const email = (db!.prepare("SELECT email FROM users WHERE id = ?").get(userId) as { email: string } | undefined)?.email ?? null;
    audit(db!, c.user.id, "revoke", userId, { email, from: current }, now());
    send(res, 200, { ok: true });
  }

  const ownersCount = () => (db!.prepare("SELECT COUNT(*) AS n FROM admin_roles WHERE role = 'owner'").get() as { n: number }).n;

  function auditLog(req: IncomingMessage, res: ServerResponse) {
    const c = ctx(req, res, "audit.read");
    if (!c) return;
    const rows = (db!.prepare(
      `SELECT a.at, a.action, a.details, a.target_id, u.email AS actor FROM admin_audit a LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.at DESC LIMIT 200`,
    ).all() as any[]).map((r) => ({ at: iso(r.at), action: r.action, actor: r.actor ?? "server", targetId: r.target_id, details: JSON.parse(r.details || "{}") }));
    send(res, 200, { entries: rows }, { "cache-control": "no-store" });
  }

  /** /api/admin/*. Возвращает false, если путь не наш. */
  async function handle(req: IncomingMessage, res: ServerResponse, path: string): Promise<boolean> {
    if (!path.startsWith("/api/admin/")) return false;
    if (!db) return send(res, 503, { error: "unavailable" }), true;
    const url = new URL(req.url ?? "/", "http://localhost");
    const m = req.method ?? "GET";
    const userMatch = path.match(/^\/api\/admin\/users\/([\w-]{8,64})$/);
    const adminMatch = path.match(/^\/api\/admin\/admins\/([\w-]{8,64})$/);
    if (m === "GET" && path === "/api/admin/me") me(req, res);
    else if (m === "GET" && path === "/api/admin/stats") stats(req, res);
    else if (m === "GET" && path === "/api/admin/users") users(req, res, url);
    else if (m === "GET" && userMatch) userDetail(req, res, userMatch[1]);
    else if (m === "GET" && path === "/api/admin/admins") admins(req, res);
    else if (m === "POST" && path === "/api/admin/admins") await grant(req, res);
    else if (m === "DELETE" && adminMatch) revoke(req, res, adminMatch[1]);
    else if (m === "GET" && path === "/api/admin/audit") auditLog(req, res);
    else send(res, 404, { error: "not_found" });
    return true;
  }

  return { handle };
}

/** Выдать роль из консоли сервера (первый владелец): node server/src/admin/grant.ts <email> [role]. */
export function grantFromConsole(db: Db, email: string, role: Role, now = Date.now()): { ok: true } | { ok: false; error: string } {
  const u = db.prepare("SELECT * FROM users WHERE email = ?").get(email.trim().toLowerCase()) as UserRow | undefined;
  if (!u) return { ok: false, error: "user_not_found" };
  if (u.email_confirmed_at === null) return { ok: false, error: "email_not_confirmed" };
  const current = roleOf(db, u.id);
  db.prepare(
    "INSERT INTO admin_roles (user_id, role, granted_by, granted_at) VALUES (?, ?, NULL, ?) ON CONFLICT(user_id) DO UPDATE SET role = excluded.role, granted_by = NULL, granted_at = excluded.granted_at",
  ).run(u.id, role, now);
  audit(db, null, current ? "role_change" : "grant", u.id, { email: u.email, from: current, to: role, via: "console" }, now);
  return { ok: true };
}
