// Phone keyboard awareness. Web: a text field has focus on a touch device (+ visualViewport, when present,
// to know how much of the screen the keyboard takes). Sets on <html>:
//   .kb-open           — the phone keyboard is (probably) open: the floating «Помощь» steps aside
//   --kb-inset (px)    — height hidden by the keyboard (iOS Safari keeps the layout viewport, so fixed/sticky
//                        elements would sit under the keyboard otherwise); 0 on Android (resizes the page)
// and keeps the focused field visible above the sticky lesson bar.
// Mobile app: replace with the native keyboard events (same class and variable).

const TEXT = "textarea, input:not([type]), input[type=text], input[type=email], input[type=password], input[type=search], [contenteditable=true]";

let started = false;

export function initKeyboardWatch() {
  if (started || typeof document === "undefined") return;
  started = true;
  const root = document.documentElement;
  const coarse = globalThis.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const vv = globalThis.visualViewport ?? null;
  let blurTimer = 0;

  const isField = (el) => Boolean(el?.matches?.(TEXT)) && !el.readOnly && !el.disabled;

  function inset() {
    if (!vv) return 0;
    const hidden = globalThis.innerHeight - vv.height - vv.offsetTop;
    return hidden > 80 ? Math.round(hidden) : 0; // ignore toolbars and the zoom wobble
  }

  function keepVisible(el) {
    if (!el?.isConnected) return;
    const bar = document.querySelector(".lesson__bar");
    const viewBottom = vv ? vv.height + vv.offsetTop : globalThis.innerHeight;
    const limit = viewBottom - (bar && !el.closest(".chat__input") ? bar.getBoundingClientRect().height : 0) - 8;
    // the Polish letter row right under a lesson field must stay reachable too
    const keys = el.closest(".type-ans")?.querySelector(".pl-keys");
    const r = el.getBoundingClientRect();
    const bottom = Math.max(r.bottom, keys?.getBoundingClientRect().bottom ?? 0);
    if (bottom > limit) globalThis.scrollBy?.({ top: Math.min(bottom - limit, Math.max(0, r.top - 72)), behavior: "auto" });
  }

  function update() {
    const el = document.activeElement;
    const open = isField(el) && (coarse || inset() > 0);
    root.classList.toggle("kb-open", open);
    root.style.setProperty("--kb-inset", `${open ? inset() : 0}px`);
    if (open) keepVisible(el);
  }

  document.addEventListener("focusin", (e) => {
    clearTimeout(blurTimer);
    if (isField(e.target)) {
      update();
      // the keyboard animates in: measure again once it is up
      setTimeout(update, 350);
    }
  });
  document.addEventListener("focusout", () => {
    clearTimeout(blurTimer);
    // tapping a key on the Polish letter row keeps focus in the field; wait a tick before deciding
    blurTimer = setTimeout(update, 120);
  });
  vv?.addEventListener("resize", update);
  vv?.addEventListener("scroll", () => root.classList.contains("kb-open") && root.style.setProperty("--kb-inset", `${inset()}px`));
  globalThis.addEventListener?.("resize", update);
}
