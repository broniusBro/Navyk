// App entry: routing between path, lesson, review and completion screens.
// Routes (hash): #/  |  #/lesson/<id>  |  #/review

import { initI18n, t, getLang, onLangChange, applyStatic } from "./ui/i18n.js";
import { h } from "./ui/dom.js";
import { footer } from "./ui/chrome.js";
import { renderPath } from "./ui/path.js";
import { mountLesson } from "./ui/lesson.js";
import { renderComplete } from "./ui/complete.js";
import { getProgress, saveProgress, shuffleSeed } from "./ui/store.js";
import { fetchCourse, fetchLesson, probeAvailable } from "./platform/api.js";
import { deviceId, now, onConnectivityChange } from "./platform/device.js";
import { registerServiceWorker } from "./platform/sw.js";
import { dayKey } from "./engine/dates.js";
import { flattenCourse, sourcesBlock, normalizeExercise } from "./engine/course.js";
import { completeLesson, streak, activeToday, dueItems, nextDue, applyReviews, pickReviewExercise } from "./engine/progress.js";
import { sessionResults } from "./engine/session.js";

const app = document.getElementById("app");
const state = { course: null, available: null, loading: true, devId: deviceId(), seed: shuffleSeed() };
let screenToken = 0;

const today = () => dayKey(now());

function setTitle(key, params) {
  document.title = `${t(key, params)} | Navyk`;
}

function showError(messageKey) {
  app.replaceChildren(
    h(
      "div.screen",
      h("main.complete", { id: "main" }, h("h1.complete__title", { tabindex: "-1" }, t(messageKey)), h("button.btn.btn--primary", { type: "button", onclick: () => go("#/") }, t("complete.back"))),
      footer(),
    ),
  );
}

function go(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

// ---- screens ----------------------------------------------------------------------------

function showPath() {
  const p = getProgress();
  const d = today();
  setTitle("path.title");
  const due = dueItems(p.repeat, d).filter((it) => state.available === null || state.available.has(it.lessonId));
  app.replaceChildren(
    renderPath({
      course: state.course,
      available: state.available,
      loading: state.loading,
      progress: p,
      streak: streak(p.days, d),
      activeToday: activeToday(p.days, d),
      due: due.length,
      onOpen: (id) => go(`#/lesson/${encodeURIComponent(id)}`),
      onReview: () => go("#/review"),
    }),
  );
  app.querySelector("h1")?.focus({ preventScroll: true });
}

async function showLesson(lessonId, token) {
  app.replaceChildren(h("div.screen", h("main.loading-screen", { id: "main", role: "status" }, h("p", t("lesson.loading")))));
  const lang = getLang();
  const lesson = await fetchLesson(lang, lessonId);
  if (token !== screenToken) return;
  if (!lesson) return showError("lesson.not_found");
  setTitle("lesson.doc_title", { title: lesson.meta.title });
  mountLesson(app, {
    lesson,
    lang,
    deviceId: state.devId,
    seed: state.seed,
    data: null,
    onClose: () => go("#/"),
    onFinish: (session) => {
      const r = completeLesson(getProgress(), { lessonId, results: sessionResults(session), meta: lesson.meta, today: today() });
      saveProgress(r.progress);
      const src = sourcesBlock(lesson);
      setTitle("complete.title");
      app.replaceChildren(
        renderComplete({
          title: lesson.meta.title,
          earned: r.earned,
          awarded: r.awarded,
          streakBefore: r.streakBefore,
          streakAfter: r.streakAfter,
          nextReview: nextDue(r.progress.repeat),
          sources: src?.markdown ?? null,
          verifiedAt: lesson.meta.verified_at,
          onBack: () => go("#/"),
        }),
      );
    },
  });
}

async function showReview(token) {
  const lang = getLang();
  const d = today();
  const items = dueItems(getProgress().repeat, d).slice(0, 8);
  if (!items.length) return go("#/");
  app.replaceChildren(h("div.screen", h("main.loading-screen", { id: "main", role: "status" }, h("p", t("lesson.loading")))));
  const blocks = [];
  const keyByExercise = {};
  for (const it of items) {
    const lesson = await fetchLesson(lang, it.lessonId);
    if (!lesson) continue;
    const exs = lesson.blocks.filter((b) => b.kind === "exercise").map(normalizeExercise);
    const ex = pickReviewExercise(it, exs);
    if (!ex || keyByExercise[ex.id]) continue;
    keyByExercise[ex.id] = it.key;
    blocks.push(ex);
  }
  if (token !== screenToken) return;
  if (!blocks.length) return showError("review.unavailable");
  const reviewLesson = { meta: { id: "review", title: t("review.title") }, blocks };
  setTitle("review.title");
  mountLesson(app, {
    lesson: reviewLesson,
    lang,
    deviceId: state.devId,
    seed: `${state.seed}:${d}`,
    data: null,
    onClose: () => go("#/"),
    onFinish: (session) => {
      const outcomes = sessionResults(session).map((r) => ({ key: keyByExercise[r.exerciseId], correct: r.ai ? true : Boolean(r.correct && r.firstTry) }));
      const before = getProgress();
      const correctCount = outcomes.filter((o) => o.correct).length;
      const xp = correctCount * 2;
      let next = applyReviews(before, outcomes, d);
      const streakBefore = streak(next.days, d);
      next = { ...next, xp: next.xp + xp };
      saveProgress(next);
      app.replaceChildren(
        renderComplete({
          isReview: true,
          title: t("review.result", { correct: correctCount, total: outcomes.length }),
          earned: { base: 0, firstTry: 0, ai: 0, total: xp },
          awarded: xp,
          streakBefore,
          streakAfter: streakBefore,
          nextReview: nextDue(next.repeat),
          sources: null,
          onBack: () => go("#/"),
        }),
      );
    },
  });
}

// ---- routing ----------------------------------------------------------------------------

function route() {
  const token = ++screenToken;
  const hash = location.hash || "#/";
  const lessonMatch = /^#\/lesson\/([\w.-]+)$/.exec(hash);
  if (lessonMatch) return showLesson(decodeURIComponent(lessonMatch[1]), token);
  if (hash === "#/review") return showReview(token);
  return showPath();
}

async function loadCourse() {
  state.loading = true;
  state.course = await fetchCourse();
  state.loading = false;
  if (!state.course) {
    if (isPathVisible()) showPath();
    return;
  }
  if (isPathVisible()) showPath();
  await refreshAvailability();
}

async function refreshAvailability() {
  if (!state.course) return;
  const ids = flattenCourse(state.course).map((x) => x.lesson.id);
  const lang = getLang();
  await probeAvailable(lang, ids, (set) => {
    if (lang !== getLang()) return;
    state.available = set;
    if (isPathVisible()) showPath();
  });
}

const isPathVisible = () => !/^#\/(lesson|review)/.test(location.hash);

async function main() {
  await initI18n();
  applyStatic(document);
  onLangChange(() => {
    state.available = null;
    if (isPathVisible()) showPath();
    refreshAvailability();
  });
  globalThis.addEventListener("hashchange", route);
  onConnectivityChange((online) => {
    document.documentElement.classList.toggle("is-offline", !online);
    if (online && !state.course) loadCourse();
  });
  route();
  loadCourse();
  registerServiceWorker();
}

main();
