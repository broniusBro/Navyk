// dialog: role-play with the AI partner on the chat component. Goals are ticked by the AI, the learner's
// mistakes get a gentle correction, the end shows stars and tips.
// AI unavailable (no key, limit, network): the `sample` dialog is played instead — partner lines appear
// one by one, the learner taps (or says) their line; the exercise counts.

import { h } from "../dom.js";
import { t } from "../i18n.js";
import { aiDialog } from "../../platform/api.js";
import { lessonOfExercise } from "../../engine/exercises.js";
import { similarity } from "../../engine/polish.js";
import { burst } from "../motion.js";
import { mountChat } from "../chat.js";
import { questionHeading, hintBox } from "./frame.js";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function renderDialog(ex, ctx) {
  const sc = ex.scenario ?? {};
  const sample = (ex.sample ?? []).filter((s) => s && (s.who === "partner" || s.who === "you") && s.pl);
  const lessonId = lessonOfExercise(ex.id) ?? ctx.lessonId;
  const opener = sc.opener ? { pl: sc.opener, ru: sample[0]?.who === "partner" && sample[0].pl === sc.opener ? sample[0].ru : "" } : null;
  const firstYou = sample.find((s) => s.who === "you");

  let finishing = false;
  let aiTurns = 0;
  let mode = "ai"; // ai | sample | done
  let awaiting = null; // sample line the learner has to say

  const chat = mountChat({
    mode: "dialog",
    scenario: { title: sc.title, setting: sc.setting, goals: sc.goals ?? [] },
    opener,
    chips: firstYou ? [firstYou.pl] : [],
    onTurn: async (history) => {
      const r = await aiDialog({ lessonId, exerciseId: ex.id, history, finish: finishing });
      finishing = false;
      return r.available ? { ...r, pl: r.reply.pl, ru: r.reply.ru } : r;
    },
    onReply: () => {
      aiTurns++;
      updateBar();
    },
    onFinished: (reply) => done(reply.summary),
    onUnavailable: (reason, { text }) => {
      if (aiTurns === 0) startSample(reason, text);
      else stopMidway(reason);
      return true;
    },
    onVoice: (r) => {
      if (mode === "sample") {
        if (awaiting) sayLine(awaiting);
      } else chat.send(r.text);
    },
  });

  const root = h("section.ex.ex--dialog", { data: { type: ex.type } }, questionHeading(ex), chat.el, hintBox(ex));

  function updateBar() {
    if (mode === "done") {
      ctx.setPrimary(t("common.next"), ctx.next);
      ctx.setSecondary(null);
      return;
    }
    if (mode === "sample") {
      ctx.setPrimary(t("chat.skip_sample"), () => finishSample(true));
      ctx.setSecondary(null);
      return;
    }
    ctx.setPrimary(t("chat.finish"), finishAi, { disabled: aiTurns === 0 });
    ctx.setSecondary(null);
  }

  function finishAi() {
    if (chat.isBusy() || chat.isFinished()) return;
    finishing = true;
    chat.requestNext();
  }

  function done(summary) {
    mode = "done";
    const stars = summary?.stars ?? 1;
    ctx.recordPractice(ex.id, { mode: "review", passed: stars >= 2 });
    if (stars >= 2) setTimeout(() => burst(root.querySelector(".stars") ?? root, { count: 18, spread: 1.1 }), 150);
    updateBar();
  }

  function stopMidway(reason) {
    chat.systemNote(t(`ai.unavailable_${reason}`));
    chat.finish();
    chat.showSummary({ praise: t("chat.stopped_midway") });
    mode = "done";
    ctx.recordPractice(ex.id, { mode: "selfcheck", passed: false });
    updateBar();
  }

  // ---- sample playback
  let step = 0;
  let typed = ""; // what the learner wrote before the AI turned out to be unavailable
  function startSample(reason, text = "") {
    typed = text;
    mode = "sample";
    chat.systemNote(t(reason === "limit" ? "chat.sample_limit" : "chat.sample_intro"));
    chat.setInputMode("chips");
    // skip the opener if it is the first sample line (already on screen)
    step = sample[0]?.who === "partner" && opener && sample[0].pl === opener.pl ? 1 : 0;
    updateBar();
    playNext();
  }

  async function playNext() {
    while (mode === "sample" && step < sample.length && sample[step].who === "partner") {
      const line = sample[step++];
      chat.setTyping(true);
      await wait(650);
      if (!root.isConnected || mode !== "sample") return;
      chat.setTyping(false);
      chat.addBubble("partner", { pl: line.pl, ru: line.ru });
      chat.record("partner", line.pl);
    }
    if (mode !== "sample") return;
    if (step >= sample.length) return finishSample(false);
    awaiting = sample[step];
    if (typed && similarity(awaiting.pl, typed) >= 0.8) {
      // the learner already said this line: count it and go on
      typed = "";
      chat.record("you", awaiting.pl);
      awaiting = null;
      step++;
      return playNext();
    }
    typed = "";
    chat.setChips([awaiting.pl], () => sayLine(awaiting));
    chat.showStatus(t("chat.sample_your_turn"));
  }

  function sayLine(line) {
    if (awaiting !== line) return;
    awaiting = null;
    step++;
    chat.showStatus("");
    chat.setChips([]);
    chat.addBubble("you", { pl: line.pl, ru: line.ru, audio: true, autoplay: false });
    chat.record("you", line.pl);
    playNext();
  }

  function finishSample(skipped) {
    if (mode !== "sample") return;
    awaiting = null;
    chat.showStatus("");
    chat.finish();
    chat.setGoalsDone((sc.goals ?? []).map((_, i) => i));
    chat.showSummary({ praise: t(skipped ? "chat.sample_skipped" : "chat.sample_done") }, { title: t("chat.sample_title") });
    mode = "done";
    ctx.recordPractice(ex.id, { mode: "selfcheck", passed: false });
    updateBar();
  }

  updateBar();
  return root;
}
