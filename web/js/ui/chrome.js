// Shared chrome: language picker, stats chips, footer with the independence notice.

import { h, icon } from "./dom.js";
import { t, getLang, setLang, formatNumber } from "./i18n.js";
import { LANGS } from "../engine/course.js";

/**
 * Language picker in the app's notebook style: a chip with the short code opens a small card with
 * the languages (native names, pastel code badges, a check on the current one). Listbox semantics:
 * arrows/Home/End move, Enter/Space choose, Esc or a tap outside closes, focus returns to the chip.
 */
export function langPicker() {
  const current = getLang();
  const menuId = `lang-${Math.random().toString(36).slice(2, 7)}`;
  const chip = h(
    "button.lang__chip",
    { type: "button", aria: { haspopup: "listbox", expanded: "false", controls: menuId, label: `${t("lang.label")}: ${t(`lang.${current}`)}` } },
    t(`lang.short_${current}`),
  );
  const options = LANGS.map((code) =>
    h(
      `li.lang-menu__option${code === current ? ".is-current" : ""}`,
      { role: "option", id: `${menuId}-${code}`, tabindex: "-1", lang: code, data: { lang: code }, aria: { selected: String(code === current) } },
      h(`span.lang-menu__code.lang-menu__code--${code}`, { aria: { hidden: "true" } }, t(`lang.short_${code}`)),
      h("span.lang-menu__name", t(`lang.${code}`)),
      code === current ? icon("check", "icon lang-menu__check") : null,
    ),
  );
  const list = h("ul.lang-menu__list", { role: "listbox", aria: { label: t("lang.label") } }, options);
  const menu = h("div.lang-menu", { id: menuId, hidden: true }, h("p.lang-menu__title", { aria: { hidden: "true" } }, t("lang.label")), list);
  const root = h("div.lang", chip, menu);

  const focusAt = (i) => options[(i + options.length) % options.length].focus();
  const onOutside = (e) => {
    if (!root.contains(e.target)) close(false);
  };
  function open() {
    menu.hidden = false;
    chip.setAttribute("aria-expanded", "true");
    root.classList.add("is-open");
    focusAt(Math.max(0, LANGS.indexOf(current)));
    document.addEventListener("pointerdown", onOutside, true);
  }
  function close(returnFocus = true) {
    if (menu.hidden) return;
    menu.hidden = true;
    chip.setAttribute("aria-expanded", "false");
    root.classList.remove("is-open");
    document.removeEventListener("pointerdown", onOutside, true);
    if (returnFocus) chip.focus();
  }
  function choose(code) {
    close();
    if (code && code !== current) setLang(code);
  }
  chip.addEventListener("click", () => (menu.hidden ? open() : close()));
  chip.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      open();
    }
  });
  list.addEventListener("click", (e) => choose(e.target.closest?.("[data-lang]")?.dataset.lang));
  list.addEventListener("keydown", (e) => {
    const i = options.indexOf(document.activeElement);
    if (e.key === "ArrowDown") focusAt(i + 1);
    else if (e.key === "ArrowUp") focusAt(i - 1);
    else if (e.key === "Home") focusAt(0);
    else if (e.key === "End") focusAt(options.length - 1);
    else if (e.key === "Enter" || e.key === " ") choose(options[i]?.dataset.lang);
    else if (e.key === "Escape" || e.key === "Tab") return close(e.key === "Escape");
    else return;
    e.preventDefault();
  });
  return root;
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
