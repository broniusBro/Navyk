// node server/src/admin/set-login.ts <email> [owner|admin|viewer]  — пароль читается из stdin (первая строка),
// чтобы он не попал в список процессов и историю shell. Обычно вызывается из deploy/set-admin-login.sh.
import { openDb } from "../db.ts";
import { setAdminLogin } from "./login.ts";
import { isRole } from "./roles.ts";

const [email = "", role = "owner"] = process.argv.slice(2);
if (!isRole(role)) {
  console.error("usage: node server/src/admin/set-login.ts <email> [owner|admin|viewer]  (password on stdin)");
  process.exit(2);
}
let input = "";
for await (const chunk of process.stdin) input += chunk;
const password = input.split(/\r?\n/)[0] ?? "";

const db = openDb();
const r = await setAdminLogin(db, email, password, role);
db.close();
if (r.ok) console.log(`OK: ${r.created ? "account created" : "password updated"}, role ${role}. Other sessions of this account were signed out.`);
else {
  console.error(r.error === "bad_email" ? "This does not look like an email." : "Password too weak: at least 8 characters, not a common one, not the email.");
  process.exit(1);
}
