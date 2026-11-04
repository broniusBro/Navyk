import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createTranslator, flatKeys } from "../js/engine/i18n.js";
import { pickLang, resolveDataRefs, localized } from "../js/engine/course.js";

const webDir = fileURLToPath(new URL("..", import.meta.url));
const load = (f) => JSON.parse(readFileSync(join(webDir, "i18n", f), "utf8"));

/** Deep merge (b wins) — folds optional ru.<part>.json files into ru.json. */
function merge(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b ?? {})) {
    out[k] = v && typeof v === "object" && !("other" in v) && out[k] && typeof out[k] === "object" ? merge(out[k], v) : v;
  }
  return out;
}

// Interface is Russian only for now. Extra key files (ru.<part>.json) are merged in for the key checks.
const extras = readdirSync(join(webDir, "i18n")).filter((f) => /^ru\.[\w-]+\.json$/.test(f));
const ru = extras.reduce((d, f) => merge(d, load(f)), load("ru.json"));
const dicts = { ru };

test("extra key files do not redefine keys of ru.json", () => {
  const base = new Set(flatKeys(load("ru.json")));
  for (const f of extras) for (const k of flatKeys(load(f))) assert.ok(!base.has(k), `${f}: ${k} already in ru.json`);
});

test("plural forms present for ru (one, few, many, other)", () => {
  const walk = (o, l, path = "") => {
    for (const [k, v] of Object.entries(o)) {
      if (v && typeof v === "object" && "other" in v) {
        for (const c of ["one", "few", "many", "other"]) assert.ok(v[c], `${l}:${path}${k}.${c}`);
      } else if (v && typeof v === "object") walk(v, l, `${path}${k}.`);
    }
  };
  for (const l of Object.keys(dicts)) walk(dicts[l], l);
});

test("translator: interpolation, plurals, fallback", () => {
  const t = createTranslator(dicts.ru, "ru");
  assert.equal(t("stats.streak_label", { count: 1 }), "Серия: 1 день подряд");
  assert.equal(t("stats.streak_label", { count: 3 }), "Серия: 3 дня подряд");
  assert.equal(t("stats.streak_label", { count: 5 }), "Серия: 5 дней подряд");
  assert.equal(t("missing.key"), "missing.key");
  const tf = createTranslator({}, "ru", dicts.ru);
  assert.equal(tf("common.next"), dicts.ru.common.next, "fallback dictionary");
});

test("every exercise type of the course has a label", () => {
  const course = JSON.parse(readFileSync(join(webDir, "..", "content", "course.json"), "utf8"));
  for (const type of Object.keys(course.exercise_types)) assert.ok(dicts.ru.exercise.type[type], `exercise.type.${type}`);
});

test("pickLang: Russian interface", () => {
  assert.equal(pickLang("ru"), "ru");
  assert.equal(pickLang("fr"), "ru");
  assert.equal(pickLang(null), "ru");
});

test("resolveDataRefs with and without data", () => {
  const md = "Type into {{data.ui_paths.chat_input}} and press {{data.ui_paths.send}}.";
  assert.equal(resolveDataRefs(md, null, "ru"), "Type into `chat input` and press `send`.");
  const data = { ui_paths: { chat_input: { label: "Reply…", hint: { ru: "поле ввода сообщения" } }, send: "**Send**" } };
  assert.equal(resolveDataRefs(md, data, "ru"), "Type into **Reply…** (поле ввода сообщения) and press **Send**.");
  assert.equal(localized({ ru: "а", en: "b" }, "uk"), "а");
});

// ---- static guards over UI code -----------------------------------------------------------

function jsFiles(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? jsFiles(p) : p.endsWith(".js") ? [p] : [];
  });
}

test("engine has no DOM or browser globals", () => {
  for (const f of jsFiles(join(webDir, "js", "engine"))) {
    const src = readFileSync(f, "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.ok(!/\b(document|window|localStorage|navigator|fetch)\b/.test(src), `${f} touches browser APIs`);
  }
});

test("innerHTML only in dom.js setSafeHtml", () => {
  for (const f of jsFiles(join(webDir, "js"))) {
    const src = readFileSync(f, "utf8");
    const n = (src.match(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/g) ?? []).length;
    if (f.endsWith(join("ui", "dom.js"))) assert.equal(n, 1, "exactly one sink");
    else assert.equal(n, 0, `${f} uses an HTML sink`);
  }
});

test("UI code has no hardcoded Cyrillic strings", () => {
  for (const f of jsFiles(join(webDir, "js"))) {
    const src = readFileSync(f, "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.ok(!/[А-Яа-яЁёІіЇїЄєҐґ]/.test(src), `${f} contains Cyrillic text`);
  }
});

test("every i18n key used in UI code exists", () => {
  const keys = new Set(flatKeys(dicts.ru));
  const used = new Set();
  for (const f of jsFiles(join(webDir, "js"))) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/\bt\(\s*"([\w.]+)"/g)) used.add(m[1]);
  }
  for (const k of used) assert.ok(keys.has(k), `missing i18n key ${k}`);
  // keys built with template literals in the exercise and chat code
  for (const r of ["no_key", "limit", "error"]) assert.ok(keys.has(`ai.unavailable_${r}`), r);
  for (const v of ["ok", "close", "bad"]) assert.ok(keys.has(`ai.verdict_${v}`), v);
  for (const l of ["good", "ok", "bad"]) assert.ok(keys.has(`speak.level_${l}`), l);
  for (const e of ["not_allowed", "no_speech", "network", "generic"]) assert.ok(keys.has(`speak.error_${e}`), e);
  for (const k of ["path.status_soon", "lang.ru", "exercise.type.speak", "speak.i_said", "chat.finish", "helper.title", "ai.unavailable_error"]) {
    assert.ok(keys.has(k), k);
  }
});

test("service worker precaches every client module", () => {
  const sw = readFileSync(join(webDir, "sw.js"), "utf8");
  for (const f of jsFiles(join(webDir, "js"))) {
    const rel = `./${f.slice(webDir.length).replace(/\\/g, "/").replace(/^\//, "")}`;
    assert.ok(sw.includes(`"${rel}"`), `sw.js SHELL_FILES lacks ${rel}`);
  }
});

test("auth error codes and screens have strings in every locale", () => {
  for (const l of Object.keys(dicts)) {
    for (const code of ["email_required", "invalid_email", "password_required", "weak_password", "password_mismatch", "invalid_credentials", "locked", "network", "generic"]) {
      assert.ok(dicts[l].auth.error[code], `${l} auth.error.${code}`);
    }
    assert.match(dicts[l].auth.privacy_text, /Anthropic/, `${l}: privacy note mentions no affiliation`);
  }
});
