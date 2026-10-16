// Вход через Google (OAuth 2.0 authorization code + PKCE, без SDK).
// Настройка: GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET (deploy/set-google.sh), redirect URI:
//   <PUBLIC_ORIGIN>/api/auth/google/callback
// ID-токен получаем напрямую от Google по TLS с client_secret, поэтому подпись не проверяем
// (так допускает OpenID Connect для токена из token endpoint), но проверяем iss, aud, exp и email_verified.
import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { parseCookies, publicOrigin, log } from "../httputil.ts";
import { cookieSecure, newSecret } from "./sessions.ts";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const STATE_TTL_SEC = 600;
const LANGS = new Set(["ru", "uk", "en", "pl"]);

export const googleConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
export const redirectUri = () => `${publicOrigin()}/api/auth/google/callback`;

const stateCookieName = () => (cookieSecure() ? "__Host-navyk_oauth" : "navyk_oauth");
const stateCookie = (value: string, maxAge: number) =>
  `${stateCookieName()}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${cookieSecure() ? "; Secure" : ""}`;
export const clearStateCookie = () => stateCookie("", 0);

const b64url = (buf: Buffer) => buf.toString("base64url");

/** Ссылка на Google и cookie с state/PKCE для этого входа. */
export function startGoogle(lang: string): { location: string; cookie: string } {
  const state = newSecret();
  const verifier = newSecret() + newSecret();
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const l = LANGS.has(lang) ? lang : "en";
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
    hl: l,
  });
  return { location: `${AUTH_URL}?${params}`, cookie: stateCookie(`${state}.${verifier}.${l}`, STATE_TTL_SEC) };
}

let fetchImpl: typeof fetch = (...a) => fetch(...a);
export function setGoogleFetch(f: typeof fetch | null) {
  fetchImpl = f ?? ((...a) => fetch(...a));
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  lang: string;
}

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Проверяет ответ Google и возвращает подтверждённый адрес; ошибка — код для журнала. */
export async function finishGoogle(req: IncomingMessage, url: URL, now = Date.now()): Promise<GoogleIdentity | { error: string }> {
  if (url.searchParams.get("error")) return { error: "denied" };
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const [cState = "", verifier = "", lang = "en"] = (parseCookies(req)[stateCookieName()] ?? "").split(".");
  if (!code || !state || !cState || !same(state, cState)) return { error: "bad_state" };

  let tokenRes: Response;
  try {
    tokenRes = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        redirect_uri: redirectUri(),
        grant_type: "authorization_code",
        code_verifier: verifier,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    return { error: `token_fetch_${(e as Error).name}` };
  }
  const body = (await tokenRes.json().catch(() => ({}))) as { id_token?: string; error?: string };
  if (!tokenRes.ok || !body.id_token) return { error: `token_${body.error ?? tokenRes.status}` };

  let claims: any;
  try {
    claims = JSON.parse(Buffer.from(body.id_token.split(".")[1] ?? "", "base64url").toString("utf8"));
  } catch {
    return { error: "bad_id_token" };
  }
  if (claims.iss !== "https://accounts.google.com" && claims.iss !== "accounts.google.com") return { error: "bad_iss" };
  if (claims.aud !== process.env.GOOGLE_CLIENT_ID) return { error: "bad_aud" };
  if (typeof claims.exp !== "number" || claims.exp * 1000 < now) return { error: "expired" };
  if (claims.email_verified !== true || typeof claims.email !== "string" || typeof claims.sub !== "string") return { error: "email_not_verified" };
  return { sub: claims.sub, email: claims.email.trim().toLowerCase(), lang: LANGS.has(lang) ? lang : "en" };
}

export function redirect(res: ServerResponse, location: string, cookies: string[]) {
  res.writeHead(302, { location, "set-cookie": cookies, "cache-control": "no-store", "referrer-policy": "no-referrer" });
  res.end();
}

export const logGoogle = (entry: Record<string, unknown>) => log({ event: "google_auth", ...entry });
