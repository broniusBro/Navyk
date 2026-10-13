// Общие помощники HTTP: ответы, чтение JSON, адрес клиента, cookie.
import type { IncomingMessage, ServerResponse } from "node:http";

export const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
  // HTTPS only from now on (Caddy already redirects http → https); ignored by browsers on plain http.
  "strict-transport-security": "max-age=31536000",
  "content-security-policy":
    "default-src 'self'; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'",
};

export function send(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string | string[]> = {},
) {
  const isBuf = Buffer.isBuffer(body);
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    "content-type": isBuf ? "application/octet-stream" : "application/json; charset=utf-8",
    ...headers,
  });
  if (status === 204) return res.end();
  res.end(isBuf ? body : JSON.stringify(body));
}

export class BodyError extends Error {
  readonly code: "body_too_large" | "bad_json";
  constructor(code: BodyError["code"]) {
    super(code);
    this.code = code;
  }
}

export async function readJsonBody(req: IncomingMessage, limit: number): Promise<any> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new BodyError("body_too_large");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new BodyError("bad_json");
  }
}

export function clientIp(req: IncomingMessage): string {
  const fwd = req.headers["x-forwarded-for"];
  // За обратным прокси (Caddy/nginx) берём первый адрес; иначе адрес сокета.
  if (process.env.TRUST_PROXY === "1" && typeof fwd === "string") return fwd.split(",")[0].trim();
  return req.socket.remoteAddress ?? "unknown";
}

export function parseCookies(req: IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {};
  const header = req.headers.cookie;
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k && !(k in out)) out[k] = part.slice(i + 1).trim();
  }
  return out;
}

export function log(entry: Record<string, unknown>) {
  console.log(JSON.stringify({ t: new Date().toISOString(), ...entry }));
}

let derivedOrigin: string | null = null;

/** Адрес сайта для ссылок в письмах: PUBLIC_ORIGIN, иначе адрес, с которого реально пришёл браузер (см. isSameSite). */
export function publicOrigin(): string {
  return (process.env.PUBLIC_ORIGIN ?? derivedOrigin ?? "http://localhost:8080").replace(/\/+$/, "");
}

/**
 * CSRF: изменяющий запрос принимается только со своего сайта.
 * Если PUBLIC_ORIGIN задан — сравниваем с ним. Если нет (сервер, обновлённый без этой настройки),
 * сравниваем Origin с Host запроса: чужой сайт не может подделать оба заголовка в браузере.
 */
export function isSameSite(origin: string | undefined, host: string | undefined): boolean {
  if (!origin) return false;
  const configured = process.env.PUBLIC_ORIGIN?.replace(/\/+$/, "");
  if (configured) return origin === configured;
  if (!host) return false;
  let u: URL;
  try {
    u = new URL(origin);
  } catch {
    return false;
  }
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  const ok = u.host === host && (u.protocol === "https:" || (local && u.protocol === "http:"));
  if (ok && !derivedOrigin && u.protocol === "https:") derivedOrigin = u.origin;
  return ok;
}
