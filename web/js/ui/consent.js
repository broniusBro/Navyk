// Small analytics consent card (bottom of the screen). Shown until the visitor chooses;
// the footer link reopens it.
import { h } from "./dom.js";
import { t } from "./i18n.js";
import { analyticsChoice, setAnalyticsChoice } from "../platform/analytics.js";

let card = null;

export function showConsent({ force = false } = {}) {
  if (card?.isConnected) return;
  if (!force && analyticsChoice() !== null) return;
  const choose = (v) => {
    setAnalyticsChoice(v);
    card?.remove();
    card = null;
  };
  card = h(
    "section.ga-consent",
    { role: "dialog", aria: { label: t("consent.title"), live: "polite" } },
    h("p.ga-consent__title", t("consent.title")),
    h("p.ga-consent__text", t("consent.text")),
    h(
      "div.ga-consent__actions",
      h("button.btn.btn--ghost.ga-consent__btn", { type: "button", onclick: () => choose("denied") }, t("consent.decline")),
      h("button.btn.btn--accent.ga-consent__btn", { type: "button", onclick: () => choose("granted") }, t("consent.accept")),
    ),
  );
  document.body.append(card);
}
