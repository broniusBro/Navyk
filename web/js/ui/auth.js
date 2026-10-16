// Account screens: login, register, "check your email", confirm link, forgot, reset link;
// the sign-up sheet for locked lessons and the account sheet from the header.

import { h, icon, focusFirst } from "./dom.js";
import { t, getLang } from "./i18n.js";
import { footer, wordmark } from "./chrome.js";
import { openSheet, closeSheet } from "./sheet.js";
import { burst } from "./motion.js";
import { validateCredentials, interpretAuth, retryMinutes, passwordLongEnough, MIN_PASSWORD } from "../engine/auth.js";
import * as api from "../platform/api.js";
import { currentUser, signedIn, signOut, pendingEmail, setPendingEmail, takeAfterAuth, setAfterAuth } from "./account.js";

let uid = 0;
const nextId = (p) => `${p}-${++uid}`;

// ---- form building blocks -------------------------------------------------------------------

// Server limits: email 254 characters (RFC 5321), password 128.
const MAX_LEN = { email: 254, password: 128, text: 200 };

function field({ label, type = "text", autocomplete, value = "", hint = null, inputmode }) {
  const id = nextId("f");
  const errId = `${id}-err`;
  const hintId = hint ? `${id}-hint` : null;
  const input = h("input.field__input", { id, name: id, type, autocomplete, inputmode, value, maxlength: MAX_LEN[type] ?? MAX_LEN.text, spellcheck: "false", autocapitalize: "off", aria: { describedby: [hintId, errId].filter(Boolean).join(" ") } });
  input.value = value;
  const err = h("p.field__error", { id: errId, hidden: true });
  const hintEl = hint ? h("p.field__hint", { id: hintId }, hint) : null;
  const wrap = h("div.field", h("label.field__label", { for: id }, label), h("div.field__control", input), hintEl, err);
  const api = {
    el: wrap,
    input,
    hintEl,
    get value() {
      return input.value;
    },
    error(code) {
      err.hidden = !code;
      err.replaceChildren(...(code ? [icon("cross", "icon field__error-icon"), h("span", t(`auth.error.${code}`))] : []));
      input.setAttribute("aria-invalid", code ? "true" : "false");
      wrap.classList.toggle("field--error", Boolean(code));
    },
  };
  input.addEventListener("input", () => api.error(null));
  return api;
}

function passwordField({ label, autocomplete, liveHint = false }) {
  const f = field({ label, type: "password", autocomplete, hint: liveHint ? t("auth.password_hint", { count: MIN_PASSWORD }) : null });
  const toggle = h("button.field__toggle", { type: "button", aria: { pressed: "false", label: t("auth.show_password") } }, icon("eye"));
  toggle.addEventListener("click", () => {
    const show = f.input.type === "password";
    f.input.type = show ? "text" : "password";
    toggle.setAttribute("aria-pressed", String(show));
    toggle.replaceChildren(icon(show ? "eyeOff" : "eye"));
  });
  f.input.parentElement.append(toggle);
  if (liveHint) {
    const update = () => {
      const ok = passwordLongEnough(f.input.value);
      f.hintEl.classList.toggle("is-ok", ok);
      f.hintEl.replaceChildren(icon(ok ? "check" : "key", "icon field__hint-icon"), h("span", t(ok ? "auth.password_hint_ok" : "auth.password_hint", { count: MIN_PASSWORD })));
    };
    f.input.addEventListener("input", update);
    update();
  }
  return f;
}

/** Form with a busy state; onSubmit returns a promise. CSP form-action 'none': we never let it navigate. */
function form(children, onSubmit, submitLabel) {
  const status = h("div.form__status", { role: "status", aria: { live: "polite" } });
  const submit = h("button.btn.btn--primary.btn--wide", { type: "submit" }, submitLabel);
  const el = h("form.form", { novalidate: true }, children, status, submit);
  let busy = false;
  el.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return;
    busy = true;
    submit.disabled = true;
    submit.setAttribute("aria-busy", "true");
    status.replaceChildren();
    try {
      await onSubmit({ status: setStatus });
    } finally {
      busy = false;
      submit.disabled = false;
      submit.removeAttribute("aria-busy");
    }
  });
  function setStatus(node) {
    status.replaceChildren(...(node ? [node] : []));
  }
  return { el, submit, setStatus };
}

const alertBox = (kind, title, ...body) => h(`div.alert.alert--${kind}`, title ? h("p.alert__title", title) : null, body);

function focusInvalid(fields) {
  fields.find((f) => f.input.getAttribute("aria-invalid") === "true")?.input.focus();
}

// ---- screen frame ---------------------------------------------------------------------------

function authScreen({ title, lead, art = "user", body, onBack, below }) {
  const back = h("button.icon-btn", { type: "button", aria: { label: t("auth.back") }, onclick: onBack }, icon("back"));
  const el = h(
    "div.screen.screen--auth",
    h("header.topbar.topbar--auth", back, wordmark()),
    h(
      "main.auth",
      { id: "main" },
      h("div.auth__art", { aria: { hidden: "true" } }, icon(art, "icon auth__art-icon")),
      h("h1.auth__title", { tabindex: "-1" }, title),
      lead ? h("p.auth__lead", lead) : null,
      body,
      below ? h("div.auth__below", below) : null,
    ),
    footer(),
  );
  queueMicrotask(() => focusFirst(el));
  return el;
}

const link = (key, hash) => h("a.auth__link", { href: hash }, t(key));

/** "Text {a} more {b}" → [text, nodeA, " more ", nodeB]: links inside a translated sentence, without HTML. */
function rich(template, parts) {
  return template.split(/\{(\w+)\}/).map((piece, i) => (i % 2 ? (parts[piece] ?? `{${piece}}`) : piece)).filter((x) => x !== "");
}

// Google "G" (multicolour), built with DOM APIs: HTML sinks are allowed only in dom.js.
const GOOGLE_PATHS = [
  ["#EA4335", "M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"],
  ["#4285F4", "M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"],
  ["#FBBC05", "M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"],
  ["#34A853", "M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"],
];
function googleLogo() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 48 48");
  svg.setAttribute("class", "google-btn__logo");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  for (const [fill, d] of GOOGLE_PATHS) {
    const path = document.createElementNS(ns, "path");
    path.setAttribute("fill", fill);
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}

let providers = null;
/** "Continue with Google" + "or" divider; appears only when the server has Google sign-in configured. */
function googleBlock() {
  const btn = h("a.btn.google-btn", { href: `/api/auth/google/start?lang=${encodeURIComponent(getLang())}` }, h("span.google-btn__icon", googleLogo()), h("span", t("auth.google")));
  const box = h("div.google-auth", { hidden: true }, btn, h("p.auth__or", h("span", t("auth.or"))));
  providers ??= api.authProviders().catch(() => null);
  providers.then((p) => {
    if (p?.body?.google) box.hidden = false;
  });
  return box;
}

// ---- screens --------------------------------------------------------------------------------

export function renderLogin({ go, query = "" }) {
  const email = field({ label: t("auth.email"), type: "email", autocomplete: "username", inputmode: "email", value: pendingEmail() });
  const password = passwordField({ label: t("auth.password"), autocomplete: "current-password" });
  const f = form(
    [email.el, password.el],
    async ({ status }) => {
      const errs = validateCredentials({ email: email.value, password: password.value }, { checkLength: false });
      email.error(errs.email);
      password.error(errs.password);
      if (errs.email || errs.password) return focusInvalid([email, password]);
      setPendingEmail(email.value);
      const r = interpretAuth(await api.authLogin({ email: email.value.trim(), password: password.value }));
      if (r.ok) {
        await signedIn(r.user);
        return go(takeAfterAuth());
      }
      if (r.code === "email_not_confirmed") {
        const resend = h("button.btn.btn--ghost.btn--small", { type: "button" }, t("auth.resend"));
        resend.addEventListener("click", async () => {
          resend.disabled = true;
          await api.authResend({ email: email.value.trim() });
          go("#/check-email");
        });
        return status(alertBox("warn", t("auth.not_confirmed_title"), h("p", t("auth.not_confirmed_text")), resend));
      }
      if (r.code === "locked") return status(alertBox("danger", null, h("p", t("auth.error.locked", { count: retryMinutes(r.retryAfter) }))));
      status(alertBox("danger", null, h("p", t(`auth.error.${r.code === "invalid_credentials" ? "invalid_credentials" : r.code === "network" ? "network" : "generic"}`))));
      if (r.code === "invalid_credentials") password.input.select();
    },
    t("auth.login_submit"),
  );
  const googleError = /(^|&)e=google(&|$)/.test(query)
    ? alertBox("danger", null, h("p", t("auth.google_error")))
    : null;
  return authScreen({
    title: t("auth.login_title"),
    lead: t("auth.login_lead"),
    body: h("div", googleError, googleBlock(), f.el),
    onBack: () => go("#/"),
    below: [link("auth.forgot_link", "#/forgot"), h("p.auth__switch", h("span", t("auth.no_account")), " ", link("auth.register_link", "#/register"))],
  });
}

export function renderRegister({ go }) {
  const email = field({ label: t("auth.email"), type: "email", autocomplete: "username", inputmode: "email", value: pendingEmail() });
  const password = passwordField({ label: t("auth.password"), autocomplete: "new-password", liveHint: true });
  const privacyId = nextId("privacy");
  const privacy = h("p.consent__text", { id: privacyId, hidden: true }, t("auth.privacy_text"));
  const toggle = h("button.consent__link", { type: "button", aria: { expanded: "false", controls: privacyId } }, t("auth.privacy_link"));
  toggle.addEventListener("click", () => {
    privacy.hidden = !privacy.hidden;
    toggle.setAttribute("aria-expanded", String(!privacy.hidden));
  });
  const docLink = (doc, key) => h("a.consent__doc", { href: `/${doc}?lang=${getLang()}`, target: "_blank", rel: "noopener" }, t(key));
  const accept = rich(t("auth.consent_accept"), { terms: docLink("terms", "auth.terms_link"), privacy: docLink("privacy", "auth.privacy_policy_link") });
  const consent = h("div.consent", h("p", icon("shield"), h("span", ...accept, " ", toggle)), privacy);
  const f = form(
    [email.el, password.el, consent],
    async ({ status }) => {
      const errs = validateCredentials({ email: email.value, password: password.value });
      email.error(errs.email);
      password.error(errs.password);
      if (errs.email || errs.password) return focusInvalid([email, password]);
      setPendingEmail(email.value);
      const r = interpretAuth(await api.authRegister({ email: email.value.trim(), password: password.value, lang: getLang() }), 202);
      if (r.ok) return go("#/check-email");
      if (r.field === "email") return email.error(r.code), email.input.focus();
      if (r.field === "password") return password.error(r.code), password.input.focus();
      status(alertBox("danger", null, h("p", t(r.code === "network" ? "auth.error.network" : "auth.error.generic"))));
    },
    t("auth.register_submit"),
  );
  return authScreen({
    title: t("auth.register_title"),
    lead: t("auth.register_lead"),
    art: "cloud",
    body: h("div", googleBlock(), f.el),
    onBack: () => go("#/"),
    below: h("p.auth__switch", h("span", t("auth.have_account")), " ", link("auth.login_link", "#/login")),
  });
}

/** Resend form (used on "check your email" and after an expired confirm link). */
function resendForm({ go, withEmailField }) {
  const email = withEmailField ? field({ label: t("auth.email"), type: "email", autocomplete: "username", inputmode: "email", value: pendingEmail() }) : null;
  const f = form(
    email ? [email.el] : [],
    async ({ status }) => {
      const addr = email ? email.value : pendingEmail();
      if (email) {
        const errs = validateCredentials({ email: addr });
        email.error(errs.email);
        if (errs.email) return email.input.focus();
        setPendingEmail(addr);
      }
      const r = interpretAuth(await api.authResend({ email: addr.trim() }), 202);
      if (r.ok) {
        if (email) return go("#/check-email");
        return status(alertBox("info", null, h("p", t("auth.resent"))));
      }
      status(alertBox("danger", null, h("p", t(r.code === "network" ? "auth.error.network" : "auth.error.generic"))));
    },
    t("auth.resend"),
  );
  f.submit.classList.remove("btn--primary");
  f.submit.classList.add("btn--ghost");
  return f.el;
}

export function renderCheckEmail({ go }) {
  const addr = pendingEmail();
  const lead = addr ? h("p.auth__lead", t("auth.check_lead_before"), " ", h("strong.auth__email", addr), t("auth.check_lead_after")) : h("p.auth__lead", t("auth.check_lead_generic"));
  const body = [
    lead,
    h("ol.auth__steps", h("li", t("auth.check_step_open")), h("li", t("auth.check_step_click")), h("li", t("auth.check_step_spam"))),
    addr ? resendForm({ go, withEmailField: false }) : resendForm({ go, withEmailField: true }),
  ];
  return authScreen({
    title: t("auth.check_title"),
    art: "mail",
    body,
    onBack: () => go("#/"),
    below: [h("p.auth__switch", h("span", t("auth.wrong_email")), " ", link("auth.register_again", "#/register")), link("auth.login_link_short", "#/login")],
  });
}

export function renderConfirm({ token, go }) {
  const body = h("div.auth__result", { role: "status" }, h("p.auth__lead", t("auth.confirming")));
  const el = authScreen({ title: t("auth.confirm_title"), art: "mail", body, onBack: () => go("#/") });
  (async () => {
    const r = interpretAuth(await api.authConfirm({ token }));
    if (!el.isConnected) return;
    const title = el.querySelector(".auth__title");
    if (r.ok) {
      await signedIn(r.user);
      title.textContent = t("auth.confirmed_title");
      el.querySelector(".auth__art").replaceChildren(icon("check", "icon auth__art-icon"));
      el.querySelector(".auth__art").classList.add("is-ok");
      const goOn = h("button.btn.btn--primary.btn--wide", { type: "button", onclick: () => go(takeAfterAuth()) }, t("auth.to_path"));
      body.replaceChildren(h("p.auth__lead", t("auth.confirmed_text")), goOn);
      burst(el.querySelector(".auth__art"));
      title.focus();
    } else if (r.code === "invalid_token") {
      title.textContent = t("auth.link_expired_title");
      body.replaceChildren(h("p.auth__lead", t("auth.link_expired_text")), resendForm({ go, withEmailField: true }));
      title.focus();
    } else {
      const retry = h("button.btn.btn--primary.btn--wide", { type: "button", onclick: () => go(`#/confirm/${token}`) }, t("auth.try_again"));
      body.replaceChildren(alertBox("danger", null, h("p", t(r.code === "network" ? "auth.error.network" : "auth.error.generic"))), retry);
    }
  })();
  return el;
}

export function renderForgot({ go }) {
  const email = field({ label: t("auth.email"), type: "email", autocomplete: "username", inputmode: "email", value: pendingEmail() });
  let f;
  f = form(
    [email.el],
    async ({ status }) => {
      const errs = validateCredentials({ email: email.value });
      email.error(errs.email);
      if (errs.email) return email.input.focus();
      setPendingEmail(email.value);
      const r = interpretAuth(await api.authForgot({ email: email.value.trim(), lang: getLang() }), 202);
      if (r.ok) {
        const done = alertBox("info", t("auth.forgot_sent_title"), h("p", t("auth.forgot_sent_text", { email: email.value.trim() })));
        f.el.replaceWith(done);
        done.setAttribute("tabindex", "-1");
        done.focus();
        return;
      }
      status(alertBox("danger", null, h("p", t(r.code === "network" ? "auth.error.network" : "auth.error.generic"))));
    },
    t("auth.forgot_submit"),
  );
  return authScreen({ title: t("auth.forgot_title"), lead: t("auth.forgot_lead"), art: "key", body: f.el, onBack: () => go("#/login"), below: link("auth.login_link_short", "#/login") });
}

export function renderReset({ token, go }) {
  const password = passwordField({ label: t("auth.new_password"), autocomplete: "new-password", liveHint: true });
  const confirm = passwordField({ label: t("auth.confirm_password"), autocomplete: "new-password" });
  const f = form(
    [password.el, confirm.el],
    async ({ status }) => {
      const errs = validateCredentials({ password: password.value, confirm: confirm.value }, { needEmail: false, checkConfirm: true });
      password.error(errs.password);
      confirm.error(errs.confirm);
      if (errs.password || errs.confirm) return focusInvalid([password, confirm]);
      const r = interpretAuth(await api.authReset({ token, password: password.value }));
      if (r.ok) {
        await signedIn(r.user);
        return go(takeAfterAuth());
      }
      if (r.code === "weak_password") return password.error(r.code), password.input.focus();
      if (r.code === "invalid_token") {
        return status(alertBox("danger", t("auth.link_expired_title"), h("p", t("auth.reset_expired_text")), h("a.btn.btn--ghost.btn--small", { href: "#/forgot" }, t("auth.forgot_again"))));
      }
      status(alertBox("danger", null, h("p", t(r.code === "network" ? "auth.error.network" : "auth.error.generic"))));
    },
    t("auth.reset_submit"),
  );
  return authScreen({ title: t("auth.reset_title"), lead: t("auth.reset_lead"), art: "key", body: f.el, onBack: () => go("#/") });
}

// ---- sheets ---------------------------------------------------------------------------------

/** Friendly gate for lessons outside the free preview. */
export function openSignupSheet({ go, lessonHash, lessonTitle }) {
  const reg = h("button.btn.btn--primary.btn--wide", { type: "button", data: { autofocus: "1" } }, t("auth.gate_register"));
  const login = h("button.btn.btn--ghost.btn--wide", { type: "button" }, t("auth.gate_login"));
  reg.addEventListener("click", () => {
    setAfterAuth(lessonHash);
    closeSheet();
    go("#/register");
  });
  login.addEventListener("click", () => {
    setAfterAuth(lessonHash);
    closeSheet();
    go("#/login");
  });
  openSheet({
    title: t("auth.gate_title"),
    className: "sheet--gate",
    body: [
      lessonTitle ? h("p.sheet__kicker", h("span.hl", lessonTitle)) : null,
      h("ul.perks", h("li", icon("check"), h("span", t("auth.gate_perk_course"))), h("li", icon("check"), h("span", t("auth.gate_perk_sync"))), h("li", icon("check"), h("span", t("auth.gate_perk_keep")))),
      h("div.sheet__actions", reg, login),
      h("p.sheet__note", t("auth.gate_note")),
    ],
  });
}

/** Account sheet from the header avatar. */
export function openAccountSheet({ go }) {
  const u = currentUser();
  if (!u) {
    setAfterAuth(null);
    return go("#/login");
  }
  const out = h("button.btn.btn--ghost.btn--wide", { type: "button" }, icon("logout"), h("span", t("auth.logout")));
  out.addEventListener("click", async () => {
    out.disabled = true;
    await signOut();
    closeSheet();
    go("#/");
  });
  openSheet({
    title: t("auth.account_title"),
    body: [
      h("div.account", h("span.avatar.avatar--big", { aria: { hidden: "true" } }, initial(u.email)), h("div.account__info", h("p.account__label", t("auth.signed_in_as")), h("p.account__email", u.email))),
      h("p.sheet__note", icon("cloud"), h("span", t("auth.synced_note"))),
      h("div.sheet__actions", out),
    ],
  });
}

export const initial = (email) => (String(email ?? "").trim()[0] ?? "?").toUpperCase();
