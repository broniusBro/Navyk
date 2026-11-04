// «Профиль» tab (#/me) — the learner's personal account page:
// who I am (account or guest), stats, this week, daily goal, voice/theme settings, sign out, delete account.

import { h, icon } from "./dom.js";
import { t, formatNumber } from "./i18n.js";
import { countUp } from "./motion.js";
import { tabTop } from "./shell.js";
import { getPrefs, setPrefs, MINUTES, THEMES } from "./prefs.js";
import { currentUser, signOut, signedIn } from "./account.js";
import { openSheet, closeSheet } from "./sheet.js";
import { request } from "../platform/http.js";
import { authProviders } from "../platform/api.js";
import { initial } from "./auth.js";

const WEEKDAYS = 7;

function dayKeyLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** Last 7 days: [{ key, label, active, today }] from progress.days. */
export function weekActivity(days, now = new Date()) {
  const set = new Set(days ?? []);
  const out = [];
  for (let i = WEEKDAYS - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = dayKeyLocal(d);
    out.push({ key, label: d.toLocaleDateString("ru", { weekday: "short" }).slice(0, 2), active: set.has(key), today: i === 0 });
  }
  return out;
}

function settingsRow(label, control, hint) {
  return h("div.settings-row", h("span.settings-row__text", h("span.settings-row__label", label), hint ? h("span.settings-row__hint", hint) : null), control);
}

function switchCtl(on, onChange, label) {
  const sw = h(`button.switch${on ? ".is-on" : ""}`, { type: "button", role: "switch", aria: { checked: String(on), label } }, h("span.switch__knob"));
  sw.addEventListener("click", () => {
    const v = sw.getAttribute("aria-checked") !== "true";
    sw.setAttribute("aria-checked", String(v));
    sw.classList.toggle("is-on", v);
    onChange(v);
  });
  return sw;
}

function segmented(values, current, labelOf, onChange, label) {
  const group = h("div.segmented", { role: "radiogroup", aria: { label } });
  for (const v of values) {
    const b = h(`button.segmented__item${v === current ? ".is-selected" : ""}`, { type: "button", role: "radio", aria: { checked: String(v === current) } }, labelOf(v));
    b.addEventListener("click", () => {
      for (const x of group.children) {
        x.classList.toggle("is-selected", x === b);
        x.setAttribute("aria-checked", String(x === b));
      }
      onChange(v);
    });
    group.append(b);
  }
  return group;
}

/** renderProfile({ progress, streak, wordsCount, go }) */
export function renderProfile({ progress, streak, wordsCount, go }) {
  const user = currentUser();
  const prefs = getPrefs();
  const lessonsDone = Object.keys(progress.lessons ?? {}).length;
  const name = user?.name || (user ? user.email.split("@")[0] : t("profile.guest_name"));

  const head = h(
    "section.profile__head",
    h("span.profile__avatar", { aria: { hidden: "true" } }, user ? initial(user.name || user.email) : icon("user")),
    h("div.profile__id", h("p.profile__name", name), h("p.profile__email", user ? user.email : t("profile.guest_text"))),
    user ? h("button.btn.btn--icon.profile__edit", { type: "button", aria: { label: t("profile.edit_name") }, onclick: () => editName(user, go) }, icon("edit")) : null,
  );

  const guestCta = user
    ? null
    : h(
        "div.save-banner.save-banner--profile",
        icon("cloud", "icon save-banner__icon"),
        h("p.save-banner__text", t("profile.guest_cta_text")),
        h("div.save-banner__actions", h("a.btn.btn--primary", { href: "#/register" }, t("profile.create_account")), h("a.btn.btn--ghost", { href: "#/login" }, t("auth.login_short"))),
      );

  const stat = (value, label, mod) => {
    const strong = h("strong", "0");
    queueMicrotask(() => countUp(strong, value, { format: formatNumber }));
    return h(`div.stat.stat--${mod}`, icon(mod === "streak" ? "flame" : mod === "xp" ? "star" : mod === "words" ? "cards" : "book"), strong, h("span", label));
  };
  const stats = h(
    "section.stat-grid",
    { aria: { label: t("profile.stats") } },
    stat(streak, t("profile.stat_streak", { count: streak }), "streak"),
    stat(progress.xp ?? 0, t("profile.stat_xp"), "xp"),
    stat(lessonsDone, t("profile.stat_lessons", { count: lessonsDone }), "lessons"),
    stat(wordsCount ?? 0, t("profile.stat_words", { count: wordsCount ?? 0 }), "words"),
  );

  const week = weekActivity(progress.days);
  const weekEl = h(
    "section.card.week",
    h("h2.card__title", t("profile.week")),
    h(
      "div.week-chart",
      { role: "img", aria: { label: t("profile.week_label", { count: week.filter((d) => d.active).length }) } },
      week.map((d) => h(`span.week-chart__bar${d.active ? ".is-active" : ""}${d.today ? ".is-today" : ""}`, h("span.week-chart__fill"), h("span.week-chart__day", d.label))),
    ),
  );

  const goal = h(
    "section.card",
    h("h2.card__title", icon("target"), h("span", t("profile.goal"))),
    h("p.card__text", t("profile.goal_text")),
    segmented(MINUTES, prefs.minutes, (m) => t("profile.minutes", { count: m }), (m) => setPrefs({ minutes: m }), t("profile.goal")),
  );

  const settings = h(
    "section.card",
    h("h2.card__title", icon("settings"), h("span", t("profile.settings"))),
    h(
      "div.settings-list",
      settingsRow(
        t("profile.tts_rate"),
        segmented(["normal", "slow"], prefs.ttsRate, (v) => t(`profile.rate.${v}`), (v) => setPrefs({ ttsRate: v }), t("profile.tts_rate")),
        t("profile.tts_rate_hint"),
      ),
      settingsRow(t("profile.autoplay"), switchCtl(prefs.autoplay, (v) => setPrefs({ autoplay: v }), t("profile.autoplay")), t("profile.autoplay_hint")),
      settingsRow(t("profile.theme"), segmented(THEMES, prefs.theme, (v) => t(`profile.theme_${v}`), (v) => setPrefs({ theme: v }), t("profile.theme"))),
      settingsRow(t("profile.restart_onboarding"), h("button.btn.btn--small.btn--ghost", { type: "button", onclick: () => (setPrefs({ onboarded: false }), go("#/welcome")) }, t("profile.restart"))),
    ),
  );

  const account = user
    ? h(
        "section.card.card--account",
        h("h2.card__title", icon("shield"), h("span", t("profile.account"))),
        h("p.card__text", icon("cloud"), h("span", t("auth.synced_note"))),
        h(
          "div.profile__actions",
          h(
            "button.btn.btn--ghost.btn--wide",
            {
              type: "button",
              onclick: async (e) => {
                e.currentTarget.disabled = true;
                await signOut();
                go("#/");
              },
            },
            icon("logout"),
            h("span", t("auth.logout")),
          ),
          h("button.btn.btn--danger-link", { type: "button", onclick: () => confirmDelete(user, go) }, icon("trash"), h("span", t("profile.delete"))),
        ),
      )
    : null;

  return h(
    "div.screen.screen--profile",
    tabTop(t("profile.title")),
    h("main.profile", { id: "main" }, head, guestCta, stats, weekEl, goal, settings, account, h("p.profile__legal", ...["privacy", "terms", "cookies"].map((d) => h("a", { href: `/${d}?lang=ru` }, t(`footer.${d}`))))),
  );
}

function editName(user, go) {
  const input = h("input.field__input", { type: "text", maxlength: "40", value: user.name ?? "", autocomplete: "nickname", aria: { label: t("profile.name_label") } });
  const err = h("p.field__error", { role: "alert", hidden: true });
  const save = h("button.btn.btn--primary.btn--wide", { type: "submit" }, t("common.save"));
  const form = h("form.sheet__form", h("label.field", h("span.field__label", t("profile.name_label")), input), err, h("div.sheet__actions", save));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    save.disabled = true;
    const r = await request("/api/auth/me", { method: "PATCH", json: { name: input.value.trim() } });
    save.disabled = false;
    if (r.status === 200) {
      if (r.body?.user) await signedIn(r.body.user);
      closeSheet();
      go("#/me");
    } else {
      err.hidden = false;
      err.textContent = t("profile.save_error");
    }
  });
  openSheet({ title: t("profile.edit_name"), body: [form] });
  queueMicrotask(() => input.focus());
}

function confirmDelete(user, go) {
  const pass = h("input.field__input", { type: "password", autocomplete: "current-password", aria: { label: t("auth.password") } });
  const err = h("p.field__error", { role: "alert", hidden: true });
  // «no password? leave it empty» only makes sense when Google sign-in exists
  const googleHint = h("p.field__hint", { hidden: true }, t("profile.delete_google_hint"));
  authProviders()
    .then((r) => {
      if (r?.body?.google) googleHint.hidden = false;
    })
    .catch(() => {});
  const btn = h("button.btn.btn--danger.btn--wide", { type: "submit" }, icon("trash"), h("span", t("profile.delete_confirm")));
  const form = h(
    "form.sheet__form",
    h("p.sheet__note", t("profile.delete_text")),
    h("label.field", h("span.field__label", t("profile.delete_password")), pass),
    googleHint,
    err,
    h("div.sheet__actions", btn),
  );
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    btn.disabled = true;
    const body = pass.value ? { password: pass.value } : { confirm: "DELETE" };
    const r = await request("/api/auth/me", { method: "DELETE", json: body });
    btn.disabled = false;
    if (r.status === 200) {
      await signOut().catch(() => {});
      try {
        globalThis.localStorage?.clear();
      } catch {
        /* ignore */
      }
      closeSheet();
      go("#/welcome");
      location.reload();
      return;
    }
    err.hidden = false;
    err.textContent = t(r.body?.error === "wrong_password" ? "profile.delete_wrong" : "profile.delete_error");
  });
  openSheet({ title: t("profile.delete_title"), body: [form], className: "sheet--danger" });
}
