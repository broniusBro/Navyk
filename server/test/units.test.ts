// Модульные тесты: пароли, письма (шаблоны и запросы к провайдерам), миграции, резервные копии, лимиты.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { hashPassword, verifyPassword, isWeakPassword } from "../src/auth/password.ts";
import { renderEmail } from "../src/email/templates.ts";
import { buildProviderRequest, parseFrom, queueEmail, flushEmails, setEmailFetch, setEmailCapture, type OutgoingEmail } from "../src/email/send.ts";
import { openDb, migrate } from "../src/db.ts";
import { backup, prune } from "../src/backup.ts";
import { WindowLimiter } from "../src/limits.ts";

test("password hash format, verify, constant-length compare", async () => {
  const h = await hashPassword("correct horse battery");
  assert.match(h, /^scrypt\$32768\$8\$1\$/);
  assert.equal(await verifyPassword("correct horse battery", h), true);
  assert.equal(await verifyPassword("correct horse batterY", h), false);
  assert.equal(await verifyPassword("x", "garbage"), false);
  assert.notEqual(await hashPassword("same"), await hashPassword("same")); // salt
});

test("password rules", () => {
  assert.equal(isWeakPassword("short", "a@b.co"), true);
  assert.equal(isWeakPassword("x".repeat(129), "a@b.co"), true);
  assert.equal(isWeakPassword("Password123", "a@b.co"), true);
  assert.equal(isWeakPassword("qwertyuiop", "a@b.co"), true);
  assert.equal(isWeakPassword("Anna@Example.com", "anna@example.com"), true);
  assert.equal(isWeakPassword("aaaaaaaaaa", "a@b.co"), true);
  assert.equal(isWeakPassword(12345678, "a@b.co"), true);
  assert.equal(isWeakPassword("мой кот Барсик", "a@b.co"), false);
  assert.equal(isWeakPassword("x".repeat(127) + "y", "a@b.co"), false);
});

test("email templates: all languages, escaping, brolingvo footer and style", () => {
  const LINK = "https://poland.brolingvo.com/#/confirm/abc";
  const footers = {
    ru: "brolingvo — бесплатный курс польского языка.",
    uk: "brolingvo — безкоштовний курс польської мови.",
    en: "brolingvo — a free Polish course.",
    pl: "brolingvo — darmowy kurs języka polskiego.",
  };
  for (const lang of ["ru", "uk", "en", "pl"] as const) {
    for (const kind of ["confirm", "reset", "already_registered"] as const) {
      const m = renderEmail(kind, lang, LINK);
      assert.ok(m.subject.length > 5 && m.subject.length < 60, `${lang}/${kind} subject`);
      assert.match(m.subject, /brolingvo/, `${lang}/${kind} subject names the product`);
      assert.ok(m.text.includes(LINK));
      assert.ok(m.html.includes(`href="${LINK}"`));
      assert.ok(m.text.includes(footers[lang]), `${lang}/${kind} text footer`);
      assert.ok(m.html.includes(footers[lang]), `${lang}/${kind} html footer`);
      assert.ok(m.html.includes(`<html lang="${lang}">`));
      assert.match(m.html, />brolingvo</, "wordmark");
      assert.match(m.html, /#FFFDF8/);
      assert.match(m.html, /background:#FFB020;color:#1B1A2E/);
      // the old brand and the old course subject are gone
      assert.doesNotMatch(m.text + m.html, /navyk|anthropic|claude/i);
    }
  }
  assert.ok(renderEmail("reset", "en", 'https://x/"><script>').html.includes("&quot;&gt;&lt;script&gt;"));
});

const msg: OutgoingEmail = {
  ...renderEmail("confirm", "en", "https://poland.brolingvo.com/#/confirm/t"),
  to: "a@b.co",
  kind: "confirm",
  link: "https://poland.brolingvo.com/#/confirm/t",
};

test("provider request shapes: Brevo and Resend", () => {
  assert.deepEqual(parseFrom("brolingvo <no-reply@brolingvo.com>"), { name: "brolingvo", email: "no-reply@brolingvo.com" });
  assert.deepEqual(parseFrom("hi@brolingvo.com"), { name: "brolingvo", email: "hi@brolingvo.com" });

  const b = buildProviderRequest("brevo", msg, "KEY", "brolingvo <no-reply@brolingvo.com>");
  assert.equal(b.url, "https://api.brevo.com/v3/smtp/email");
  assert.equal((b.init.headers as any)["api-key"], "KEY");
  const bb = JSON.parse(b.init.body);
  assert.deepEqual(bb.sender, { name: "brolingvo", email: "no-reply@brolingvo.com" });
  assert.deepEqual(bb.tags, ["brolingvo-confirm"]);
  assert.deepEqual(bb.to, [{ email: "a@b.co" }]);
  assert.ok(bb.htmlContent && bb.textContent && bb.subject);

  const r = buildProviderRequest("resend", msg, "KEY", "brolingvo <no-reply@brolingvo.com>");
  assert.equal(r.url, "https://api.resend.com/emails");
  assert.equal((r.init.headers as any).authorization, "Bearer KEY");
  const rb = JSON.parse(r.init.body);
  assert.equal(rb.from, "brolingvo <no-reply@brolingvo.com>");
  assert.deepEqual(rb.to, ["a@b.co"]);
  assert.ok(rb.html && rb.text && rb.subject);
});

async function withEnv(env: Record<string, string | undefined>, fn: () => Promise<void>) {
  const old: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) {
    old[k] = process.env[k];
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  try {
    await fn();
  } finally {
    for (const k of Object.keys(old)) {
      if (old[k] === undefined) delete process.env[k];
      else process.env[k] = old[k];
    }
  }
}

function captureLogs(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const orig = console.log;
  console.log = (...a: unknown[]) => void lines.push(a.join(" "));
  return { lines, restore: () => (console.log = orig) };
}

test("email sending: provider failure is logged without address and recorded in email_log", async () => {
  const db = openDb(":memory:");
  db.prepare("INSERT INTO users (id, email, password_hash, lang, created_at) VALUES ('u1', 'a@b.co', 'x', 'en', 0)").run();
  const calls: { url: string; init: any }[] = [];
  setEmailFetch((async (url: string, init: any) => {
    calls.push({ url, init });
    return new Response('{"message":"invalid a@b.co"}', { status: 401 });
  }) as typeof fetch);
  const logs = captureLogs();
  try {
    await withEnv({ EMAIL_PROVIDER: "resend", EMAIL_API_KEY: "re_test", EMAIL_FROM: undefined }, async () => {
      queueEmail(db, { userId: "u1", to: "a@b.co", kind: "confirm", lang: "en", link: "https://poland.brolingvo.com/#/confirm/SECRET" });
      await flushEmails();
    });
  } finally {
    logs.restore();
    setEmailFetch(null);
  }
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.resend.com/emails");
  const row = db.prepare("SELECT * FROM email_log").get() as any;
  assert.equal(row.status, "failed");
  assert.equal(row.kind, "confirm");
  const all = logs.lines.join("\n");
  assert.match(all, /email_error/);
  assert.ok(!all.includes("a@b.co") && !all.includes("SECRET") && !all.includes("re_test"));
  db.close();
});

test("email provider log: link printed in dev, never in production", async () => {
  const captured: OutgoingEmail[] = [];
  setEmailCapture((m) => captured.push(m));
  const logs = captureLogs();
  try {
    await withEnv({ EMAIL_PROVIDER: "log", NODE_ENV: "development" }, async () => {
      queueEmail(null, { userId: null, to: "a@b.co", kind: "reset", lang: "ru", link: "https://x/#/reset/DEVTOKEN" });
      await flushEmails();
    });
    await withEnv({ EMAIL_PROVIDER: "log", NODE_ENV: "production" }, async () => {
      queueEmail(null, { userId: null, to: "a@b.co", kind: "reset", lang: "ru", link: "https://x/#/reset/PRODTOKEN" });
      await flushEmails();
    });
  } finally {
    logs.restore();
    setEmailCapture(null);
  }
  const all = logs.lines.join("\n");
  assert.match(all, /DEVTOKEN/);
  assert.ok(!all.includes("PRODTOKEN"));
  assert.match(all, /email_due/);
  assert.ok(!all.includes("a@b.co"));
  assert.equal(captured.length, 2);
});

test("migrations are idempotent and versioned", () => {
  const db = new DatabaseSync(":memory:");
  assert.deepEqual(migrate(db), [1, 2, 3, 4]);
  assert.deepEqual(migrate(db), []);
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as any[]).map((r) => r.name);
  for (const t of ["users", "sessions", "tokens", "progress", "email_log", "migrations", "visits", "admin_roles", "admin_audit"]) assert.ok(tables.includes(t), t);
  const userCols = (db.prepare("PRAGMA table_info(users)").all() as any[]).map((r) => r.name);
  assert.ok(userCols.includes("name") && userCols.includes("google_sub"));
  db.close();
});

test("WAL mode on file database", () => {
  const dir = mkdtempSync(join(tmpdir(), "brolingvo-wal-"));
  try {
    const db = openDb(join(dir, "brolingvo.sqlite"));
    assert.equal((db.prepare("PRAGMA journal_mode").get() as any).journal_mode, "wal");
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("backup: VACUUM INTO a dated file, keeps 14 days", () => {
  const dir = mkdtempSync(join(tmpdir(), "brolingvo-backup-"));
  try {
    assert.throws(() => backup(dir), /database file not found/);
    const db = openDb(join(dir, "brolingvo.sqlite"));
    db.prepare("INSERT INTO users (id, email, password_hash, lang, created_at) VALUES ('u1', 'a@b.co', 'x', 'en', 0)").run();
    const out = join(dir, "backups");
    backup(dir, new Date("2026-10-13T03:30:00Z")); // creates backups/
    writeFileSync(join(out, "brolingvo-2026-09-01.sqlite"), "old");
    writeFileSync(join(out, "brolingvo-2026-10-01.sqlite"), "recent");
    writeFileSync(join(out, "navyk-2026-09-01.sqlite"), "not ours: left alone");
    writeFileSync(join(out, "notes.txt"), "keep");
    const file = backup(dir, new Date("2026-10-13T03:30:00Z")); // same day again: overwrites
    assert.ok(file.endsWith("brolingvo-2026-10-13.sqlite"));
    const copy = new DatabaseSync(file);
    assert.equal((copy.prepare("SELECT count(*) AS c FROM users").get() as any).c, 1);
    copy.close();
    assert.deepEqual(readdirSync(out).sort(), ["brolingvo-2026-10-01.sqlite", "brolingvo-2026-10-13.sqlite", "navyk-2026-09-01.sqlite", "notes.txt"]);
    assert.deepEqual(prune(out, new Date("2026-10-20T00:00:00Z")), ["brolingvo-2026-10-01.sqlite"]);
    assert.ok(existsSync(join(out, "brolingvo-2026-10-13.sqlite")));
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("window limiter", () => {
  const l = new WindowLimiter(2, 60_000);
  assert.equal(l.hit("a", 0), 0);
  assert.equal(l.hit("a", 1), 0);
  assert.equal(l.hit("a", 2), 60);
  assert.equal(l.hit("b", 2), 0);
  assert.equal(l.hit("a", 60_001), 0);
});

test("same-site check without PUBLIC_ORIGIN compares Origin with Host", async () => {
  const { isSameSite } = await import("../src/httputil.ts");
  const saved = process.env.PUBLIC_ORIGIN;
  delete process.env.PUBLIC_ORIGIN;
  try {
    assert.equal(isSameSite("https://poland.brolingvo.com", "poland.brolingvo.com"), true);
    assert.equal(isSameSite("https://evil.example", "poland.brolingvo.com"), false);
    assert.equal(isSameSite("http://poland.brolingvo.com", "poland.brolingvo.com"), false);
    assert.equal(isSameSite(undefined, "poland.brolingvo.com"), false);
    assert.equal(isSameSite("http://localhost:8080", "localhost:8080"), true);
  } finally {
    if (saved !== undefined) process.env.PUBLIC_ORIGIN = saved;
  }
});

test("email: provider error reason is logged without addresses", async () => {
  const { providerReason } = await import("../src/email/send.ts");
  const r = await providerReason(new Response(JSON.stringify({ code: "unauthorized", message: "We have detected you are using an unrecognised IP address 1.2.3.4 for user a.b@site.co" }), { status: 401 }));
  assert.equal(r.code, "unauthorized");
  assert.ok(r.message?.includes("unrecognised IP"));
  assert.ok(!r.message?.includes("a.b@site.co") && r.message?.includes("<email>"));
  assert.deepEqual(await providerReason(new Response("", { status: 500 })), {});
});

test("email: sender from EMAIL_FROM always has an address", async () => {
  const { parseFrom, senderHeader } = await import("../src/email/send.ts");
  assert.deepEqual(parseFrom("brolingvo"), { name: "brolingvo", email: "no-reply@brolingvo.com" });
  assert.deepEqual(parseFrom(""), { name: "brolingvo", email: "no-reply@brolingvo.com" });
  assert.deepEqual(parseFrom("hi@brolingvo.com"), { name: "brolingvo", email: "hi@brolingvo.com" });
  assert.deepEqual(parseFrom('"brolingvo Team" <team@brolingvo.com>'), { name: "brolingvo Team", email: "team@brolingvo.com" });
  assert.equal(senderHeader("brolingvo"), "brolingvo <no-reply@brolingvo.com>");
});
