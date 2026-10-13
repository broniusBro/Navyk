// HTTP-сервер Navyk без внешних зависимостей.
// Отдаёт веб-клиент (web/), карту курса и уроки (content/dist), проверяет промпты через Claude API.
// Запуск: PORT=8080 ANTHROPIC_API_KEY=... node server/src/http.ts
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, readdir, stat } from "node:fs/promises";
import { extname, normalize, join } from "node:path";
import { fileURLToPath } from "node:url";
import { reviewPrompt, ReviewError, MAX_CHARS } from "./reviewer/review.ts";
import { loadReviewContext } from "./reviewer/lesson.ts";
import { DailyLimiter } from "./limits.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const WEB = join(ROOT, "web");
const DIST = join(ROOT, "content", "dist");
const LANGS = new Set(["ru", "uk", "en"]);
const ID_RE = /^[a-z]\d+\.\d+$/;
const EX_RE = /^[a-z]\d+\.\d+\.e\d+$/;

const FREE_REVIEWS_PER_DAY = Number(process.env.FREE_REVIEWS_PER_DAY ?? 10);
const IP_REVIEWS_PER_DAY = Number(process.env.IP_REVIEWS_PER_DAY ?? 50);
const deviceLimiter = new DailyLimiter(FREE_REVIEWS_PER_DAY);
const ipLimiter = new DailyLimiter(IP_REVIEWS_PER_DAY);

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

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
  "content-security-policy":
    "default-src 'self'; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'",
};

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  const isBuf = Buffer.isBuffer(body);
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    "content-type": isBuf ? "application/octet-stream" : "application/json; charset=utf-8",
    ...headers,
  });
  res.end(isBuf ? body : JSON.stringify(body));
}

async function readJsonBody(req: IncomingMessage, limit = MAX_CHARS * 4 + 2000): Promise<any> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("body_too_large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function clientIp(req: IncomingMessage): string {
  const fwd = req.headers["x-forwarded-for"];
  // За обратным прокси (Caddy/nginx) берём первый адрес; иначе адрес сокета.
  if (process.env.TRUST_PROXY === "1" && typeof fwd === "string") return fwd.split(",")[0].trim();
  return req.socket.remoteAddress ?? "unknown";
}

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

async function handleReview(req: IncomingMessage, res: ServerResponse) {
  let body: any;
  try {
    body = await readJsonBody(req);
  } catch {
    return send(res, 400, { error: "bad_request" });
  }
  const { lessonId, exerciseId, lang, prompt, deviceId } = body ?? {};
  if (!ID_RE.test(lessonId ?? "") || !EX_RE.test(exerciseId ?? "") || !LANGS.has(lang) || typeof prompt !== "string") {
    return send(res, 400, { error: "bad_request" });
  }
  const device = typeof deviceId === "string" && /^[\w-]{8,64}$/.test(deviceId) ? deviceId : "anon";

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
    const r = await reviewPrompt(ctx, prompt);
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

function log(entry: Record<string, unknown>) {
  console.log(JSON.stringify({ t: new Date().toISOString(), ...entry }));
}

export function createApp() {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const p = url.pathname;
    try {
      if (req.method === "GET" && p === "/api/health") return send(res, 200, { ok: true, reviewer: Boolean(process.env.ANTHROPIC_API_KEY) });
      if (req.method === "GET" && p === "/api/course") return send(res, 200, await courseWithAvailability(), { "cache-control": "no-cache" });
      const m = p.match(/^\/api\/lessons\/([a-z]{2})\/([a-z]\d+\.\d+)$/);
      if (req.method === "GET" && m) {
        if (!LANGS.has(m[1])) return send(res, 404, { error: "not_found" });
        return serveFile(res, DIST, `${m[1]}/${m[2]}.json`, "no-cache");
      }
      if (req.method === "POST" && p === "/api/review") return handleReview(req, res);
      if (p.startsWith("/api/")) return send(res, 404, { error: "not_found" });
      if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, { error: "method_not_allowed" });
      // Статика веб-клиента; неизвестные пути → index.html (одностраничное приложение).
      const rel = p === "/" ? "index.html" : p.slice(1);
      const exists = await stat(normalize(join(WEB, rel))).then((s) => s.isFile()).catch(() => false);
      return serveFile(res, WEB, exists ? rel : "index.html", rel === "sw.js" || !exists || rel === "index.html" ? "no-cache" : "public, max-age=3600");
    } catch (e) {
      log({ event: "error", path: p, message: String((e as Error).message) });
      return send(res, 500, { error: "internal" });
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 8080);
  const host = process.env.HOST ?? "0.0.0.0"; // в продакшене 127.0.0.1: снаружи доступ только через Caddy
  createApp().listen(port, host, () => log({ event: "listening", host, port, reviewer: Boolean(process.env.ANTHROPIC_API_KEY) }));
}
