// Full-screen conversation for the «Разговор» tab (#/talk/<scenario>): the AI partner plays the scenario
// at the learner's level, corrects mistakes, tracks goals and ends with stars and tips.
// Without AI (no key / daily limit / offline) the screen explains it and offers lessons instead.

import { h, icon } from "./dom.js";
import { t, getLang } from "./i18n.js";
import { mountChat } from "./chat.js";
import { stopAudio } from "./audio.js";
import { aiDialog } from "../platform/api.js";
import { localized } from "../engine/course.js";
import { burst } from "./motion.js";

let current = null;

/** Stop audio/mic of the previous chat when the router leaves the screen. */
export function destroyTalkChat() {
  current?.destroy?.();
  current = null;
  stopAudio?.();
}

/** mountTalkChat(app, { scenario, level, onClose, onTurn }) */
export function mountTalkChat(app, { scenario, level, onClose, onTurn }) {
  destroyTalkChat();
  const title = localized(scenario.title, getLang());
  let counted = false;

  const chat = mountChat({
    mode: "talk",
    scenario: { title, setting: scenario.setting, goals: scenario.goals ?? [] },
    opener: scenario.opener ? { pl: scenario.opener, ru: "" } : null,
    chips: [],
    start: false,
    placeholder: t("talk.placeholder"),
    onTurn: async (history) => {
      const r = await aiDialog({ scenarioId: scenario.id, level, history: history.map((x) => ({ who: x.who === "you" ? "you" : "partner", text: x.text })) });
      if (!r.available) return r;
      if (!counted) {
        counted = true;
        onTurn?.();
      }
      return { pl: r.reply.pl, ru: r.reply.ru, correction: r.correction, chips: r.chips, goalsDone: r.goalsDone, finished: r.finished, summary: r.summary };
    },
    onUnavailable: (reason) => {
      chat.systemNote(t(reason === "limit" ? "talk.limit" : "talk.unavailable"));
      chat.setInputMode("off");
      finishBtn.hidden = true; // nothing to finish: the conversation cannot go on without the AI
      return true;
    },
    onFinished: () => burst(app.querySelector(".chat__summary") ?? app, { count: 22 }),
  });
  current = chat;

  const finishBtn = h("button.btn.btn--small.btn--ghost.talk-chat__finish", { type: "button" }, icon("check"), h("span", t("talk.finish")));
  finishBtn.addEventListener("click", async () => {
    if (chat.isFinished() || chat.isBusy()) return;
    finishBtn.disabled = true;
    const r = await aiDialog({ scenarioId: scenario.id, level, history: chat.history().map((x) => ({ who: x.who === "you" ? "you" : "partner", text: x.text })), finish: true });
    if (r.available && r.summary) chat.showSummary(r.summary);
    else chat.finish?.();
    finishBtn.hidden = true;
  });

  const screen = h(
    "div.screen.screen--chat",
    h(
      "header.lesson__top.chat-top",
      h("button.btn.btn--icon", { type: "button", aria: { label: t("common.close") }, onclick: () => (destroyTalkChat(), onClose()) }, icon("close")),
      h("div.chat-top__who", h("span.ai-avatar.ai-avatar--partner", { aria: { hidden: "true" } }), h("span.chat-top__text", h("strong", title), h("span", t("talk.chat_level", { level: level.toUpperCase() })))),
      finishBtn,
    ),
    h("main.talk-chat", { id: "main" }, h("h1.sr-only", { tabindex: "-1" }, title), chat.el),
  );
  app.replaceChildren(screen);
  chat.focusInput?.();
  return chat;
}
