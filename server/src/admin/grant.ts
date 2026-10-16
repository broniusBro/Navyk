// Выдать роль в админке из консоли сервера (например, первому владельцу):
//   docker compose exec app node server/src/admin/grant.ts you@example.com owner
// Пользователь должен быть зарегистрирован на сайте и подтвердить почту (или войти через Google).
import { openDb } from "../db.ts";
import { grantFromConsole } from "./routes.ts";
import { isRole } from "./roles.ts";

const [email = "", role = "owner"] = process.argv.slice(2);
if (!email.includes("@") || !isRole(role)) {
  console.error("usage: node server/src/admin/grant.ts <email> [owner|admin|viewer]");
  process.exit(2);
}
const db = openDb();
const r = grantFromConsole(db, email, role);
db.close();
if (r.ok) console.log(`OK: ${role} access granted. Sign in at the admin site with this account.`);
else {
  console.error(
    r.error === "user_not_found"
      ? "No account with this email. Register at the main site first."
      : "The email is not confirmed yet. Confirm it (or sign in with Google) and run again.",
  );
  process.exit(1);
}
