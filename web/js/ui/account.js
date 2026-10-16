// Account state and progress sync. The session is an HttpOnly cookie owned by the server; here we only
// keep who is signed in (for the header) and push/pull progress.
//   - GET /api/auth/me on start; network error -> keep the last known user (offline), 401 -> signed out.
//   - Sync = GET /api/progress, merge (engine/sync.js), save locally, PUT if the server copy differs.
//   - Failures are queued: "dirty" flag in storage, retries with backoff and on reconnect.
//   - Heartbeat: while signed in and on screen, POST /api/auth/ping every 2 min (time-in-app stats).
//   - Anonymous progress is merged into the account at first sign-in; signing out clears this device.

import * as api from "../platform/api.js";
import { getItem, setItem, removeItem } from "../platform/storage.js";
import { onConnectivityChange, isForeground, onForegroundChange, isOnline } from "../platform/device.js";
import { normalizeUser } from "../engine/auth.js";
import { mergeProgress, sameProgress, retryDelay } from "../engine/sync.js";
import { emptyProgress } from "../engine/progress.js";
import { getProgress, saveProgress } from "./store.js";

let user = normalizeUser(getItem("user"));
let checked = false;
const listeners = new Set();
let syncing = null;
let again = false;
let retries = 0;
let retryTimer = null;
let pingTimer = null;
const PING_MS = 2 * 60 * 1000;

export const currentUser = () => user;
export const isSignedIn = () => Boolean(user);
export const accountChecked = () => checked;

/** fn({ user, reason }) on sign-in/out and when sync changed local progress. reason: "user" | "progress". */
export function onAccountChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const emit = (reason) => {
  for (const fn of listeners) fn({ user, reason });
};

function setUser(next) {
  const was = user?.id ?? null;
  user = next;
  heartbeat();
  if (user) setItem("user", user);
  else removeItem("user");
  if ((user?.id ?? null) !== was) emit("user");
}

/** Called once at start. */
export async function initAccount() {
  onConnectivityChange((online) => {
    if (online && user && getItem("sync:dirty")) syncNow();
  });
  onForegroundChange((fg) => {
    if (fg && user && isOnline()) ping();
    heartbeat();
  });
  const res = await api.authMe();
  checked = true;
  heartbeat();
  if (res.status === 200) {
    const u = normalizeUser(res.body?.user ?? res.body);
    setUser(u);
    if (u) syncNow();
  } else if (res.status === 401 || res.status === 404) {
    setUser(null);
  } else if (user) {
    emit("user"); // offline: keep the cached user; sync waits for the network
  }
  return user;
}

/** After a successful login / confirm / reset (the server already set the cookie). */
export async function signedIn(u) {
  setUser(normalizeUser(u));
  setItem("sync:dirty", true); // anonymous progress goes up with the first sync
  await syncNow();
}

/** Server said 401: the session is gone. Local progress stays (it may be anonymous work). */
function sessionLost() {
  clearTimeout(retryTimer);
  setUser(null);
}

export async function signOut() {
  if (getItem("sync:dirty")) await syncNow(); // try not to lose the last lesson
  await api.authLogout();
  clearTimeout(retryTimer);
  removeItem("sync:dirty");
  removeItem("sync:updatedAt");
  saveProgress(emptyProgress()); // the account keeps it; the next person on this device starts clean
  setUser(null);
  emit("progress");
}

/** Mark local progress as changed (after a lesson or review) and push it. */
export function progressChanged() {
  if (!user) return;
  setItem("sync:dirty", true);
  syncNow();
}

export function updateLanguage(lang) {
  if (!user || user.lang === lang) return;
  user = { ...user, lang };
  setItem("user", user);
  api.authUpdate({ lang }).then((res) => {
    if (res.status === 401) sessionLost();
  });
}

/** Keeps the server's visit open while the learner is actually here; stops in the background. */
function heartbeat() {
  clearInterval(pingTimer);
  pingTimer = null;
  if (user && checked && isForeground()) pingTimer = setInterval(() => isOnline() && ping(), PING_MS);
}
function ping() {
  api.authPing().then((res) => {
    if (res.status === 401) sessionLost();
  });
}

function scheduleRetry() {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(syncNow, retryDelay(retries++));
}

/** Pull, merge, push. Concurrent calls coalesce into one extra run. */
export function syncNow() {
  if (!user) return Promise.resolve();
  if (syncing) {
    again = true;
    return syncing;
  }
  syncing = runSync()
    .catch(() => scheduleRetry())
    .finally(() => {
      syncing = null;
      if (again) {
        again = false;
        syncNow();
      }
    });
  return syncing;
}

async function runSync() {
  for (let attempt = 0; attempt < 3; attempt++) {
    const got = await api.getRemoteProgress();
    if (got.status === 401) return sessionLost();
    if (got.status !== 200 && got.status !== 404) return scheduleRetry();
    const remote = got.status === 200 ? (got.body?.data ?? null) : null;
    const base = got.status === 200 ? (got.body?.updatedAt ?? null) : null;
    const local = getProgress();
    const merged = mergeProgress(local, remote);
    if (!sameProgress(merged, local)) {
      saveProgress(merged);
      emit("progress");
    }
    if (remote && sameProgress(merged, remote)) {
      done(base);
      return;
    }
    const put = await api.putRemoteProgress(merged, base);
    if (put.status === 200) {
      const back = put.body?.data;
      if (back && !sameProgress(back, getProgress())) {
        const m2 = mergeProgress(getProgress(), back);
        saveProgress(m2);
        emit("progress");
      }
      done(put.body?.updatedAt ?? null);
      return;
    }
    if (put.status === 401) return sessionLost();
    if (put.status !== 409) return scheduleRetry();
    // 409: somebody else wrote in between; pull again and merge
  }
  scheduleRetry();
}

function done(updatedAt) {
  retries = 0;
  clearTimeout(retryTimer);
  if (updatedAt) setItem("sync:updatedAt", updatedAt);
  removeItem("sync:dirty");
}

/** Where to go after signing in (e.g. the lesson the learner tapped). */
export function setAfterAuth(hash) {
  if (hash) setItem("afterAuth", hash);
  else removeItem("afterAuth");
}
export function takeAfterAuth() {
  const h = getItem("afterAuth");
  removeItem("afterAuth");
  return typeof h === "string" && /^#\/[\w./-]*$/.test(h) ? h : "#/";
}

/** E-mail typed in the last register/login form (for "check your email" and resend). */
export const pendingEmail = () => getItem("pendingEmail") ?? "";
export const setPendingEmail = (email) => setItem("pendingEmail", String(email ?? "").trim());
