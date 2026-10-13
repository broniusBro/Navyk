import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createTranslator, flatKeys } from "../js/engine/i18n.js";
import { pickLang, resolveDataRefs, pathStatus, localized, normalizeExercise } from "../js/engine/course.js";

const webDir = fileURLToPath(new URL("..", import.meta.url));
const load = (l) => JSON.parse(readFileSync(join(webDir, "i18n", `${l}.json`), "utf8"));
const dicts = { ru: load("ru"), uk: load("uk"), en: load("en") };

test("all locales have identical keys", () => {
  const ru = flatKeys(dicts.ru);
  assert.deepEqual(flatKeys(dicts.uk), ru);
  assert.deepEqual(flatKeys(dicts.en), ru);
});

test("plural forms present for ru/uk (one, few, many, other)", () => {
  const walk = (o, l, path = "") => {
    for (const [k, v] of Object.entries(o)) {
      if (v && typeof v === "object" && "other" in v) {
        if (l !== "en") for (const c of ["one", "few", "many", "other"]) assert.ok(v[c], `${l}:${path}${k}.${c}`);
        else for (const c of ["one", "other"]) assert.ok(v[c], `${l}:${path}${k}.${c}`);
      } else if (v && typeof v === "object") walk(v, l, `${path}${k}.`);
    }
  };
  for (const l of Object.keys(dicts)) walk(dicts[l], l);
});

test("translator: interpolation, plurals, fallback", () => {
  const t = createTranslator(dicts.ru, "ru", dicts.en);
  assert.equal(t("stats.streak_label", { count: 1 }), "Серия: 1 день подряд");
  assert.equal(t("stats.streak_label", { count: 3 }), "Серия: 3 дня подряд");
  assert.equal(t("stats.streak_label", { count: 5 }), "Серия: 5 дней подряд");
  assert.equal(t("criteria.R4.name"), "Критерии успеха");
  assert.equal(t("missing.key"), "missing.key");
  const tu = createTranslator(dicts.uk, "uk");
  assert.equal(tu("path.due", { count: 2 }), "2 теми чекають на повторення");
  const te = createTranslator(dicts.en, "en");
  assert.equal(te("footer.independent"), "Navyk is an independent course, not affiliated with Anthropic");
});

test("required keys exist: footer notice, R1-R9, verdicts", () => {
  for (const l of Object.keys(dicts)) {
    assert.match(dicts[l].footer.independent, /Anthropic/);
    for (let i = 1; i <= 9; i++) assert.ok(dicts[l].criteria[`R${i}`].name, `${l} R${i}`);
    for (const v of ["draft", "working", "strong", "off_task"]) assert.ok(dicts[l].verdict[v]);
  }
  assert.equal(dicts.ru.footer.independent, "Navyk — независимый курс, не связан с Anthropic");
});

test("pickLang: saved > navigator (uk, ru) > en", () => {
  assert.equal(pickLang("uk", ["en-US"]), "uk");
  assert.equal(pickLang(null, ["uk-UA", "en"]), "uk");
  assert.equal(pickLang(null, ["ru-RU"]), "ru");
  assert.equal(pickLang(null, ["de-DE", "ru"]), "ru");
  assert.equal(pickLang(null, ["pl-PL"]), "en");
  assert.equal(pickLang("fr", []), "en");
});

test("resolveDataRefs with and without data", () => {
  const md = "Type into {{data.ui_paths.chat_input}} and press {{data.ui_paths.send}}.";
  assert.equal(resolveDataRefs(md, null, "ru"), "Type into `chat input` and press `send`.");
  const data = { ui_paths: { chat_input: { label: "Reply to Claude…", hint: { ru: "поле ввода сообщения" } }, send: "**Send**" } };
  assert.equal(resolveDataRefs(md, data, "ru"), "Type into **Reply to Claude…** (поле ввода сообщения) and press **Send**.");
});

test("pathStatus marks done/current/open/soon", () => {
  const course = JSON.parse(readFileSync(join(webDir, "..", "content", "course.json"), "utf8"));
  const st = pathStatus(course, new Set(["b1.1", "b2.1"]), new Set());
  assert.equal(st["b1.1"], "current");
  assert.equal(st["b2.1"], "open");
  assert.equal(st["b1.2"], "soon");
  const st2 = pathStatus(course, new Set(["b1.1", "b2.1"]), new Set(["b1.1"]));
  assert.equal(st2["b1.1"], "done");
  assert.equal(st2["b2.1"], "current");
  assert.equal(localized({ ru: "а", en: "b" }, "uk"), "а");
});

test("normalizeExercise maps legacy compare variant types", () => {
  const b = normalizeExercise({ kind: "exercise", type: "why_better", cards: [], options: [] });
  assert.equal(b.type, "compare_answers");
  assert.equal(b.variant, "why_better");
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
  const keys = new Set(flatKeys(dicts.en));
  const used = new Set();
  for (const f of jsFiles(join(webDir, "js"))) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/\bt\(\s*"([\w.]+)"/g)) used.add(m[1]);
  }
  for (const k of used) assert.ok(keys.has(k), `missing i18n key ${k}`);
  for (const k of ["criteria.R1.name", "verdict.draft", "path.status_soon", "roles.goal", "exercise.build_ok", "practice.error_input_too_short", "criteria_level.good", "lang.ru"]) {
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
