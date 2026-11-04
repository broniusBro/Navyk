// Роли администраторов и их права. Права проверяются на сервере для каждого запроса.
export type Role = "owner" | "admin" | "viewer";
export type Permission = "stats.read" | "users.read" | "users.contacts" | "progress.read" | "admins.read" | "admins.manage" | "audit.read";

export const ROLES: Role[] = ["owner", "admin", "viewer"];

export const PERMISSIONS: Record<Role, Permission[]> = {
  // Владелец: всё, включая назначение других владельцев.
  owner: ["stats.read", "users.read", "users.contacts", "progress.read", "admins.read", "admins.manage", "audit.read"],
  // Администратор: всё, кроме назначения и снятия владельцев.
  admin: ["stats.read", "users.read", "users.contacts", "progress.read", "admins.read", "admins.manage", "audit.read"],
  // Наблюдатель: статистика и прогресс без адресов почты, без управления доступом.
  viewer: ["stats.read", "users.read", "progress.read"],
};

export const isRole = (v: unknown): v is Role => typeof v === "string" && (ROLES as string[]).includes(v);
export const can = (role: Role | null | undefined, p: Permission) => !!role && PERMISSIONS[role].includes(p);

/** Может ли actor выдать/снять роль target (или назначить role). Владельцев трогает только владелец. */
export function canManage(actor: Role, targetCurrent: Role | null, newRole: Role | null): boolean {
  if (!can(actor, "admins.manage")) return false;
  if (actor === "owner") return true;
  return targetCurrent !== "owner" && newRole !== "owner";
}

/** Адрес почты для роли без права на контакты: a***@example.com */
export function maskEmail(email: string): string {
  const [local, domain = ""] = email.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
}
