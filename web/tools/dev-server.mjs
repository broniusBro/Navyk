// Local dev server for the web client: serves web/ and a MOCK of the Navyk API from content/.
// Not the production backend (that lives in server/). No dependencies.
//   node web/tools/dev-server.mjs [port]
// Mock /api/review: the reply depends on markers in the prompt text, so every state can be tried by hand:
//   "#limit" -> 429, "#down" -> 503, "#offtask" -> off_task, a 16-digit number -> privacy issue,
//   shorter than 60 chars -> draft, otherwise working/strong.

import { createServer } from "node:http";
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

createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    if (url.pathname === "/api/course") {
      return send(res, 200, await readFile(join(ROOT, "content/course.json")));
    }
    const m = /^\/api\/lessons\/(ru|uk|en)\/([\w.]+)$/.exec(url.pathname);
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
