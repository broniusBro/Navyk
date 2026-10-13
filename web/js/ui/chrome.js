// Shared chrome: language picker, stats chips, footer with the independence notice.

import { h, icon } from "./dom.js";
import { t, getLang, setLang, formatNumber } from "./i18n.js";
import { LANGS } from "../engine/course.js";

/**
 * Language picker: a compact chip with the short code; the native <select> lies transparently on top,
 * so tapping it opens the system picker with full language names (and it stays keyboard/AT friendly).
 */
export function langPicker({ compact = true } = {}) {
  const id = `lang-${Math.random().toString(36).slice(2, 7)}`;
  const select = h(
    "select.lang__select",
    { id },
    LANGS.map((code) => h("option", { value: code, selected: code === getLang() }, t(`lang.${code}`))),
  );
  select.addEventListener("change", () => setLang(select.value));
  if (!compact) return h("div.lang.lang--full", h("label.lang__label", { for: id }, t("lang.label")), select);
  return h("div.lang.lang--compact", h("label.sr-only", { for: id }, t("lang.label")), h("span.lang__chip", { aria: { hidden: "true" } }, t(`lang.short_${getLang()}`)), select);
}

/** Header account button: avatar with the e-mail initial, or a person icon that leads to sign-in. */
export function accountButton(user, onClick) {
  if (user) {
    const initial = (String(user.email ?? "").trim()[0] ?? "?").toUpperCase();
    return h("button.avatar-btn", { type: "button", onclick: onClick, aria: { label: t("auth.account_label", { email: user.email }) } }, h("span.avatar", { aria: { hidden: "true" } }, initial));
  }
  return h("button.avatar-btn.avatar-btn--guest", { type: "button", onclick: onClick, aria: { label: t("auth.login_short") } }, h("span.avatar", { aria: { hidden: "true" } }, icon("user")));
}

/** "navyk." wordmark with the pink brand dot (dot is decorative). */
export function wordmark() {
  return h("p.wordmark", { aria: { label: "Navyk" } }, h("span", { aria: { hidden: "true" } }, "navyk"), h("span.wordmark__dot", { aria: { hidden: "true" } }, "."));
}

export function statChips({ xp, streak, activeToday }) {
  return h(
    "div.stats",
    h(
      `p.stat.stat--streak${activeToday ? ".is-active" : ""}${streak > 0 ? ".is-lit" : ""}`,
      { aria: { label: t("stats.streak_label", { count: streak }) } },
      icon("flame"),
      h("span.stat__value", { aria: { hidden: "true" } }, formatNumber(streak)),
    ),
    h("p.stat.stat--xp", { aria: { label: t("stats.xp_label", { count: xp }) } }, icon("star"), h("span.stat__value", { aria: { hidden: "true" } }, formatNumber(xp)), h("span.stat__unit", { aria: { hidden: "true" } }, t("stats.xp_unit"))),
  );
}

export function footer() {
  return h(
    "footer.site-footer",
    h("p", t("footer.independent")),
    h("details.about", h("summary", t("footer.about")), h("p", t("footer.about_text")), h("p", t("footer.trademark"))),
  );
}
