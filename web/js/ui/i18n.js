// Runtime i18n: loads dictionaries, exposes t(), switches language without reload.

import { createTranslator } from "../engine/i18n.js";
import { pickLang, LANGS } from "../engine/course.js";
import { getStatic } from "../platform/http.js";
import { getItem, setItem } from "../platform/storage.js";
import { preferredLanguages } from "../platform/device.js";

const dicts = {};
const listeners = new Set();
let lang = "en";
let translate = (k) => k;

async function load(code) {
  if (!dicts[code]) dicts[code] = (await getStatic(`./i18n/${code}.json`)) ?? {};
  return dicts[code];
}

export async function initI18n() {
  const code = pickLang(getItem("lang"), preferredLanguages());
  await setLang(code, { persist: false });
}

export async function setLang(code, { persist = true } = {}) {
  if (!LANGS.includes(code)) return;
  const [dict, fallback] = await Promise.all([load(code), load("en")]);
  lang = code;
  translate = createTranslator(dict, code, fallback);
  if (persist) setItem("lang", code);
  document.documentElement.lang = code;
  applyStatic(document);
  for (const fn of listeners) fn(code);
}

export const t = (key, params) => translate(key, params);
export const getLang = () => lang;
export const onLangChange = (fn) => listeners.add(fn);

/** Fill elements marked with data-i18n (text) and data-i18n-attr="attr:key;attr:key". */
export function applyStatic(root) {
  for (const el of root.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll("[data-i18n-attr]")) {
    for (const pair of el.dataset.i18nAttr.split(";")) {
      const [attr, key] = pair.split(":");
      if (attr && key) el.setAttribute(attr.trim(), t(key.trim()));
    }
  }
}

export function formatNumber(n) {
  try {
    return new Intl.NumberFormat(lang).format(n);
  } catch {
    return String(n);
  }
}

export function formatTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(lang, { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }).format(d);
  } catch {
    return d.toISOString();
  }
}

export function formatDate(key) {
  const [y, m, d] = String(key).split("-").map(Number);
  if (!y) return "";
  try {
    return new Intl.DateTimeFormat(lang, { day: "numeric", month: "long" }).format(new Date(y, m - 1, d));
  } catch {
    return key;
  }
}
