// First-run onboarding (#/welcome): hello → why Polish → level → minutes a day → save progress (optional).
// Answers live in prefs; nothing here requires an account — the course is free and the first module is open.

import { h, icon } from "./dom.js";
import { t } from "./i18n.js";
import { enter, burst } from "./motion.js";
import { getPrefs, setPrefs, GOALS, MINUTES, GENDER_CHOICES } from "./prefs.js";
import { isSignedIn } from "./account.js";

const STEPS = ["hello", "goal", "gender", "level", "minutes", "account"];
const LEVELS = ["a1", "a2", "b1"];

/** renderOnboarding({ go }) — returns the screen; steps switch in place with a slide. */
export function renderOnboarding({ go }) {
  const prefs = getPrefs();
  const answers = { goal: prefs.goal, gender: prefs.gender, start: prefs.start, minutes: prefs.minutes };
  let step = 0;
  const screen = h("div.screen.screen--onboard");
  const finish = (target) => {
    setPrefs({ ...answers, onboarded: true });
    go(target);
  };

  function progress() {
    return h(
      "div.onboard__progress",
      { role: "progressbar", aria: { valuemin: "1", valuemax: String(STEPS.length), valuenow: String(step + 1), label: t("onboard.progress") } },
      STEPS.map((_, i) => h(`span.onboard__dot${i <= step ? ".is-on" : ""}`)),
    );
  }

  function options(key, values, labelPrefix, { withHint = false } = {}) {
    const list = h("div.onboard__options", { role: "radiogroup", aria: { label: t(`onboard.${STEPS[step]}_title`) } });
    for (const v of values) {
      const selected = answers[key] === v;
      const btn = h(
        `button.onboard__option${selected ? ".is-selected" : ""}`,
        { type: "button", role: "radio", aria: { checked: String(selected) }, data: { value: String(v) } },
        h("span.onboard__emoji", { aria: { hidden: "true" } }, t(`${labelPrefix}.${v}.emoji`)),
        h("span.onboard__text", h("strong", t(`${labelPrefix}.${v}.title`)), withHint ? h("span", t(`${labelPrefix}.${v}.hint`)) : null),
        h("span.onboard__check", { aria: { hidden: "true" } }, icon("check")),
      );
      btn.addEventListener("click", () => {
        answers[key] = v;
        for (const b of list.children) {
          const on = b === btn;
          b.classList.toggle("is-selected", on);
          b.setAttribute("aria-checked", String(on));
        }
        next.disabled = false;
      });
      list.append(btn);
    }
    return list;
  }

  const next = h("button.btn.btn--primary.btn--wide", { type: "button" }, t("onboard.next"));
  let onNext = () => show(step + 1);
  next.addEventListener("click", () => onNext());

  function show(i) {
    const dir = i >= step ? 1 : -1;
    step = i;
    const id = STEPS[step];
    let body;
    next.disabled = false;
    next.textContent = t("onboard.next");
    onNext = () => show(step + 1);
    let secondary = null;

    if (id === "hello") {
      body = [
        h("div.onboard__hero", { aria: { hidden: "true" } }, h("span.onboard__flag"), h("span.ai-avatar.ai-avatar--tutor.ai-avatar--hero")),
        h("h1", { tabindex: "-1" }, t("onboard.hello_title")),
        h("p.onboard__lead", t("onboard.hello_text")),
        h(
          "ul.onboard__bullets",
          ["free", "ai", "speak"].map((k) => h("li", h("span", { aria: { hidden: "true" } }, t(`onboard.bullet.${k}.emoji`)), h("span", t(`onboard.bullet.${k}.text`)))),
        ),
      ];
      next.textContent = t("onboard.start");
      secondary = h("a.btn.btn--ghost.btn--wide", { href: "#/login" }, t("onboard.have_account"));
    } else if (id === "goal") {
      body = [h("h1", { tabindex: "-1" }, t("onboard.goal_title")), h("p.onboard__lead", t("onboard.goal_text")), options("goal", GOALS, "onboard.goals")];
      next.disabled = !answers.goal;
    } else if (id === "gender") {
      body = [h("h1", { tabindex: "-1" }, t("onboard.gender_title")), h("p.onboard__lead", t("onboard.gender_text")), options("gender", GENDER_CHOICES, "onboard.genders", { withHint: true })];
    } else if (id === "level") {
      body = [h("h1", { tabindex: "-1" }, t("onboard.level_title")), h("p.onboard__lead", t("onboard.level_text")), options("start", LEVELS, "onboard.levels", { withHint: true })];
    } else if (id === "minutes") {
      body = [h("h1", { tabindex: "-1" }, t("onboard.minutes_title")), h("p.onboard__lead", t("onboard.minutes_text")), options("minutes", MINUTES, "onboard.mins", { withHint: true })];
    } else {
      const startHash = answers.start === "a1" ? "#/lesson/a1m1.1" : `#/level/${answers.start}`;
      body = [
        h("div.onboard__hero.onboard__hero--done", { aria: { hidden: "true" } }, icon("trophy")),
        h("h1", { tabindex: "-1" }, t("onboard.account_title")),
        h("p.onboard__lead", t(isSignedIn() ? "onboard.account_signed" : "onboard.account_text", { minutes: answers.minutes })),
      ];
      next.textContent = t(answers.start === "a1" ? "onboard.first_lesson" : "onboard.to_level");
      onNext = () => {
        burst(next, { count: 18 });
        finish(startHash);
      };
      if (!isSignedIn()) {
        secondary = h("button.btn.btn--ghost.btn--wide", { type: "button" }, t("onboard.create_account"));
        secondary.addEventListener("click", () => finish("#/register"));
      }
    }

    const back =
      step > 0
        ? h("button.btn.btn--icon.onboard__back", { type: "button", aria: { label: t("common.back") }, onclick: () => show(step - 1) }, icon("back"))
        : h("span.onboard__back-spacer");
    const skip =
      step > 0 && step < STEPS.length - 1
        ? h("button.btn.btn--link.onboard__skip", { type: "button", onclick: () => finish("#/") }, t("onboard.skip"))
        : h("span");

    const main = h(`main.onboard.onboard--${id}`, { id: "main" }, h("div.onboard__top", back, progress(), skip), h("div.onboard__body", body), h("div.onboard__actions", next, secondary));
    screen.replaceChildren(main);
    enter(main, dir);
    main.querySelector("h1")?.focus({ preventScroll: true });
  }

  show(0);
  return screen;
}
