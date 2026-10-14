// Отправка писем через HTTP API провайдера (встроенный fetch, без SDK).
// EMAIL_PROVIDER=brevo|resend|log (по умолчанию log). EMAIL_API_KEY, EMAIL_FROM.
// Адреса, ссылки и токены в журнал не пишем; в email_log хранится только SHA-256 адреса.
import { createHash } from "node:crypto";
import type { Db } from "../db.ts";
import { log } from "../httputil.ts";
import { renderEmail, type EmailKind, type EmailLang, type RenderedEmail } from "./templates.ts";

export interface OutgoingEmail extends RenderedEmail {
  to: string;
  kind: EmailKind;
  /** Ссылка из письма. Нужна только для провайдера log в разработке и для тестов. */
  link: string;
}

type Provider = "brevo" | "resend" | "log";

const DEFAULT_FROM = "Navyk <no-reply@navyk.app>";

export function parseFrom(from: string): { name: string; email: string } {
  const m = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].replace(/^"|"$/g, ""), email: m[2].trim() };
  return { name: "Navyk", email: from.trim() };
}

function provider(): Provider {
  const p = (process.env.EMAIL_PROVIDER ?? "log").toLowerCase();
  return p === "brevo" || p === "resend" ? p : "log";
}

const isProduction = () => process.env.NODE_ENV === "production";

/** Хук для тестов: получает каждое письмо, «отправленное» провайдером log. */
let captureHook: ((m: OutgoingEmail) => void) | null = null;
export function setEmailCapture(hook: ((m: OutgoingEmail) => void) | null) {
  captureHook = hook;
}

/** Подменяемый fetch (для тестов адаптеров). */
let fetchImpl: typeof fetch = (...a) => fetch(...a);
export function setEmailFetch(f: typeof fetch | null) {
  fetchImpl = f ?? ((...a) => fetch(...a));
}

export function buildProviderRequest(p: "brevo" | "resend", m: OutgoingEmail, apiKey: string, from: string) {
  if (p === "brevo") {
    // https://developers.brevo.com/reference/sendtransacemail
    return {
      url: "https://api.brevo.com/v3/smtp/email",
      init: {
        method: "POST",
        headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          sender: parseFrom(from),
          to: [{ email: m.to }],
          subject: m.subject,
          htmlContent: m.html,
          textContent: m.text,
          tags: [`navyk-${m.kind}`],
        }),
      },
    };
  }
  // https://resend.com/docs/api-reference/emails/send-email
  return {
    url: "https://api.resend.com/emails",
    init: {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from,
        to: [m.to],
        subject: m.subject,
        html: m.html,
        text: m.text,
        tags: [{ name: "kind", value: m.kind }],
      }),
    },
  };
}

/** Код и текст ошибки провайдера без адресов почты (до 300 символов). */
export async function providerReason(res: Response): Promise<{ code?: string; message?: string }> {
  try {
    const raw = (await res.text()).slice(0, 2000);
    const redact = (v: unknown) => String(v ?? "").replace(/[^\s"'<>]+@[^\s"'<>]+/g, "<email>").slice(0, 300);
    try {
      const j = JSON.parse(raw);
      const code = j.code ?? j.name ?? j.error?.code;
      const message = j.message ?? j.error?.message ?? j.error;
      return { code: code ? redact(code) : undefined, message: message ? redact(message) : undefined };
    } catch {
      return raw ? { message: redact(raw) } : {};
    }
  } catch {
    return {};
  }
}

let lastError: { status?: number; code?: string; message?: string } | null = null;

/** Отправить одно письмо и вернуть результат (для проверки настройки почты на сервере). */
export async function sendTest(to: string, lang: EmailLang = "ru") {
  lastError = null;
  const rendered = renderEmail("confirm", lang, "https://navyk.app/#/email-test");
  const status = await deliver({ ...rendered, to, kind: "confirm", link: "https://navyk.app/#/email-test" });
  return { provider: provider(), from: process.env.EMAIL_FROM || DEFAULT_FROM, status, error: lastError };
}

async function deliver(m: OutgoingEmail): Promise<"sent" | "logged" | "failed"> {
  const p = provider();
  if (p === "log") {
    captureHook?.(m);
    if (isProduction()) log({ event: "email_due", kind: m.kind, provider: "log", note: "EMAIL_PROVIDER not configured; email not sent" });
    else log({ event: "email_dev", kind: m.kind, link: m.link });
    return "logged";
  }
  const apiKey = process.env.EMAIL_API_KEY ?? "";
  if (!apiKey) {
    log({ event: "email_error", kind: m.kind, provider: p, code: "no_api_key" });
    lastError = { code: "no_api_key" };
    return "failed";
  }
  const { url, init } = buildProviderRequest(p, m, apiKey, process.env.EMAIL_FROM || DEFAULT_FROM);
  try {
    const res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(10_000) });
    if (res.ok) {
      await res.body?.cancel();
      return "sent";
    }
    // Причину отказа пишем в журнал без адресов (их вырезаем): так видно, что чинить в кабинете провайдера.
    const reason = await providerReason(res);
    log({ event: "email_error", kind: m.kind, provider: p, status: res.status, ...reason });
    lastError = { status: res.status, ...reason };
    return "failed";
  } catch (e) {
    log({ event: "email_error", kind: m.kind, provider: p, code: (e as Error).name });
    lastError = { code: (e as Error).name, message: String((e as Error).message).slice(0, 300) };
    return "failed";
  }
}

export const hashAddress = (email: string) => createHash("sha256").update(email.toLowerCase()).digest("hex");

const pending = new Set<Promise<unknown>>();

/**
 * Ставит письмо в отправку и сразу возвращает управление: ответ API не ждёт провайдера
 * (одинаковое время ответа для всех веток и 202 даже при сбое отправки).
 */
export function queueEmail(db: Db | null, args: { userId: string | null; to: string; kind: EmailKind; lang: EmailLang; link: string }) {
  const rendered = renderEmail(args.kind, args.lang, args.link);
  const msg: OutgoingEmail = { ...rendered, to: args.to, kind: args.kind, link: args.link };
  const job = deliver(msg)
    .then((status) => {
      try {
        db?.prepare("INSERT INTO email_log (user_id, kind, to_hash, status, created_at) VALUES (?, ?, ?, ?, ?)").run(
          args.userId,
          args.kind,
          hashAddress(args.to),
          status,
          Date.now(),
        );
      } catch (e) {
        log({ event: "email_log_error", message: String((e as Error).message).slice(0, 200) });
      }
    })
    .finally(() => pending.delete(job));
  pending.add(job);
}

/** Для тестов и корректной остановки: дождаться всех писем в очереди. */
export async function flushEmails() {
  while (pending.size) await Promise.all([...pending]);
}
