// Хеширование паролей: scrypt N=2^15, r=8, p=1, соль 16 байт, ключ 64 байта.
// Формат: scrypt$N$r$p$<salt base64url>$<hash base64url>. Сравнение — за постоянное время.
import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";

const N = 2 ** 15;
const R = 8;
const P = 1;
const KEYLEN = 64;
// 128 * N * r = 32 MiB; запас для параллельных запросов задаётся maxmem.
const MAXMEM = 128 * N * R * 2;

function derive(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((ok, fail) =>
    scrypt(password.normalize("NFKC"), salt, KEYLEN, { N: n, r, p, maxmem: Math.max(MAXMEM, 128 * n * r * 2) }, (err, key) =>
      err ? fail(err) : ok(key),
    ),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [n, r, p] = parts.slice(1, 4).map(Number);
  if (![n, r, p].every((x) => Number.isInteger(x) && x > 0) || n > 2 ** 20) return false;
  const salt = Buffer.from(parts[4], "base64url");
  const expected = Buffer.from(parts[5], "base64url");
  const key = await derive(password, salt, n, r, p);
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Хеш-пустышка: проверяем пароль и для несуществующего адреса, чтобы время ответа не выдавало наличие аккаунта. */
let dummy: Promise<string> | null = null;
export async function dummyVerify(password: string): Promise<void> {
  dummy ??= hashPassword(randomBytes(16).toString("hex"));
  await verifyPassword(password, await dummy);
}

// Небольшой встроенный список самых частых паролей (длиной от 8 символов — короче отсекаются правилом длины).
const COMMON = new Set(
  `password password1 password12 password123 password1234 passw0rd p@ssw0rd p@ssword 12345678 123456789 1234567890
  12345678910 123123123 11111111 00000000 88888888 87654321 11223344 12341234 1q2w3e4r 1q2w3e4r5t 1qaz2wsx qwertyui
  qwertyuiop qwerty123 qwerty1234 qwerty12 asdfghjk asdfghjkl zxcvbnm1 iloveyou iloveyou1 sunshine princess football
  baseball superman batman123 trustno1 whatever starwars welcome1 welcome123 letmein1 letmein123 admin123 admin1234
  administrator abc12345 abcd1234 abcdefgh aa123456 a1234567 monkey123 dragon123 master123 shadow123 michael1 jennifer
  computer internet changeme secret123 freedom1 samsung1 google123 zaq12wsx 1qazxsw2 q1w2e3r4 q1w2e3r4t5 555555555
  666666666 777777777 999999999 147258369 123654789 987654321 qazwsxedc 1234qwer qwer1234 parol123 parolparol
  йцукенгш йцукенгшщз пароль123 пароль1234 navyk123 navyk1234 claude123 anthropic`.split(/\s+/).filter(Boolean),
);

export function isWeakPassword(password: unknown, email: string): boolean {
  if (typeof password !== "string") return true;
  const len = [...password].length;
  if (len < 8 || len > 128) return true;
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return true;
  const e = email.toLowerCase();
  if (lower === e || lower === e.split("@")[0]) return true;
  if (/^(.)\1+$/.test(password)) return true; // один символ, повторённый много раз
  return false;
}
