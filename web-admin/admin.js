// Navyk admin (admin.navyk.app). Vanilla ES module, no dependencies, no HTML sinks:
// all text goes through textContent, so user data (emails) cannot inject markup.

const app = document.getElementById("app");
let T = {};
let me = null; // { user, role, permissions, roles }
let levelsMeta = []; // [{ id, title }]

// ---------------- helpers ----------------

function t(key, vars = {}) {
  const v = key.split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), T);
  const s = typeof v === "string" ? v : key;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
}

function h(tag, attrs, ...children) {
  const [name, ...classes] = tag.split(".");
  const el = document.createElement(name || "div");
  if (classes.length) el.className = classes.join(" ");
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "style") el.style.cssText = v; // CSSOM: allowed by the strict CSP, unlike style attributes
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

// replaceChildren() would print null/false as text; skip them like h() does.
function put(el, ...children) {
  el.replaceChildren(...children.flat(Infinity).filter((c) => c != null && c !== false));
}

async function api(path, { method = "GET", json } = {}) {
  try {
    const r = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: json !== undefined ? { "content-type": "application/json" } : {},
      body: json !== undefined ? JSON.stringify(json) : undefined,
    });
    const text = await r.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    return { status: r.status, body };
  } catch {
    return { status: 0, body: null };
  }
}

const can = (p) => !!me?.permissions?.includes(p);
const dtf = new Intl.DateTimeFormat("ru", { dateStyle: "medium", timeStyle: "short" });
const df = new Intl.DateTimeFormat("ru", { dateStyle: "medium" });
const fmtDateTime = (iso) => (iso ? dtf.format(new Date(iso)) : "—");
const fmtDate = (iso) => (iso ? df.format(new Date(iso.length === 10 ? `${iso}T12:00:00` : iso)) : "—");
const fmtMin = (m) => (m >= 60 ? `${Math.floor(m / 60)} ч ${m % 60} мин` : `${m} мин`);
const levelTitle = (id) => levelsMeta.find((l) => l.id === id)?.title?.ru ?? id;
const levelShort = { beginner: "Н", advanced: "П", pro: "Р" };
const roleTitle = (r) => t(`roles.${r}`);

function query() {
  const [, q = ""] = location.hash.split("?");
  return new URLSearchParams(q);
}

function page(title, ...content) {
  return h("div", null, h("h1.page-title", null, h("mark", null, title)), ...content);
}
const loading = () => h("p.muted", null, t("app.loading"));
const failed = () => h("p.note.note--error", null, t("app.error"));

// ---------------- shell ----------------

function shell(active, content) {
  const link = (hash, key, perm) =>
    !perm || can(perm) ? h("a", { href: hash, "aria-current": active === hash ? "page" : null }, t(key)) : null;
  return h(
    "div.shell",
    null,
    h(
      "aside.side",
      null,
      h("p.brand", null, "navyk", h("span", null, "."), h("small", null, "admin")),
      h(
        "nav.nav",
        { "aria-label": "Admin" },
        link("#/", "app.nav_overview", "stats.read"),
        link("#/users", "app.nav_users", "users.read"),
        link("#/admins", "app.nav_admins", "admins.read"),
        link("#/audit", "app.nav_audit", "audit.read"),
      ),
      h(
        "div.who",
        null,
        h("b", null, me.user.email),
        roleTitle(me.role),
        " · ",
        h("a", { href: "#", onclick: (e) => (e.preventDefault(), logout()) }, t("app.logout")),
      ),
    ),
    h("main.main", { id: "main" }, content),
  );
}

async function logout() {
  await api("/api/auth/logout", { method: "POST", json: {} });
  me = null;
  location.hash = "#/login";
  route();
}

// ---------------- login ----------------

function renderLogin(reason) {
  const email = h("input.input", { type: "email", autocomplete: "username", required: true, id: "email", maxlength: 254 });
  const password = h("input.input", { type: "password", autocomplete: "current-password", required: true, id: "password", maxlength: 128 });
  const msg = h("div");
  const show = (key) => msg.replaceChildren(h("p.note.note--error", null, t(key)));
  if (reason) show(`login.${reason}`);
  const submit = h("button.btn.btn--primary", { type: "submit" }, t("login.submit"));
  const form = h(
    "form",
    {
      onsubmit: async (e) => {
        e.preventDefault();
        submit.disabled = true;
        const r = await api("/api/auth/login", { method: "POST", json: { email: email.value.trim(), password: password.value } });
        submit.disabled = false;
        if (r.status === 200) return boot();
        show(r.status === 403 ? "login.not_confirmed" : r.status === 429 ? "login.locked" : "login.invalid");
      },
    },
    h("label.field", { for: "email" }, t("login.email"), email),
    h("label.field", { for: "password" }, t("login.password"), password),
    msg,
    submit,
  );
  app.replaceChildren(
    h("div.login", null, h("div.card", null, h("p.brand", null, "navyk", h("span", null, "."), h("small", null, "admin")), h("h1", null, t("login.title")), h("p.muted", null, t("login.lead")), form, h("p.muted.small", null, t("login.google_hint")))),
  );
  email.focus();
}

// ---------------- overview ----------------

async function renderOverview() {
  const box = h("div", null, loading());
  app.replaceChildren(shell("#/", page(t("overview.title"), box)));
  const r = await api("/api/admin/stats");
  if (r.status !== 200) return box.replaceChildren(failed());
  const s = r.body;
  levelsMeta = s.levels.map((l) => ({ id: l.id, title: l.title }));
  const tile = (label, value) => h("div.tile", null, h("div.tile__label", null, label), h("div.tile__value", null, value));
  const tiles = h(
    "div.tiles",
    null,
    tile(t("overview.users"), s.users.total),
    tile(t("overview.confirmed"), s.users.confirmed),
    tile(t("overview.new7d"), s.users.new7d),
    tile(t("overview.google"), s.users.google),
    tile(t("overview.active1d"), s.users.active1d),
    tile(t("overview.active7d"), s.users.active7d),
    tile(t("overview.active30d"), s.users.active30d),
    tile(t("overview.lessons"), s.lessonsCompleted),
    tile(t("overview.visits7d"), s.visits7d.count),
    tile(t("overview.avg_visit"), t("overview.minutes", { n: s.visits7d.avgMinutes })),
  );
  const days = Object.entries(s.registrationsByDay);
  const max = Math.max(1, ...days.map(([, n]) => n));
  const bars = h(
    "div",
    null,
    h(
      "div.bars",
      { role: "img", "aria-label": t("overview.registrations") },
      days.map(([d, n]) => h(`div.bars__bar${n ? "" : ".is-zero"}`, { style: `height:${Math.max(2, (n / max) * 100)}%`, title: `${fmtDate(d)}: ${n}` })),
    ),
    h("div.bars__axis", null, h("span", null, fmtDate(days[0][0])), h("span", null, fmtDate(days.at(-1)[0]))),
  );
  const levels = h(
    "div.table-wrap",
    null,
    h(
      "table",
      null,
      h("thead", null, h("tr", null, h("th", null, t("overview.level")), h("th.num", null, t("overview.lessons_in_level")), h("th.num", null, t("overview.started")), h("th.num", null, t("overview.current")), h("th.num", null, t("overview.finished")))),
      h(
        "tbody",
        null,
        s.levels.map((l) =>
          h(
            "tr.is-link",
            { onclick: () => (location.hash = `#/users?level=${l.id}`) },
            h("td", null, h(`span.pill.pill--${l.id}`, null, l.title.ru)),
            h("td.num", null, l.lessons),
            h("td.num", null, l.started),
            h("td.num", null, l.current),
            h("td.num", null, l.finished),
          ),
        ),
      ),
    ),
  );
  box.replaceChildren(tiles, h("div.grid2", null, h("section.card", null, h("h2", null, t("overview.registrations")), bars), h("section.card", null, h("h2", null, t("overview.levels")), levels)));
}

// ---------------- users ----------------

function levelBars(levels) {
  return h(
    "div",
    null,
    levels.map((l) =>
      h(
        "div.lv",
        { title: `${levelTitle(l.id)}: ${l.done}/${l.total}` },
        h("span", null, levelShort[l.id] ?? l.id),
        h("div.lv__track", null, h("div.lv__fill", { style: `width:${l.total ? (l.done / l.total) * 100 : 0}%` })),
        h("span.muted", null, `${l.done}/${l.total}`),
      ),
    ),
  );
}

async function ensureLevels() {
  if (levelsMeta.length) return;
  const r = await api("/api/admin/stats");
  if (r.status === 200) levelsMeta = r.body.levels.map((l) => ({ id: l.id, title: l.title }));
}

async function renderUsers() {
  const q = query();
  const state = { q: q.get("q") ?? "", level: q.get("level") ?? "", sort: q.get("sort") ?? "created", page: Number(q.get("page") ?? 1) || 1 };
  const box = h("div", null, loading());
  await ensureLevels();
  const setHash = (patch) => {
    const next = { ...state, ...patch };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v && !(k === "page" && v === 1) && !(k === "sort" && v === "created")) p.set(k, v);
    location.hash = `#/users${p.toString() ? `?${p}` : ""}`;
  };
  const search = h("input.input.input--wide", { type: "search", maxlength: 254, value: state.q, placeholder: t("users.search"), "aria-label": t("users.search") });
  let timer = 0;
  search.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => setHash({ q: search.value.trim(), page: 1 }), 350);
  });
  const levelSel = h(
    "select.select",
    { "aria-label": t("users.col_level"), onchange: (e) => setHash({ level: e.target.value, page: 1 }) },
    h("option", { value: "" }, t("users.level_all")),
    levelsMeta.map((l) => h("option", { value: l.id, selected: state.level === l.id }, l.title.ru)),
    h("option", { value: "none", selected: state.level === "none" }, t("users.level_none")),
  );
  const sortSel = h(
    "select.select",
    { "aria-label": t("users.sort"), onchange: (e) => setHash({ sort: e.target.value, page: 1 }) },
    ["created", "seen", "xp", "completed", "time"].map((s) => h("option", { value: s, selected: state.sort === s }, t(`users.sort_${s}`))),
  );
  app.replaceChildren(shell("#/users", page(t("users.title"), h("div.toolbar", null, search, levelSel, sortSel), box)));
  if (state.q) {
    search.focus();
    search.setSelectionRange(state.q.length, state.q.length);
  }
  const p = new URLSearchParams({ sort: state.sort, page: String(state.page) });
  if (state.q) p.set("q", state.q);
  if (state.level) p.set("level", state.level);
  const r = await api(`/api/admin/users?${p}`);
  if (r.status !== 200) return box.replaceChildren(failed());
  const { users, total, pageSize } = r.body;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (!users.length) return box.replaceChildren(h("p.muted", null, t("users.empty")));
  const rows = users.map((u) =>
    h(
      "tr.is-link",
      { tabindex: 0, onclick: () => (location.hash = `#/users/${u.id}`), onkeydown: (e) => e.key === "Enter" && (location.hash = `#/users/${u.id}`) },
      h("td", null, h("div", null, u.email), u.confirmed ? null : h("span.pill.pill--warn", null, t("users.unconfirmed")), u.role ? h(`span.pill.pill--${u.role}`, null, roleTitle(u.role)) : null),
      h("td.small", null, fmtDate(u.createdAt)),
      h("td", null, h(`span.pill${u.signIn === "google" ? ".pill--google" : ""}`, null, t(`users.signin_${u.signIn}`))),
      h("td.small", null, u.lastVisit ? [fmtDateTime(u.lastVisit.endedAt), h("div.muted", null, fmtMin(u.lastVisit.minutes))] : h("span.muted", null, t("users.never"))),
      h("td.num.small", null, fmtMin(u.totalMinutes)),
      h("td", null, u.progress.currentLevel ? h(`span.pill.pill--${u.progress.currentLevel}`, null, levelTitle(u.progress.currentLevel)) : h("span.muted", null, t("users.none"))),
      h("td", null, levelBars(u.progress.levels)),
      h("td.num", null, u.progress.xp),
    ),
  );
  put(box,
    h("p.muted.small", null, t("users.found", { n: total })),
    h(
      "div.card.table-wrap",
      null,
      h(
        "table",
        null,
        h(
          "thead",
          null,
          h(
            "tr",
            null,
            ["col_email", "col_registered", "col_signin", "col_last", "col_time", "col_level", "col_progress", "col_xp"].map((k) => h(k === "col_time" || k === "col_xp" ? "th.num" : "th", null, t(`users.${k}`))),
          ),
        ),
        h("tbody", null, rows),
      ),
    ),
    pages > 1
      ? h(
          "div.pager",
          null,
          h("button.btn", { disabled: state.page <= 1, onclick: () => setHash({ page: state.page - 1 }) }, t("users.prev")),
          h("span.muted", null, t("users.page", { page: state.page, pages })),
          h("button.btn", { disabled: state.page >= pages, onclick: () => setHash({ page: state.page + 1 }) }, t("users.next")),
        )
      : null,
  );
}

async function renderUser(id) {
  const box = h("div", null, loading());
  app.replaceChildren(shell("#/users", h("div", null, h("p", null, h("a", { href: "#/users" }, t("user.back"))), box)));
  await ensureLevels();
  const r = await api(`/api/admin/users/${encodeURIComponent(id)}`);
  if (r.status !== 200) return box.replaceChildren(failed());
  const { user: u, levels, visits, activeSessions } = r.body;
  const fact = (label, value) => h("div", null, h("div.fact__label", null, label), h("div.fact__value", null, value));
  const facts = h(
    "section.card",
    null,
    h("h2", null, u.email),
    h(
      "div.facts",
      null,
      fact(t("user.registered"), fmtDateTime(u.createdAt)),
      fact(t("user.signin"), t(`users.signin_${u.signIn}`) + (u.confirmed ? "" : ` · ${t("users.unconfirmed")}`)),
      fact(t("user.lang"), u.lang.toUpperCase()),
      fact(t("user.role"), u.role ? roleTitle(u.role) : t("user.no_role")),
      fact(t("users.col_level"), u.progress.currentLevel ? levelTitle(u.progress.currentLevel) : t("users.none")),
      fact(t("user.xp"), u.progress.xp),
      fact(t("user.streak"), `${u.progress.streak} ${t("user.days")}`),
      fact(t("user.active_days"), u.progress.activeDays),
      fact(t("users.col_last"), u.lastVisit ? `${fmtDateTime(u.lastVisit.endedAt)} · ${fmtMin(u.lastVisit.minutes)}` : t("users.never")),
      fact(t("user.time_total"), fmtMin(u.totalMinutes)),
      fact(t("user.time_week"), fmtMin(u.weekMinutes)),
      fact(t("user.active_sessions"), activeSessions),
    ),
  );
  const progress = h(
    "section.card",
    null,
    h("h2", null, t("user.progress")),
    levels.map((l) => {
      const sum = u.progress.levels.find((x) => x.id === l.id);
      return h(
        "div.level-block",
        null,
        h("h3", null, h(`span.pill.pill--${l.id}`, null, l.title.ru), " ", h("span.muted.small", null, `${sum?.done ?? 0}/${sum?.total ?? 0}`)),
        l.modules.map((m) =>
          h(
            "div.module",
            null,
            h("div.module__name", null, m.title.ru),
            h(
              "div.lessons",
              null,
              m.lessons.map((ls) =>
                h(
                  `span.lesson${ls.done ? ".is-done" : ""}`,
                  { title: `${ls.id} · ${ls.title.ru}\n${ls.done ? t("user.lesson_done", { date: fmtDate(ls.lastCompletedAt), xp: ls.bestXp ?? 0, runs: ls.runs }) : t("user.lesson_open")}` },
                  ls.id,
                ),
              ),
            ),
          ),
        ),
      );
    }),
  );
  const visitsCard = h(
    "section.card",
    null,
    h("h2", null, t("user.visits")),
    visits.length
      ? h(
          "div.table-wrap",
          null,
          h(
            "table",
            null,
            h("thead", null, h("tr", null, h("th", null, t("user.visit_start")), h("th", null, t("user.visit_end")), h("th.num", null, t("user.visit_len")))),
            h("tbody", null, visits.map((v) => h("tr", null, h("td", null, fmtDateTime(v.startedAt)), h("td", null, fmtDateTime(v.endedAt)), h("td.num", null, fmtMin(v.minutes))))),
          ),
        )
      : h("p.muted", null, t("user.no_visits")),
  );
  box.replaceChildren(facts, h("div.grid2", { style: "margin-top:18px" }, progress, visitsCard));
}

// ---------------- admins ----------------

async function renderAdmins() {
  const box = h("div", null, loading());
  app.replaceChildren(shell("#/admins", page(t("admins.title"), box)));
  const r = await api("/api/admin/admins");
  if (r.status !== 200) return box.replaceChildren(failed());
  const { admins, roles, permissions } = r.body;
  const msg = h("div");
  const say = (cls, text) => msg.replaceChildren(h(`p.note${cls}`, null, text));
  const errText = (code) => t(`admins.err_${["user_not_found", "email_not_confirmed", "forbidden", "last_owner"].includes(code) ? code : "generic"}`);
  const manageable = (role) => can("admins.manage") && (me.role === "owner" || role !== "owner");

  const list = h(
    "div.card.table-wrap",
    null,
    h(
      "table",
      null,
      h("thead", null, h("tr", null, h("th", null, t("admins.col_email")), h("th", null, t("admins.col_role")), h("th", null, t("admins.col_since")), h("th", null, t("admins.col_by")), h("th"))),
      h(
        "tbody",
        null,
        admins.map((a) => {
          const self = a.userId === me.user.id;
          const roleCell = manageable(a.role)
            ? h(
                "select.select",
                {
                  "aria-label": `${t("admins.col_role")}: ${a.email}`,
                  onchange: async (e) => {
                    const res = await api("/api/admin/admins", { method: "POST", json: { email: a.email, role: e.target.value } });
                    if (res.status === 200) return renderAdmins();
                    e.target.value = a.role;
                    say(".note--error", errText(res.body?.error));
                  },
                },
                roles.filter((ro) => me.role === "owner" || ro !== "owner").map((ro) => h("option", { value: ro, selected: ro === a.role }, roleTitle(ro))),
              )
            : h(`span.pill.pill--${a.role}`, null, roleTitle(a.role));
          return h(
            "tr",
            null,
            h("td", null, a.email, self ? h("span.muted.small", null, ` (${t("admins.you")})`) : null),
            h("td", null, roleCell),
            h("td.small", null, fmtDateTime(a.grantedAt)),
            h("td.small", null, a.grantedBy ?? t("admins.by_console")),
            h(
              "td",
              null,
              manageable(a.role)
                ? h(
                    "button.btn.btn--danger",
                    {
                      type: "button",
                      onclick: async () => {
                        if (!confirm(t("admins.revoke_confirm", { email: a.email }))) return;
                        const res = await api(`/api/admin/admins/${a.userId}`, { method: "DELETE" });
                        if (res.status === 200) {
                          if (self) return boot();
                          await renderAdmins();
                          return;
                        }
                        say(".note--error", errText(res.body?.error));
                      },
                    },
                    t("admins.revoke"),
                  )
                : null,
            ),
          );
        }),
      ),
    ),
  );

  let grantCard = null;
  if (can("admins.manage")) {
    const email = h("input.input.input--wide", { type: "email", id: "grant-email", required: true, autocomplete: "off", maxlength: 254 });
    const role = h("select.select", { id: "grant-role" }, roles.filter((ro) => me.role === "owner" || ro !== "owner").map((ro) => h("option", { value: ro, selected: ro === "viewer" }, roleTitle(ro))));
    const btn = h("button.btn.btn--primary", { type: "submit" }, t("admins.grant"));
    grantCard = h(
      "section.card",
      null,
      h("h2", null, t("admins.grant_title")),
      h("p.muted.small", null, t("admins.grant_lead")),
      h(
        "form.toolbar",
        {
          onsubmit: async (e) => {
            e.preventDefault();
            btn.disabled = true;
            const res = await api("/api/admin/admins", { method: "POST", json: { email: email.value.trim(), role: role.value } });
            btn.disabled = false;
            if (res.status === 200) {
              await renderAdmins();
              return;
            }
            say(".note--error", errText(res.body?.error));
          },
        },
        h("label.field", { for: "grant-email" }, t("admins.email"), email),
        h("label.field", { for: "grant-role" }, t("admins.role"), role),
        btn,
      ),
    );
  }

  const permKeys = [...new Set(Object.values(permissions).flat())];
  const matrix = h(
    "section.card.table-wrap",
    null,
    h("h2", null, t("admins.matrix")),
    h(
      "table.matrix",
      null,
      h("thead", null, h("tr", null, h("th"), roles.map((ro) => h("th", null, roleTitle(ro))))),
      h("tbody", null, permKeys.map((p) => h("tr", null, h("td", null, t(`perms.${p.replace(".", "_")}`)), roles.map((ro) => h("td", null, permissions[ro].includes(p) ? h("span.yes", { "aria-label": "да" }, "✓") : h("span.muted", { "aria-label": "нет" }, "—")))))),
    ),
  );
  put(box, msg, grantCard, list, matrix);
}

// ---------------- audit ----------------

async function renderAudit() {
  const box = h("div", null, loading());
  app.replaceChildren(shell("#/audit", page(t("audit.title"), box)));
  const r = await api("/api/admin/audit");
  if (r.status !== 200) return box.replaceChildren(failed());
  const { entries } = r.body;
  if (!entries.length) return box.replaceChildren(h("p.muted", null, t("audit.empty")));
  const what = (e) => {
    const d = e.details ?? {};
    const rt = (x) => (x ? roleTitle(x) : "—");
    return t(`audit.${e.action}`, { email: d.email ?? e.targetId ?? "", from: rt(d.from), to: rt(d.to) });
  };
  box.replaceChildren(
    h(
      "div.card.table-wrap",
      null,
      h(
        "table",
        null,
        h("thead", null, h("tr", null, h("th", null, t("audit.col_when")), h("th", null, t("audit.col_who")), h("th", null, t("audit.col_what")))),
        h("tbody", null, entries.map((e) => h("tr", null, h("td.small", null, fmtDateTime(e.at)), h("td", null, e.actor), h("td", null, what(e))))),
      ),
    ),
  );
}

// ---------------- routing ----------------

function route() {
  if (!me) return;
  const [path] = location.hash.replace(/^#/, "").split("?");
  const userMatch = /^\/users\/([\w-]+)$/.exec(path);
  if (userMatch && can("progress.read")) return renderUser(userMatch[1]);
  if (path === "/users" && can("users.read")) return renderUsers();
  if (path === "/admins" && can("admins.read")) return renderAdmins();
  if (path === "/audit" && can("audit.read")) return renderAudit();
  return renderOverview();
}

async function boot() {
  const r = await api("/api/admin/me");
  if (r.status === 200) {
    me = r.body;
    if (location.hash === "#/login" || !location.hash) location.hash = "#/";
    return route();
  }
  me = null;
  if (r.status === 403 && r.body?.error === "not_admin") {
    // signed in, but not an admin: sign out so another account can be used
    await api("/api/auth/logout", { method: "POST", json: {} });
    return renderLogin("not_admin");
  }
  renderLogin(r.body?.error === "reauth" ? "reauth" : null);
}

async function init() {
  try {
    T = await (await fetch("./i18n/ru.json", { cache: "no-cache" })).json();
  } catch {
    T = {};
  }
  document.title = t("app.title");
  addEventListener("hashchange", route);
  boot();
}

init();
