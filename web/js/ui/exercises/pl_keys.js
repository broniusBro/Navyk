// Row of Polish letters (ą ć ę ł ń ó ś ź ż) that types into a text field at the caret.
// Shift (or the case toggle) gives capitals. The field keeps focus so the phone keyboard stays open.

import { h } from "../dom.js";
import { t } from "../i18n.js";
import { PL_LETTERS } from "../../engine/polish.js";

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

/** plKeys(field) -> div.pl-keys */
export function plKeys(field) {
  let upper = false;
  const keys = PL_LETTERS.map((ch) => {
    const b = h("button.pl-key", { type: "button", lang: "pl", aria: { label: t("typeans.insert", { letter: ch }) } }, ch);
    // mousedown/pointerdown default would blur the field and hide the phone keyboard
    b.addEventListener("pointerdown", (e) => e.preventDefault());
    b.addEventListener("mousedown", (e) => e.preventDefault());
    b.addEventListener("click", (e) => {
      if (field.disabled || field.readOnly) return;
      const letter = upper || e.shiftKey ? ch.toLocaleUpperCase("pl") : ch;
      insertAtCaret(field, letter);
      field.focus({ preventScroll: true });
      if (upper) toggleCase(false);
    });
    return b;
  });
  const caseBtn = h("button.pl-key.pl-key--case", { type: "button", aria: { label: t("typeans.capital"), pressed: "false" } }, "⇧");
  caseBtn.addEventListener("pointerdown", (e) => e.preventDefault());
  caseBtn.addEventListener("mousedown", (e) => e.preventDefault());
  function toggleCase(on = !upper) {
    upper = on;
    caseBtn.setAttribute("aria-pressed", String(upper));
    keys.forEach((b, i) => (b.textContent = upper ? PL_LETTERS[i].toLocaleUpperCase("pl") : PL_LETTERS[i]));
  }
  caseBtn.addEventListener("click", () => toggleCase());
  const row = h("div.pl-keys", { role: "group", aria: { label: t("typeans.keys") } }, caseBtn, keys);
  row.setDisabled = (d) => [caseBtn, ...keys].forEach((b) => (b.disabled = d));
  return row;
}
