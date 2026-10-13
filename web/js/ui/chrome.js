// Shared chrome: language picker, stats chips, footer with the independence notice.

import { h, icon } from "./dom.js";
import { t, getLang, setLang, formatNumber } from "./i18n.js";
import { LANGS } from "../engine/course.js";

export function langPicker() {
  const id = `lang-${Math.random().toString(36).slice(2, 7)}`;
  const select = h(
    "select.lang__select",
    { id },
    LANGS.map((code) => h("option", { value: code, selected: code === getLang() }, t(`lang.${code}`))),
  );
  select.addEventListener("change", () => setLang(select.value));
  return h("div.lang", h("label.sr-only", { for: id }, t("lang.label")), select);
}

export function statChips({ xp, streak, activeToday }) {
  return h(
    "div.stats",
    h(
      `p.stat.stat--streak${activeToday ? ".is-active" : ""}`,
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
