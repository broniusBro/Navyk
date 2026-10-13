// Bottom sheet on <dialog>: modal focus trap, Escape and the backdrop close it, focus returns to the
// opener. Slides up with the Web Animations API (skipped under reduced motion).

import { h, icon } from "./dom.js";
import { t } from "./i18n.js";
import { reduced } from "./motion.js";

let open = null;

export function closeSheet() {
  open?.close();
}

/**
 * openSheet({ title, body: Node[], labelledBy? }) -> { close }
 * The title becomes the dialog's accessible name.
 */
export function openSheet({ title, body, className = "" }) {
  open?.close();
  const opener = document.activeElement;
  const id = `sheet-${Math.random().toString(36).slice(2, 7)}`;
  const closeBtn = h("button.icon-btn.sheet__close", { type: "button", aria: { label: t("common.close") } }, icon("close"));
  const panel = h("div.sheet__panel", h("span.sheet__grip", { aria: { hidden: "true" } }), closeBtn, h("h2.sheet__title", { id, tabindex: "-1" }, title), body);
  const dlg = h(`dialog.sheet${className ? `.${className}` : ""}`, { aria: { labelledby: id } }, panel);
  let closing = false;

  function close() {
    if (closing || !dlg.open) return;
    closing = true;
    const finish = () => {
      dlg.close();
      dlg.remove();
      if (open === api) open = null;
      if (opener && opener.isConnected) opener.focus?.({ preventScroll: true });
    };
    if (reduced() || typeof panel.animate !== "function") return finish();
    panel.animate([{ transform: "none" }, { transform: "translateY(100%)" }], { duration: 180, easing: "ease-in", fill: "forwards" });
    dlg.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: "forwards" }).finished.then(finish, finish);
  }

  closeBtn.addEventListener("click", close);
  dlg.addEventListener("cancel", (e) => {
    e.preventDefault();
    close();
  });
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg) close(); // backdrop
  });
  document.body.append(dlg);
  dlg.showModal();
  panel.querySelector("[data-autofocus]")?.focus() ?? panel.querySelector(".sheet__title").focus();
  if (!reduced() && typeof panel.animate === "function") {
    panel.animate([{ transform: "translateY(100%)" }, { transform: "none" }], { duration: 280, easing: "cubic-bezier(0.2, 0.9, 0.3, 1)" });
  }
  const api = { close, el: dlg };
  open = api;
  return api;
}
