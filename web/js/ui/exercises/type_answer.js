// type_answer: write the Polish phrase. Case, spaces and punctuation are ignored; an answer without
// Polish letters (dziekuje) counts, with a note about diacritics.

import { h, icon } from "../dom.js";
import { t } from "../i18n.js";
import { audioButton } from "../audio.js";
import { mountAutoExercise, whyNote } from "./frame.js";
import { plKeys } from "./pl_keys.js";

export const MAX_TYPE_CHARS = 300;

/** A Polish text field with the letter row; shared by type_answer and translate. */
export function plField(id, { rows = 2, placeholder = "", label } = {}) {
  const input = h("textarea.type-ans__input", {
    id,
    rows,
    maxlength: MAX_TYPE_CHARS,
    lang: "pl",
    placeholder,
    autocapitalize: "sentences",
    autocomplete: "off",
    autocorrect: "off",
    spellcheck: "false",
    aria: { label: label ?? t("typeans.input_label") },
  });
  const keys = plKeys(input);
  return { input, keys };
}

export function renderTypeAnswer(ex, ctx) {
  const { input, keys } = plField(`ta-${ex.id}`, { placeholder: t("typeans.placeholder") });
  const res = h("div.type-ans__result", { aria: { live: "polite" } });
  let onChange = () => {};
  let submitFn = null;
  input.addEventListener("input", () => onChange());
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      submitFn?.();
    }
  });

  const el = h("div.type-ans", ex.prompt ? h("p.type-ans__prompt", ex.prompt) : null, input, keys, res);

  return mountAutoExercise(ex, ctx, {
    el,
    answer: () => input.value,
    onChange: (cb) => (onChange = cb),
    submit: (fn) => (submitFn = fn),
    reset() {
      input.readOnly = false;
      keys.setDisabled(false);
      el.classList.remove("is-ok", "is-bad");
      res.replaceChildren();
      input.focus();
      onChange();
    },
    showResult(r, { reveal }) {
      input.readOnly = true;
      keys.setDisabled(true);
      el.classList.add(r.correct ? "is-ok" : "is-bad");
      const parts = [];
      if (r.correct && r.diacriticsOnly) parts.push(whyNote(t("typeans.diacritics_note"), "info", t("typeans.diacritics_lead")));
      if (r.correct || reveal) {
        parts.push(
          h(
            "p.type-ans__expected",
            icon(r.correct ? "check" : "cross"),
            h("span.type-ans__expected-label", t(r.correct && r.exact ? "typeans.exact" : "typeans.expected")),
            " ",
            h("strong", { lang: "pl" }, r.expected),
            audioButton(r.expected),
          ),
        );
        parts.push(whyNote(ex.why, r.correct ? "ok" : "info"));
      }
      res.replaceChildren(...parts);
    },
  });
}
