// Polish typing help under a text field:
//  • a row with ⇧, the Polish letters (ą ć ę ł ń ó ś ź ż) and an «ABC» button;
//  • «ABC» opens a full on-screen Polish keyboard (QWERTY + space, backspace, punctuation) — for learners
//    whose device has only the Russian layout, or who don't want to switch layouts;
//  • optional layout fix: letters typed with the Russian layout are re-typed as the Latin letters on the same
//    keys («Ефл» → «Tak»), with a one-line note. Used in Polish-only fields (type_answer, translate), not in chats.
// The field keeps focus so the phone keyboard stays open; on the on-screen keyboard the phone keyboard is hidden.

import { h } from "../dom.js";
import { t } from "../i18n.js";
import { PL_LETTERS, PL_KEYBOARD, fixLayout, hasCyrillic } from "../../engine/polish.js";

export function insertAtCaret(field, text) {
  const start = typeof field.selectionStart === "number" ? field.selectionStart : field.value.length;
  const end = typeof field.selectionEnd === "number" ? field.selectionEnd : start;
  const max = Number(field.getAttribute("maxlength")) || Infinity;
  if (field.value.length - (end - start) + text.length > max) return;
  field.value = field.value.slice(0, start) + text + field.value.slice(end);
  const caret = start + text.length;
  field.setSelectionRange?.(caret, caret);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

function backspaceAtCaret(field) {
  const start = typeof field.selectionStart === "number" ? field.selectionStart : field.value.length;
  const end = typeof field.selectionEnd === "number" ? field.selectionEnd : start;
  if (start === end && start === 0) return;
  const from = start === end ? start - 1 : start;
  field.value = field.value.slice(0, from) + field.value.slice(end);
  field.setSelectionRange?.(from, from);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

/** A key button that never steals focus from the field. */
function keyBtn(cls, label, text, onPress) {
  const b = h(`button.pl-key${cls}`, { type: "button", lang: "pl", aria: { label } }, text);
  b.addEventListener("pointerdown", (e) => e.preventDefault());
  b.addEventListener("mousedown", (e) => e.preventDefault());
  b.addEventListener("click", onPress);
  return b;
}

/**
 * plKeys(field, { fixRussianLayout = false }) -> div.pl-keys-wrap
 * The returned element has setDisabled(bool).
 */
export function plKeys(field, { fixRussianLayout = false } = {}) {
  let upper = false;
  let boardOpen = false;
  let shiftBoard = null;
  const letterKeys = [];
  const caseAware = []; // [button, lowercase char]

  const type = (ch, e) => {
    if (field.disabled || field.readOnly) return;
    const letter = upper || e?.shiftKey ? ch.toLocaleUpperCase("pl") : ch;
    insertAtCaret(field, letter);
    if (!boardOpen) field.focus({ preventScroll: true });
    if (upper) toggleCase(false);
  };

  const mkLetter = (ch, extra = "") => {
    const b = keyBtn(extra, t("typeans.insert", { letter: ch }), ch, (e) => type(ch, e));
    caseAware.push([b, ch]);
    return b;
  };

  // row under the field
  for (const ch of PL_LETTERS) letterKeys.push(mkLetter(ch));
  const caseBtn = keyBtn(".pl-key--case", t("typeans.capital"), "⇧", () => toggleCase());
  caseBtn.setAttribute("aria-pressed", "false");
  const abcBtn = keyBtn(".pl-key--abc", t("typeans.keyboard"), "ABC", () => setBoard(!boardOpen));
  abcBtn.setAttribute("aria-expanded", "false");

  function toggleCase(on = !upper) {
    upper = on;
    caseBtn.setAttribute("aria-pressed", String(upper));
    for (const [b, ch] of caseAware) b.textContent = upper ? ch.toLocaleUpperCase("pl") : ch;
    shiftBoard?.setAttribute("aria-pressed", String(upper));
  }

  // full on-screen keyboard
  const rows = PL_KEYBOARD.map((row, i) => {
    const keys = row.map((ch) => mkLetter(ch, ".pl-key--board"));
    if (i === 2) keys.push(keyBtn(".pl-key--board.pl-key--wide", t("typeans.backspace"), "⌫", () => !field.readOnly && backspaceAtCaret(field)));
    return h("div.pl-board__row", keys);
  });
  shiftBoard = keyBtn(".pl-key--board.pl-key--wide", t("typeans.capital"), "⇧", () => toggleCase());
  rows[2].prepend(shiftBoard);
  const punct = [",", ".", "?", "!"].map((p) => keyBtn(".pl-key--board", p, p, () => type(p)));
  rows.push(
    h(
      "div.pl-board__row",
      punct.slice(0, 2),
      keyBtn(".pl-key--board.pl-key--space", t("typeans.space"), t("typeans.space"), () => type(" ")),
      punct.slice(2),
    ),
  );
  const board = h("div.pl-board", { hidden: true, role: "group", aria: { label: t("typeans.keyboard") } }, rows);

  function setBoard(open) {
    boardOpen = open;
    board.hidden = !open;
    abcBtn.setAttribute("aria-expanded", String(open));
    abcBtn.classList.toggle("is-on", open);
    document.body.classList.toggle("pl-board-open", open);
    // with the on-screen keyboard open the phone keyboard would cover it: keep the caret, hide the phone keyboard
    field.setAttribute("inputmode", open ? "none" : "text");
    if (open) {
      field.blur();
      board.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    } else field.focus({ preventScroll: true });
  }

  // Russian layout → Latin
  const note = h("p.pl-keys__note", { role: "status", hidden: true }, t("typeans.layout_fixed"));
  if (fixRussianLayout) {
    let fixing = false;
    field.addEventListener("input", () => {
      if (fixing || !hasCyrillic(field.value)) return;
      const fixed = fixLayout(field.value);
      if (fixed === field.value) return;
      const pos = field.selectionStart;
      field.value = fixed;
      if (typeof pos === "number") field.setSelectionRange?.(pos, pos);
      note.hidden = false;
      fixing = true;
      field.dispatchEvent(new Event("input", { bubbles: true }));
      fixing = false;
    });
  }

  const row = h("div.pl-keys", { role: "group", aria: { label: t("typeans.keys") } }, caseBtn, letterKeys, abcBtn);
  const wrap = h("div.pl-keys-wrap", row, board, note);
  wrap.setDisabled = (d) => {
    for (const b of wrap.querySelectorAll("button")) b.disabled = d;
    if (d && boardOpen) setBoard(false);
  };
  // leaving the exercise with the keyboard open must give the «Помощь» button back
  let attached = false;
  new MutationObserver((_, obs) => {
    if (wrap.isConnected) attached = true;
    else if (attached) {
      if (boardOpen) document.body.classList.remove("pl-board-open");
      obs.disconnect();
    }
  }).observe(document.body, { childList: true, subtree: true });
  return wrap;
}
