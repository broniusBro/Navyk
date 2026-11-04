// App shell: bottom tab bar (Учёба · Разговор · Словарь · Профиль) and a shared top bar for tab screens.

import { h, icon } from "./dom.js";
import { t } from "./i18n.js";

export const TABS = [
  { id: "learn", hash: "#/", icon: "book", label: "tabs.learn" },
  { id: "talk", hash: "#/talk", icon: "chat", label: "tabs.talk" },
  { id: "words", hash: "#/words", icon: "cards", label: "tabs.words" },
  { id: "me", hash: "#/me", icon: "user", label: "tabs.me" },
];

/** Which tab a hash belongs to (null = no tab bar: lesson, chat, auth screens). */
export function tabOf(hash) {
  const hsh = hash || "#/";
  if (/^#\/talk\/./.test(hsh) || /^#\/lesson\//.test(hsh) || hsh === "#/review" || hsh === "#/welcome") return null;
  if (hsh.startsWith("#/talk")) return "talk";
  if (hsh.startsWith("#/words")) return "words";
  if (hsh.startsWith("#/me")) return "me";
  if (hsh === "#/" || hsh === "#" || hsh.startsWith("#/level/")) return "learn";
  return null;
}

export function tabbar(active) {
  return h(
    "nav.tabbar",
    { aria: { label: t("tabs.label") } },
    TABS.map((tab) =>
      h(
        `a.tabbar__item${tab.id === active ? ".is-active" : ""}`,
        { href: tab.hash, aria: { current: tab.id === active ? "page" : null }, data: { tab: tab.id } },
        h("span.tabbar__icon", { aria: { hidden: "true" } }, icon(tab.icon)),
        h("span.tabbar__label", t(tab.label)),
      ),
    ),
  );
}

/** Wrap a tab screen: content + tab bar. The screen element gets .has-tabbar so CSS reserves space. */
export function withTabbar(screen, active) {
  screen.classList.add("has-tabbar");
  screen.append(tabbar(active));
  return screen;
}

/** Simple top bar for tab screens other than «Учёба»: title + optional action. */
export function tabTop(title, ...extra) {
  return h("header.topbar.topbar--tab", h("h1.topbar__title", { tabindex: "-1" }, title), ...extra);
}
