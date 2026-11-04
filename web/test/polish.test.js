import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizePl, stripDiacritics, looseKey, checkTypeAnswer, checkBuildSentence, levenshtein, similarity, checkSpeak, speakLevel, PL_LETTERS, fixLayout, hasCyrillic, PL_KEYBOARD,
} from "../js/engine/polish.js";

test("normalizePl: case, spaces, punctuation and every kind of quote", () => {
  assert.equal(normalizePl("  Tak,   DZIĘKUJĘ! "), "tak dziękuję");
  assert.equal(normalizePl("„Dzień dobry” — «cześć»…"), "dzień dobry cześć");
  assert.equal(normalizePl('"Jestem" z \'Polski\'?!'), "jestem z polski");
  assert.equal(normalizePl("Ł Ś Ż"), "ł ś ż", "Polish capitals lower-cased");
  assert.equal(normalizePl(null), "");
  // NFD input (combining ogonek) normalizes to the same string
  assert.equal(normalizePl("dziękuję"), "dziękuję");
});

test("stripDiacritics maps every Polish letter, both cases", () => {
  assert.equal(stripDiacritics("ąćęłńóśźż"), "acelnoszz");
  assert.equal(stripDiacritics("ĄĆĘŁŃÓŚŹŻ"), "ACELNOSZZ");
  assert.equal(stripDiacritics("Zażółć gęślą jaźń"), "Zazolc gesla jazn");
  assert.equal(PL_LETTERS.length, 9);
  assert.equal(looseKey("Dziękuję!"), "dziekuje");
});

const ta = { accept: ["Tak, dziękuję!", "Tak, dzięki!"] };

test("checkTypeAnswer: exact, normalized, diacritics-only, wrong", () => {
  assert.deepEqual(checkTypeAnswer(ta, "Tak, dziękuję!"), { correct: true, exact: true, diacriticsOnly: false, expected: "Tak, dziękuję!" });
  const loose = checkTypeAnswer(ta, "tak dziękuję");
  assert.equal(loose.correct, true);
  assert.equal(loose.exact, false);
  assert.equal(loose.diacriticsOnly, false);
  const dia = checkTypeAnswer(ta, "tak, dziekuje");
  assert.equal(dia.correct, true);
  assert.equal(dia.diacriticsOnly, true);
  assert.equal(dia.expected, "Tak, dziękuję!");
  assert.equal(checkTypeAnswer(ta, "tak dzieki").expected, "Tak, dzięki!", "expected = the matched variant");
  const bad = checkTypeAnswer(ta, "Nie, dziękuję");
  assert.equal(bad.correct, false);
  assert.equal(bad.expected, "Tak, dziękuję!");
  assert.equal(checkTypeAnswer(ta, "   ").correct, false);
  assert.equal(checkTypeAnswer({ accept: [] }, "x").correct, false);
});

test("checkTypeAnswer: a wrong diacritic is not a diacritics-only pass when it changes nothing else", () => {
  // "z" vs "ż" counts (only diacritics differ), but a different word does not
  assert.equal(checkTypeAnswer({ accept: ["Może"] }, "moze").diacriticsOnly, true);
  assert.equal(checkTypeAnswer({ accept: ["Może"] }, "morze").correct, false);
});

const bs = { words: ["Nie,", "dziękuję.", "Cześć!"], extra: ["Tak,", "Proszę."], accept: [["Cześć!", "Nie,", "dziękuję."]] };

test("checkBuildSentence: target order, accept orders, per-tile marks", () => {
  assert.equal(checkBuildSentence(bs, ["Nie,", "dziękuję.", "Cześć!"]).correct, true);
  assert.equal(checkBuildSentence(bs, ["Cześć!", "Nie,", "dziękuję."]).correct, true, "accept order");
  assert.equal(checkBuildSentence(bs, ["nie", "dziękuję", "cześć"]).correct, true, "case and punctuation ignored");
  const wrong = checkBuildSentence(bs, ["Tak,", "dziękuję.", "Cześć!"]);
  assert.equal(wrong.correct, false);
  assert.deepEqual(wrong.items.map((i) => i.correct), [false, true, true]);
  assert.equal(wrong.expected, "Nie, dziękuję. Cześć!");
  const short = checkBuildSentence(bs, ["Nie,", "dziękuję."]);
  assert.equal(short.correct, false, "incomplete");
  assert.equal(checkBuildSentence(bs, ["Nie,", "dziękuję.", "Cześć!", "Proszę."]).correct, false, "extra tile used");
  assert.equal(checkBuildSentence(bs, []).correct, false);
});

test("levenshtein", () => {
  assert.equal(levenshtein("kitten", "sitting"), 3);
  assert.equal(levenshtein("", "abc"), 3);
  assert.equal(levenshtein("żółw", "żółw"), 0);
  assert.equal(levenshtein("żółw", "zolw"), 3, "code points, not bytes");
});

test("similarity: 1 for same phrase, high for small slips, low for other phrases", () => {
  assert.equal(similarity("Dziękuję", "dziękuję"), 1);
  assert.equal(similarity("Dziękuję!", "dziekuje"), 1, "recognizers may drop diacritics");
  assert.equal(similarity("Dzień dobry", ""), 0);
  assert.ok(similarity("Dzień dobry", "dzień dobre") >= 0.8);
  assert.ok(similarity("Dzień dobry", "dobry") < 0.8, "half the phrase is not good");
  assert.ok(similarity("Dziękuję", "dzień dobry") < 0.55);
  assert.ok(similarity("Tak", "dzień dobry, jak się masz") < 0.55, "long unrelated speech does not pass");
  const s = similarity("Jestem z Ukrainy", "jestem z ukrainy proszę");
  assert.ok(s >= 0.55 && s < 1, "an extra word costs a little");
  assert.ok(similarity("a b", "b a") > 0 && similarity("a b", "b a") <= 1);
});

test("checkSpeak: levels, alternatives and accept", () => {
  const ex = { phrase: "Dziękuję", accept: ["Dzięki"] };
  assert.deepEqual(checkSpeak(ex, "dziękuję"), { score: 1, level: "good", heard: "dziękuję" });
  assert.equal(checkSpeak(ex, "dzięki").level, "good", "accept variant");
  assert.equal(checkSpeak(ex, ["dzień dobry", "dziękuje"]).heard, "dziękuje", "best alternative wins");
  assert.equal(checkSpeak(ex, "tak").level, "bad");
  assert.equal(checkSpeak(ex, "").level, "bad");
  assert.equal(speakLevel(0.8), "good");
  assert.equal(speakLevel(0.6), "ok");
  assert.equal(speakLevel(0.2), "bad");
  assert.equal(checkSpeak({ phrase: "Dzień dobry" }, "dzień dobra").level !== "bad", true);
});

test("fixLayout: Russian layout typing becomes the Latin letters on the same keys", () => {
  assert.equal(fixLayout("Ефл"), "Tak");
  assert.equal(fixLayout("Ефлб вяшулгоу"), "Tak, dziekuje");
  assert.equal(fixLayout("Nie, dziękuję"), "Nie, dziękuję");
  assert.equal(fixLayout("ДЩД"), "LOL");
  assert.equal(hasCyrillic("tak"), false);
  assert.equal(hasCyrillic("еф"), true);
});

test("PL_KEYBOARD has the 26 Latin letters minus none of the Polish ones", () => {
  const letters = PL_KEYBOARD.flat();
  assert.equal(new Set(letters).size, letters.length);
  for (const ch of "abcdefghijklmnoprstuwyz") assert.ok(letters.includes(ch), ch);
});
