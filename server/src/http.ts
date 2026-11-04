// HTTP-сервер brolingvo · polski без внешних зависимостей.
// Отдаёт веб-клиент (web/), карту курса и уроки (content/dist), ИИ-помощника и ИИ-собеседника через Claude API.
// Запуск: PORT=8080 ANTHROPIC_API_KEY=... node server/src/http.ts
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, readdir, stat } from "node:fs/promises";
import { extname, normalize, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { checkTranslation, dialogTurn, helperAnswer, MAX_ANSWER, MAX_QUESTION } from "./ai/tutor.ts";
import { AiError, type AiOptions } from "./ai/claude.ts";
import { DailyLimiter } from "./limits.ts";
import { send, readJsonBody, clientIp, log, isSameSite } from "./httputil.ts";
import { openDb, dbHealthy, cleanup, type Db } from "./db.ts";
import { createAuth } from "./auth/routes.ts";
import { createAdmin } from "./admin/routes.ts";
import { touchVisit } from "./activity.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const WEB = join(ROOT, "web");
const DIST = join(ROOT, "content", "dist");
const WEB_ADMIN = join(ROOT, "web-admin");
/** Хост админки (ADMIN_ORIGIN, например https://admin.poland.brolingvo.com); без него админка выключена. */
export function adminHost(): string | null {
  try {
    return process.env.ADMIN_ORIGIN ? new URL(process.env.ADMIN_ORIGIN).host : null;
  } catch {
    return null;
  }
}
// На хосте админки доступны только её API, вход/выход и health.
const ADMIN_HOST_API = new Set(["/api/health", "/api/auth/login", "/api/auth/logout", "/api/auth/me"]);
const ADMIN_HEADERS = {
  "x-robots-tag": "noindex, nofollow",
  "content-security-policy":
    "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; object-src 'none'",
};
const LANGS = new Set(["ru", "uk", "en", "pl"]);
const ID_RE = /^[ab]\d{1,2}m\d{1,2}\.\d{1,2}$/;
const EX_RE = /^[ab]\d{1,2}m\d{1,2}\.\d{1,2}\.e\d{1,2}$/;
const SCENARIO_RE = /^[a-z][a-z0-9_-]{1,30}$/;
const CONTENT_LANGS = new Set(["ru"]);

const AI_BODY_LIMIT = 64_000;
const LEGAL_DOCS = new Set(["privacy", "cookies", "terms"]);

/** Язык юридической страницы: ?lang=, иначе лучший из Accept-Language, иначе английский. */
export function legalLang(query: string | null, acceptLanguage: string | undefined): string {
  if (query && LANGS.has(query)) return query;
  const prefs = String(acceptLanguage ?? "")
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().toLowerCase().split(";");
      const q = Number(params.find((x) => x.trim().startsWith("q="))?.split("=")[1] ?? 1);
      return { lang: tag.split("-")[0], q: Number.isFinite(q) ? q : 0 };
    })
    .filter((x) => x.q > 0)
    .sort((a, b) => b.q - a.q);
  return prefs.find((x) => LANGS.has(x.lang))?.lang ?? "en";
}

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

async function serveFile(req: IncomingMessage, res: ServerResponse, base: string, rel: string, cache: string, extra: Record<string, string> = {}) {
  const path = normalize(join(base, rel));
  if (!path.startsWith(base + sep) || rel.includes("\0")) return send(res, 403, { error: "forbidden" });
  try {
    const s = await stat(path);
    if (!s.isFile()) throw new Error("not a file");
    // ETag from size+mtime: with "no-cache" the browser revalidates every time and gets a cheap 304.
    const etag = `W/"${s.size.toString(36)}-${Math.floor(s.mtimeMs).toString(36)}"`;
    const headers = { "content-type": MIME[extname(path)] ?? "application/octet-stream", "cache-control": cache, etag, ...extra };
    if (req.headers["if-none-match"] === etag) {
      res.writeHead(304, headers);
      return res.end();
    }
    const data = await readFile(path);
    send(res, 200, data, headers);
  } catch {
    send(res, 404, { error: "not_found" });
  }
}

interface AiDeps {
  deviceLimiter: DailyLimiter;
  ipLimiter: DailyLimiter;
  userIdFor: (req: IncomingMessage) => string | null;
  aiOptions?: AiOptions;
  track: (userId: string) => void;
}

type AiKind = "translate" | "dialog" | "helper";

/** Общая обвязка ИИ-запросов: тело JSON, лимиты на аккаунт/устройство и IP, журнал стоимости, 503 → клиент показывает запасной режим. */
async function handleAi(kind: AiKind, req: IncomingMessage, res: ServerResponse, deps: AiDeps) {
  let body: any;
  try {
    body = await readJsonBody(req, AI_BODY_LIMIT);
  } catch {
    return send(res, 400, { error: "bad_request" });
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) return send(res, 400, { error: "bad_request" });
  const userId = deps.userIdFor(req);
  if (userId) deps.track(userId);
  const device = userId
    ? `user:${userId}`
    : typeof body.deviceId === "string" && /^[\w-]{8,64}$/.test(body.deviceId)
      ? `device:${body.deviceId}`
      : `ip:${clientIp(req)}`;
  const { lessonId, exerciseId } = body;
  if (lessonId !== undefined && (typeof lessonId !== "string" || !ID_RE.test(lessonId))) return send(res, 400, { error: "bad_request" });
  if (exerciseId !== undefined && (typeof exerciseId !== "string" || !EX_RE.test(exerciseId) || !lessonId || !exerciseId.startsWith(`${lessonId}.`)))
    return send(res, 400, { error: "bad_request" });
  if (kind === "translate" && (!lessonId || !exerciseId || typeof body.answer !== "string" || body.answer.length > MAX_ANSWER * 2))
    return send(res, 400, { error: "bad_request" });
  if (kind === "dialog" && !(lessonId && exerciseId) && !SCENARIO_RE.test(String(body.scenarioId ?? ""))) return send(res, 400, { error: "bad_request" });
  if (kind === "helper" && (typeof body.question !== "string" || !body.question.trim() || body.question.length > MAX_QUESTION * 2))
    return send(res, 400, { error: "bad_request" });

  if (!process.env.ANTHROPIC_API_KEY && !deps.aiOptions?.apiKey) return send(res, 503, { error: "unavailable", reason: "no_key" });
  const ip = clientIp(req);
  if (!deps.deviceLimiter.canUse(device) || !deps.ipLimiter.canUse(ip)) {
    return send(res, 429, { error: "limit", reason: "limit", resetAt: deps.deviceLimiter.resetAt() });
  }
  try {
    let payload: any;
    let cost = 0;
    if (kind === "translate") {
      const r = await checkTranslation(lessonId, exerciseId, body.answer, deps.aiOptions, body.gender);
      payload = r.result;
      cost = r.costUsd;
    } else if (kind === "dialog") {
      const r = await dialogTurn(
        { lessonId, exerciseId, scenarioId: lessonId ? undefined : body.scenarioId, level: body.level, history: body.history, finish: body.finish === true, gender: body.gender },
        deps.aiOptions,
      );
      payload = r.result;
      cost = r.costUsd;
    } else {
      const r = await helperAnswer({ lessonId, context: body.context, question: body.question, history: body.history, gender: body.gender }, deps.aiOptions);
      payload = { answer: r.answer };
      cost = r.costUsd;
    }
    deps.deviceLimiter.use(device);
    deps.ipLimiter.use(ip);
    log({ event: `ai_${kind}`, lessonId, exerciseId, scenarioId: body.scenarioId, costUsd: cost });
    return send(res, 200, { available: true, ...payload, remaining: deps.deviceLimiter.remaining(device) });
  } catch (e) {
    if ((e as Error).message === "not_found") return send(res, 404, { error: "not_found" });
    log({ event: `ai_${kind}_error`, lessonId, code: e instanceof AiError ? e.code : "unknown", message: String((e as Error).message).slice(0, 300) });
    return send(res, 503, { error: "unavailable", reason: "error" });
  }
}

/** Карта курса + какие уроки уже собраны на каждом языке (один запрос вместо проверки каждого урока). */
async function courseWithAvailability() {
  const course = JSON.parse(await readFile(join(ROOT, "content", "course.json"), "utf8"));
  const available: Record<string, string[]> = {};
  for (const lang of CONTENT_LANGS) {
    const files = await readdir(join(DIST, lang)).catch(() => [] as string[]);
    available[lang] = files.filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort();
  }
  return { ...course, available };
}

export interface AppOptions {
  /** База аккаунтов. По умолчанию открывается $DATA_DIR/brolingvo.sqlite; null — без аккаунтов (503 на /api/auth). */
  db?: Db | null;
  aiPerDay?: number;
  ipAiPerDay?: number;
  authPerMinutePerIp?: number;
  emailsPerHourPerAddress?: number;
  aiOptions?: AiOptions;
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
  // Приложение бесплатное: щедрый дневной лимит ИИ-запросов (реплика в разговоре = 1 запрос), чтобы держать расходы под контролем.
  const aiDeps: AiDeps = {
    deviceLimiter: new DailyLimiter(opts.aiPerDay ?? Number(process.env.AI_PER_DAY ?? 200)),
    ipLimiter: new DailyLimiter(opts.ipAiPerDay ?? Number(process.env.IP_AI_PER_DAY ?? 600)),
    userIdFor: auth.userIdFor,
    aiOptions: opts.aiOptions,
    track: (userId: string) => touchVisit(db, userId, (opts.now ?? Date.now)()),
  };
  const admin = createAdmin({ db, now: opts.now });
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

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const p = url.pathname;
    try {
      // CSRF: любой изменяющий запрос к API — только со своего сайта (заголовок Origin обязателен).
      if (p.startsWith("/api/") && !SAFE_METHODS.has(req.method ?? "GET") && !isSameSite(req.headers.origin, req.headers.host)) {
        return send(res, 403, { error: "forbidden_origin" });
      }
      const onAdminHost = !!adminHost() && req.headers.host === adminHost();
      if (onAdminHost) {
        if (await admin.handle(req, res, p)) return;
        if (p.startsWith("/api/") && !ADMIN_HOST_API.has(p)) return send(res, 404, { error: "not_found" });
        if (!p.startsWith("/api/")) {
          if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, { error: "method_not_allowed" });
          const rel = p === "/" ? "index.html" : p.slice(1);
          const exists = await stat(normalize(join(WEB_ADMIN, rel))).then((s) => s.isFile()).catch(() => false);
          return serveFile(req, res, WEB_ADMIN, exists ? rel : "index.html", "no-cache", ADMIN_HEADERS);
        }
      } else if (p.startsWith("/api/admin/")) return send(res, 404, { error: "not_found" });
      if (req.method === "GET" && p === "/api/health")
        return send(res, 200, { ok: true, ai: Boolean(process.env.ANTHROPIC_API_KEY), db: dbHealthy(db) });
      if (await auth.handle(req, res, p, { track: !onAdminHost })) return;
      if (req.method === "GET" && p === "/api/course") return send(res, 200, await courseWithAvailability(), { "cache-control": "no-cache" });
      const m = p.match(/^\/api\/lessons\/([a-z]{2})\/([ab]\d+m\d+\.\d+)$/);
      if (req.method === "GET" && m) {
        if (!CONTENT_LANGS.has(m[1])) return send(res, 404, { error: "not_found" });
        return serveFile(req, res, DIST, `${m[1]}/${m[2]}.json`, "no-cache");
      }
      if (req.method === "GET" && p === "/api/talk/scenarios")
        return serveFile(req, res, join(ROOT, "content"), "talk/scenarios.json", "no-cache");
      const ai = p.match(/^\/api\/ai\/(translate|dialog|helper)$/);
      if (req.method === "POST" && ai) return handleAi(ai[1] as AiKind, req, res, aiDeps);
      // Политика конфиденциальности, cookies, условия: статичные страницы (scripts/build_legal.py)
      const legal = p.match(/^\/(privacy|cookies|terms)\/?$/);
      if (legal && LEGAL_DOCS.has(legal[1]) && (req.method === "GET" || req.method === "HEAD")) {
        const lang = legalLang(url.searchParams.get("lang"), req.headers["accept-language"]);
        return serveFile(req, res, join(DIST, "legal"), `${legal[1]}.${lang}.html`, "no-cache", { vary: "Accept-Language", "content-language": lang });
      }
      if (p.startsWith("/api/")) return send(res, 404, { error: "not_found" });
      if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, { error: "method_not_allowed" });
      // Статика веб-клиента; неизвестные пути → index.html (одностраничное приложение).
      const rel = p === "/" ? "index.html" : p.slice(1);
      const exists = await stat(normalize(join(WEB, rel))).then((s) => s.isFile()).catch(() => false);
      // Always revalidate (ETag → 304): a deploy reaches everyone on the next load, not an hour later.
      return serveFile(req, res, WEB, exists ? rel : "index.html", "no-cache");
    } catch (e) {
      log({ event: "error", path: p, message: String((e as Error).message) });
      if (!res.headersSent) return send(res, 500, { error: "internal" });
      res.end();
    }
  });
  // Медленные клиенты (slowloris) не держат соединения: заголовки за 15 с, весь запрос за 30 с.
  server.headersTimeout = 15_000;
  server.requestTimeout = 30_000;
  server.maxHeadersCount = 64;
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
    log({ event: "listening", host, port, ai: Boolean(process.env.ANTHROPIC_API_KEY), email: process.env.EMAIL_PROVIDER ?? "log" }),
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
