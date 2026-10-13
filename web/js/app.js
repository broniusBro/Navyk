// App entry: routing between path, lesson, review, completion and account screens.
// Routes (hash): #/  |  #/lesson/<id>  |  #/review  |  #/login  |  #/register  |  #/check-email
//                #/forgot  |  #/confirm/<token>  |  #/reset/<token>

import { initI18n, t, getLang, setLang, onLangChange, applyStatic } from "./ui/i18n.js";
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
import { flattenCourse, sourcesBlock, normalizeExercise, localized, LANGS } from "./engine/course.js";
import { completeLesson, streak, activeToday, dueItems, nextDue, applyReviews, pickReviewExercise } from "./engine/progress.js";
import { sessionResults } from "./engine/session.js";
import { canOpenLesson, parseTokenRoute } from "./engine/auth.js";
import { enter } from "./ui/motion.js";
import { closeSheet } from "./ui/sheet.js";
import { initAccount, currentUser, isSignedIn, accountChecked, onAccountChange, progressChanged, updateLanguage } from "./ui/account.js";
import { renderLogin, renderRegister, renderCheckEmail, renderConfirm, renderForgot, renderReset, openSignupSheet, openAccountSheet } from "./ui/auth.js";

const app = document.getElementById("app");
const state = { course: null, available: null, loading: true, devId: deviceId(), seed: shuffleSeed(), roadAnimated: false };
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

function openLesson(lesson) {
  const hash = `#/lesson/${encodeURIComponent(lesson.id)}`;
  if (canOpenLesson(lesson, isSignedIn()) || isCompleted(lesson.id)) return go(hash);
  openSignupSheet({ go, lessonHash: hash, lessonTitle: localized(lesson.title, getLang()) });
}

const isCompleted = (id) => Boolean(getProgress().lessons[id]);

function showPath({ refresh = false } = {}) {
  const p = getProgress();
  const d = today();
  setTitle("path.title");
  const due = dueItems(p.repeat, d).filter((it) => state.available === null || state.available.has(it.lessonId));
  const ready = Boolean(state.course && state.available);
  const animate = ready && !state.roadAnimated;
  if (ready) state.roadAnimated = true;
  const scroll = refresh ? globalThis.scrollY : 0;
  app.replaceChildren(
    renderPath({
      course: state.course,
      available: state.available,
      loading: state.loading,
      progress: p,
      user: currentUser(),
      animate,
      streak: streak(p.days, d),
      activeToday: activeToday(p.days, d),
      due: due.length,
      onOpen: openLesson,
      onReview: () => go("#/review"),
      onAccount: () => openAccountSheet({ go }),
    }),
  );
  if (refresh) globalThis.scrollTo?.(0, scroll);
  else app.querySelector("h1")?.focus({ preventScroll: true });
}

async function showLesson(lessonId, token) {
  app.replaceChildren(h("div.screen", h("main.loading-screen", { id: "main", role: "status" }, h("p", t("lesson.loading")))));
  const lang = getLang();
  const lesson = await fetchLesson(lang, lessonId);
  if (token !== screenToken) return;
  if (!lesson) return showError("lesson.not_found");
  if (!canOpenLesson(lesson.meta, isSignedIn()) && !isCompleted(lessonId)) {
    // deep link to a members-only lesson: back to the path with the friendly sign-up sheet
    history.replaceState(null, "", "#/");
    showPath();
    openSignupSheet({ go, lessonHash: `#/lesson/${encodeURIComponent(lessonId)}`, lessonTitle: lesson.meta.title });
    return;
  }
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
      progressChanged();
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
      progressChanged();
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

const AUTH_SCREENS = {
  "#/login": [renderLogin, "auth.login_title"],
  "#/register": [renderRegister, "auth.register_title"],
  "#/check-email": [renderCheckEmail, "auth.check_title"],
  "#/forgot": [renderForgot, "auth.forgot_title"],
};

function showScreen(el, titleKey) {
  setTitle(titleKey);
  app.replaceChildren(el);
  enter(el, 0);
}

function route() {
  const token = ++screenToken;
  closeSheet();
  const hash = location.hash || "#/";
  const lessonMatch = /^#\/lesson\/([\w.-]+)$/.exec(hash);
  if (lessonMatch) return showLesson(decodeURIComponent(lessonMatch[1]), token);
  if (hash === "#/review") return showReview(token);
  const tokenRoute = parseTokenRoute(hash);
  if (tokenRoute?.kind === "confirm") return showScreen(renderConfirm({ token: tokenRoute.token, go }), "auth.confirm_title");
  if (tokenRoute?.kind === "reset") return showScreen(renderReset({ token: tokenRoute.token, go }), "auth.reset_title");
  const screen = AUTH_SCREENS[hash];
  if (screen) {
    // redirect only once the server confirmed the session (a cached user may be stale: expired or logged out elsewhere)
    if (isSignedIn() && accountChecked() && hash !== "#/check-email") return go("#/");
    return showScreen(screen[0]({ go }), screen[1]);
  }
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
    if (isPathVisible()) showPath({ refresh: state.roadAnimated });
  });
}

const isPathVisible = () => location.hash === "" || location.hash === "#/" || location.hash === "#";

async function main() {
  await initI18n();
  applyStatic(document);
  onLangChange((lang) => {
    state.available = null;
    updateLanguage(lang);
    if (isPathVisible()) showPath();
    else if (AUTH_SCREENS[location.hash]) route();
    refreshAvailability();
  });
  onAccountChange(({ user, reason }) => {
    // language comes from the account
    if (reason === "user" && user?.lang && LANGS.includes(user.lang) && user.lang !== getLang()) setLang(user.lang);
    // a confirmed session makes the login/register/forgot screens pointless
    if (reason === "user" && user && AUTH_SCREENS[location.hash] && location.hash !== "#/check-email") return go("#/");
    if (isPathVisible()) showPath({ refresh: true });
  });
  globalThis.addEventListener("hashchange", route);
  onConnectivityChange((online) => {
    document.documentElement.classList.toggle("is-offline", !online);
    if (online && !state.course) loadCourse();
  });
  route();
  loadCourse();
  initAccount();
  registerServiceWorker();
}

main();
