// Проверка отправки почты на сервере: отправляет одно тестовое письмо и печатает результат.
// Запуск (deploy/test-email.sh): node server/src/email/selftest.ts you@example.com
import { sendTest } from "./send.ts";

const to = process.argv[2] ?? "";
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
  console.error("usage: node server/src/email/selftest.ts you@example.com");
  process.exit(2);
}
const r = await sendTest(to);
console.log(JSON.stringify(r, null, 2));
process.exit(r.status === "sent" ? 0 : 1);
