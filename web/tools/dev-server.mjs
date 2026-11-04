// Local dev server for the web client: serves web/ and a MOCK of the Navyk API from content/.
// Not the production backend (that lives in server/). No dependencies.
//   node web/tools/dev-server.mjs [port]
// Mock /api/review: the reply depends on markers in the prompt text, so every state can be tried by hand:
//   "#limit" -> 429, "#down" -> 503, "#offtask" -> off_task, a 16-digit number -> privacy issue,
//   shorter than 60 chars -> draft, otherwise working/strong.
// Mock accounts (in memory, lost on restart; same contract as server/): /api/auth/* and /api/progress.
// E-mails are not sent: confirmation and reset links are printed to the console.
// Dev shortcuts: password "locked-me" -> 429 on login; e-mail containing "+weak" -> 400 weak_password.

import { createServer } from "node:http";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = fileURLToPath(new URL("../", import.meta.url));
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const PORT = Number(process.argv[2] ?? process.env.PORT ?? 8080);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
};
const remaining = new Map();

const send = (res, status, body, type = "application/json; charset=utf-8") => {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

async function readBody(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 20000) break;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function mockReview(body) {
  const prompt = String(body?.prompt ?? "").trim();
  if (prompt.length < 5) return [400, { error: "input_too_short" }];
  if (prompt.length > 4000) return [400, { error: "input_too_long" }];
  if (prompt.includes("#down")) return [503, { error: "unavailable" }];
  const left = remaining.get(body.deviceId) ?? 5;
  if (prompt.includes("#limit") || left <= 0) {
    const reset = new Date();
    reset.setHours(24, 0, 0, 0);
    return [429, { error: "limit", resetAt: reset.toISOString() }];
  }
  remaining.set(body.deviceId, left - 1);
  await new Promise((r) => setTimeout(r, 600));
  const lesson = JSON.parse(await readFile(join(ROOT, "content/dist", body.lang, `${body.lessonId}.json`), "utf8"));
  const ex = lesson.blocks.find((b) => b.id === body.exerciseId);
  const ids = ex?.review?.criteria ?? ["R1", "R2"];
  const privacy = /\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b/.test(prompt);
  const offTask = prompt.includes("#offtask");
  const long = prompt.length >= 60;
  const criteria = ids.map((id, i) => ({ id, applicable: true, score: long ? (i % 3 === 2 ? 1 : 2) : i === 0 ? 1 : 0, comment: `[mock] ${id}` }));
  const score = offTask ? null : long ? 80 : 30;
  const verdict = offTask ? "off_task" : long ? "strong" : "draft";
  return [
    200,
    {
      score,
      verdict,
      passed: !offTask && long && !privacy,
      remaining: left - 1,
      review: {
        privacy_issue: { found: privacy, message: privacy ? "[mock] The prompt contains a card number." : "" },
        off_task: offTask,
        criteria,
        strengths: offTask ? [] : ["[mock] You said clearly what you need."],
        gaps: offTask ? [] : ["[mock] Add who will read it.", "[mock] Say how long it should be."],
        improved_prompt: offTask ? "" : `${prompt}\n\n[mock] For: … Length: …`,
      },
    },
  ];
}

// ---- mock accounts -------------------------------------------------------------------------

const users = new Map(); // email -> { id, email, lang, salt, hash, confirmed, progress, updatedAt }
const sessions = new Map(); // sid -> email
const tokens = new Map(); // token -> { kind: "confirm" | "reset", email, exp }
const fails = new Map(); // email -> { n, until }
const TOKEN_TTL = 30 * 60 * 1000;
const isEmail = (s) => typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim()) && s.length <= 254;
const norm = (s) => String(s ?? "").trim().toLowerCase();
const hashPw = (pw, salt) => scryptSync(pw, salt, 32);
const publicUser = (u) => ({ id: u.id, email: u.email, lang: u.lang });

function issueToken(kind, email, origin) {
  for (const [k, v] of tokens) if (v.kind === kind && v.email === email) tokens.delete(k); // one live link per purpose
  const token = randomBytes(24).toString("base64url");
  tokens.set(token, { kind, email, exp: Date.now() + TOKEN_TTL });
  console.log(`\n[mail to ${email}] ${kind === "confirm" ? "Confirm your email" : "Reset your password"}: ${origin}/#/${kind}/${token}\n`);
}

function takeToken(token, kind) {
  const t = tokens.get(String(token ?? ""));
  if (!t || t.kind !== kind || t.exp < Date.now()) return null;
  tokens.delete(token);
  return t;
}

function cookieSid(req) {
  const m = /(?:^|;\s*)navyk_sid=([\w-]+)/.exec(req.headers.cookie ?? "");
  return m ? m[1] : null;
}

function startSession(res, email) {
  const sid = randomBytes(24).toString("base64url");
  sessions.set(sid, email);
  res.setHeader("Set-Cookie", `navyk_sid=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`);
}

const sessionUser = (req) => users.get(sessions.get(cookieSid(req)) ?? "") ?? null;

async function mockAuth(req, res, path, origin) {
  const method = req.method;
  if (method !== "GET") {
    const o = req.headers.origin;
    if (o && o !== origin) return [403, { error: "bad_origin" }];
  }
  const body = method === "GET" ? null : ((await readBody(req)) ?? {});
  await new Promise((r) => setTimeout(r, 250)); // feel the busy state
  if (path === "/api/auth/me" && method === "GET") {
    const u = sessionUser(req);
    return u ? [200, { user: publicUser(u) }] : [401, { error: "unauthorized" }];
  }
  if (path === "/api/auth/me" && method === "PATCH") {
    const u = sessionUser(req);
    if (!u) return [401, { error: "unauthorized" }];
    if (["ru", "uk", "en", "pl"].includes(body.lang)) u.lang = body.lang;
    return [200, { user: publicUser(u) }];
  }
  if (path === "/api/auth/register" && method === "POST") {
    const email = norm(body.email);
    if (!isEmail(email)) return [400, { error: "invalid_email" }];
    if (String(body.password ?? "").length < 8 || email.includes("+weak")) return [400, { error: "weak_password" }];
    const u = users.get(email);
    if (!u) {
      const salt = randomBytes(16);
      users.set(email, { id: randomBytes(8).toString("hex"), email, lang: ["ru", "uk", "en", "pl"].includes(body.lang) ? body.lang : "en", salt, hash: hashPw(String(body.password), salt), confirmed: false, progress: null, updatedAt: null });
      issueToken("confirm", email, origin);
    } else if (!u.confirmed) issueToken("confirm", email, origin);
    else console.log(`\n[mail to ${email}] Someone tried to sign up with your address. Log in: ${origin}/#/login\n`);
    return [202, { ok: true }];
  }
  if (path === "/api/auth/resend-confirmation" && method === "POST") {
    const u = users.get(norm(body.email));
    if (u && !u.confirmed) issueToken("confirm", u.email, origin);
    return [202, { ok: true }];
  }
  if (path === "/api/auth/confirm" && method === "POST") {
    const t = takeToken(body.token, "confirm");
    const u = t && users.get(t.email);
    if (!u) return [400, { error: "invalid_token" }];
    u.confirmed = true;
    startSession(res, u.email);
    return [200, { user: publicUser(u) }];
  }
  if (path === "/api/auth/login" && method === "POST") {
    const email = norm(body.email);
    const f = fails.get(email);
    if (String(body.password) === "locked-me" || (f && f.until > Date.now())) return [429, { error: "locked", retryAfter: f?.until ? Math.ceil((f.until - Date.now()) / 1000) : 300 }];
    const u = users.get(email);
    const ok = u && timingSafeEqual(hashPw(String(body.password ?? ""), u.salt), u.hash);
    if (!ok) {
      const n = (f?.n ?? 0) + 1;
      fails.set(email, { n, until: n >= 5 ? Date.now() + 5 * 60 * 1000 : 0 });
      return [401, { error: "invalid_credentials" }];
    }
    fails.delete(email);
    if (!u.confirmed) return [403, { error: "email_not_confirmed" }];
    startSession(res, u.email);
    return [200, { user: publicUser(u) }];
  }
  if (path === "/api/auth/logout" && method === "POST") {
    sessions.delete(cookieSid(req));
    res.setHeader("Set-Cookie", "navyk_sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
    return [200, { ok: true }];
  }
  if (path === "/api/auth/forgot" && method === "POST") {
    const u = users.get(norm(body.email));
    if (u) issueToken("reset", u.email, origin);
    return [202, { ok: true }];
  }
  if (path === "/api/auth/reset" && method === "POST") {
    if (String(body.password ?? "").length < 8) return [400, { error: "weak_password" }];
    const t = takeToken(body.token, "reset");
    const u = t && users.get(t.email);
    if (!u) return [400, { error: "invalid_token" }];
    u.salt = randomBytes(16);
    u.hash = hashPw(String(body.password), u.salt);
    u.confirmed = true; // the reset link proves the address
    for (const [sid, e] of sessions) if (e === u.email) sessions.delete(sid);
    startSession(res, u.email);
    return [200, { user: publicUser(u) }];
  }
  if (path === "/api/progress") {
    const u = sessionUser(req);
    if (!u) return [401, { error: "unauthorized" }];
    if (method === "GET") return [200, { data: u.progress, updatedAt: u.updatedAt }];
    if (method === "PUT") {
      if (!body.data || typeof body.data !== "object") return [400, { error: "invalid_progress" }];
      // like server/: last write wins (the client merges before writing); a stale base is only logged
      if ((body.baseUpdatedAt ?? null) !== u.updatedAt) console.log("[progress] base mismatch (client merged against an older copy)");
      u.progress = body.data;
      u.updatedAt = new Date().toISOString();
      return [200, { data: u.progress, updatedAt: u.updatedAt }];
    }
  }
  return [404, { error: "not_found" }];
}

createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const origin = `http://${req.headers.host ?? `localhost:${PORT}`}`;
  try {
    if (url.pathname.startsWith("/api/auth/") || url.pathname === "/api/progress") {
      const [status, body] = await mockAuth(req, res, url.pathname, origin);
      return send(res, status, body);
    }
    if (url.pathname === "/api/course") {
      return send(res, 200, await readFile(join(ROOT, "content/course.json")));
    }
    const m = /^\/api\/lessons\/(ru|uk|en|pl)\/([\w.]+)$/.exec(url.pathname);
    if (m) {
      try {
        return send(res, 200, await readFile(join(ROOT, "content/dist", m[1], `${m[2]}.json`)));
      } catch {
        return send(res, 404, { error: "not_found" });
      }
    }
    if (url.pathname === "/api/review" && req.method === "POST") {
      const [status, body] = await mockReview(await readBody(req));
      return send(res, status, body);
    }
    if (url.pathname.startsWith("/api/")) return send(res, 404, { error: "not_found" });
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
    if (path.endsWith("/")) path += "index.html";
    const file = join(WEB, path);
    if (!file.startsWith(WEB)) return send(res, 403, "forbidden", "text/plain");
    await stat(file);
    return send(res, 200, await readFile(file), TYPES[extname(file)] ?? "application/octet-stream");
  } catch {
    return send(res, 404, "not found", "text/plain");
  }
}).listen(PORT, () => console.log(`Navyk web (mock API): http://localhost:${PORT}/`));
