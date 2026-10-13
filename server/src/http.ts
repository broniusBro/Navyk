// HTTP-сервер Navyk без внешних зависимостей.
// Отдаёт веб-клиент (web/), карту курса и уроки (content/dist), проверяет промпты через Claude API.
// Запуск: PORT=8080 ANTHROPIC_API_KEY=... node server/src/http.ts
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, readdir, stat } from "node:fs/promises";
import { extname, normalize, join } from "node:path";
import { fileURLToPath } from "node:url";
import { reviewPrompt, ReviewError, MAX_CHARS, type ReviewOptions } from "./reviewer/review.ts";
import { loadReviewContext } from "./reviewer/lesson.ts";
import { DailyLimiter } from "./limits.ts";
import { send, readJsonBody, clientIp, log, publicOrigin } from "./httputil.ts";
import { openDb, dbHealthy, cleanup, type Db } from "./db.ts";
import { createAuth } from "./auth/routes.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const WEB = join(ROOT, "web");
const DIST = join(ROOT, "content", "dist");
const LANGS = new Set(["ru", "uk", "en"]);
const ID_RE = /^[a-z]\d+\.\d+$/;
const EX_RE = /^[a-z]\d+\.\d+\.e\d+$/;

const REVIEW_BODY_LIMIT = MAX_CHARS * 4 + 2000;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

async function serveFile(res: ServerResponse, base: string, rel: string, cache: string) {
  const path = normalize(join(base, rel));
  if (!path.startsWith(base)) return send(res, 403, { error: "forbidden" });
  try {
    const s = await stat(path);
    if (!s.isFile()) throw new Error("not a file");
    const data = await readFile(path);
    send(res, 200, data, { "content-type": MIME[extname(path)] ?? "application/octet-stream", "cache-control": cache });
  } catch {
    send(res, 404, { error: "not_found" });
  }
}

interface ReviewDeps {
  deviceLimiter: DailyLimiter;
  ipLimiter: DailyLimiter;
  userIdFor: (req: IncomingMessage) => string | null;
  reviewOptions?: ReviewOptions;
}

async function handleReview(req: IncomingMessage, res: ServerResponse, deps: ReviewDeps) {
  const { deviceLimiter, ipLimiter } = deps;
  let body: any;
  try {
    body = await readJsonBody(req, REVIEW_BODY_LIMIT);
  } catch {
    return send(res, 400, { error: "bad_request" });
  }
  const { lessonId, exerciseId, lang, prompt, deviceId } = body ?? {};
  if (!ID_RE.test(lessonId ?? "") || !EX_RE.test(exerciseId ?? "") || !LANGS.has(lang) || typeof prompt !== "string") {
    return send(res, 400, { error: "bad_request" });
  }
  // Вошедший ученик: лимит на аккаунт (не обходится сменой устройства); анонимный — на устройство.
  const userId = deps.userIdFor(req);
  const device = userId
    ? `user:${userId}`
    : typeof deviceId === "string" && /^[\w-]{8,64}$/.test(deviceId)
      ? `device:${deviceId}`
      : "anon";

  let ctx;
  try {
    ctx = loadReviewContext(lessonId, exerciseId, lang);
  } catch {
    return send(res, 404, { error: "not_found" });
  }

  // Лимиты проверяем до вызова API, а списываем только после успешной проверки.
  const ip = clientIp(req);
  if (!deviceLimiter.canUse(device) || !ipLimiter.canUse(ip)) {
    return send(res, 429, { error: "limit", resetAt: deviceLimiter.resetAt() });
  }

  try {
    const r = await reviewPrompt(ctx, prompt, deps.reviewOptions);
    deviceLimiter.use(device);
    ipLimiter.use(ip);
    log({ event: "review", lessonId, exerciseId, lang, verdict: r.verdict, score: r.score, costUsd: r.costUsd, usage: r.usage });
    return send(res, 200, {
      score: r.score,
      verdict: r.verdict,
      passed: r.passed,
      review: r.review,
      remaining: deviceLimiter.remaining(device),
    });
  } catch (e) {
    if (e instanceof ReviewError && (e.code === "input_too_short" || e.code === "input_too_long")) {
      return send(res, 400, { error: e.code });
    }
    log({ event: "review_error", lessonId, code: e instanceof ReviewError ? e.code : "unknown", message: String((e as Error).message).slice(0, 300) });
    // Клиент покажет статичный чек-лист самопроверки (fallback_feedback).
    return send(res, 503, { error: "unavailable" });
  }
}

/** Карта курса + какие уроки уже собраны на каждом языке (один запрос вместо проверки каждого урока). */
async function courseWithAvailability() {
  const course = JSON.parse(await readFile(join(ROOT, "content", "course.json"), "utf8"));
  const available: Record<string, string[]> = {};
  for (const lang of LANGS) {
    const files = await readdir(join(DIST, lang)).catch(() => [] as string[]);
    available[lang] = files.filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort();
  }
  return { ...course, available };
}

export interface AppOptions {
  /** База аккаунтов. По умолчанию открывается $DATA_DIR/navyk.sqlite; null — без аккаунтов (503 на /api/auth). */
  db?: Db | null;
  freeReviewsPerDay?: number;
  ipReviewsPerDay?: number;
  authPerMinutePerIp?: number;
  emailsPerHourPerAddress?: number;
  reviewOptions?: ReviewOptions;
  /** Часы для аккаунтов (тесты блокировки и сроков токенов). */
  now?: () => number;
}

function openDbSafely(): Db | null {
  try {
    return openDb();
  } catch (e) {
    // Без базы курс и разбор работают; аккаунты отвечают 503, /api/health показывает db:false.
    log({ event: "db_error", message: String((e as Error).message).slice(0, 300) });
    return null;
  }
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function createApp(opts: AppOptions = {}) {
  const ownsDb = opts.db === undefined;
  const db = ownsDb ? openDbSafely() : (opts.db ?? null);
  const auth = createAuth({
    db,
    authPerMinutePerIp: opts.authPerMinutePerIp,
    emailsPerHourPerAddress: opts.emailsPerHourPerAddress,
    now: opts.now,
  });
  const reviewDeps: ReviewDeps = {
    deviceLimiter: new DailyLimiter(opts.freeReviewsPerDay ?? Number(process.env.FREE_REVIEWS_PER_DAY ?? 10)),
    ipLimiter: new DailyLimiter(opts.ipReviewsPerDay ?? Number(process.env.IP_REVIEWS_PER_DAY ?? 50)),
    userIdFor: auth.userIdFor,
    reviewOptions: opts.reviewOptions,
  };
  if (db) {
    const sweep = () => {
      try {
        cleanup(db);
      } catch (e) {
        log({ event: "db_cleanup_error", message: String((e as Error).message).slice(0, 200) });
      }
    };
    sweep();
    setInterval(sweep, 6 * 3600_000).unref();
  }
  const origin = publicOrigin();

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const p = url.pathname;
    try {
      // CSRF: любой изменяющий запрос к API — только со своего сайта (заголовок Origin обязателен).
      if (p.startsWith("/api/") && !SAFE_METHODS.has(req.method ?? "GET") && req.headers.origin !== origin) {
        return send(res, 403, { error: "forbidden_origin" });
      }
      if (req.method === "GET" && p === "/api/health")
        return send(res, 200, { ok: true, reviewer: Boolean(process.env.ANTHROPIC_API_KEY), db: dbHealthy(db) });
      if (await auth.handle(req, res, p)) return;
      if (req.method === "GET" && p === "/api/course") return send(res, 200, await courseWithAvailability(), { "cache-control": "no-cache" });
      const m = p.match(/^\/api\/lessons\/([a-z]{2})\/([a-z]\d+\.\d+)$/);
      if (req.method === "GET" && m) {
        if (!LANGS.has(m[1])) return send(res, 404, { error: "not_found" });
        return serveFile(res, DIST, `${m[1]}/${m[2]}.json`, "no-cache");
      }
      if (req.method === "POST" && p === "/api/review") return handleReview(req, res, reviewDeps);
      if (p.startsWith("/api/")) return send(res, 404, { error: "not_found" });
      if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, { error: "method_not_allowed" });
      // Статика веб-клиента; неизвестные пути → index.html (одностраничное приложение).
      const rel = p === "/" ? "index.html" : p.slice(1);
      const exists = await stat(normalize(join(WEB, rel))).then((s) => s.isFile()).catch(() => false);
      return serveFile(res, WEB, exists ? rel : "index.html", rel === "sw.js" || !exists || rel === "index.html" ? "no-cache" : "public, max-age=3600");
    } catch (e) {
      log({ event: "error", path: p, message: String((e as Error).message) });
      if (!res.headersSent) return send(res, 500, { error: "internal" });
      res.end();
    }
  });
  server.on("close", () => {
    if (!ownsDb) return;
    try {
      db?.close();
    } catch {
      /* уже закрыта */
    }
  });
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 8080);
  const host = process.env.HOST ?? "0.0.0.0"; // в продакшене 127.0.0.1: снаружи доступ только через Caddy
  const server = createApp();
  server.listen(port, host, () =>
    log({ event: "listening", host, port, reviewer: Boolean(process.env.ANTHROPIC_API_KEY), email: process.env.EMAIL_PROVIDER ?? "log" }),
  );
  // Корректная остановка (docker stop): дождаться запросов и закрыть базу (WAL сбрасывается в файл).
  for (const sig of ["SIGTERM", "SIGINT"] as const) {
    process.once(sig, () => {
      server.close(() => process.exit(0));
      server.closeIdleConnections();
      setTimeout(() => process.exit(0), 8000).unref();
    });
  }
}
