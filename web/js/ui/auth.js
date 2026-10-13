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

function field({ label, type = "text", autocomplete, value = "", hint = null, inputmode }) {
  const id = nextId("f");
  const errId = `${id}-err`;
  const hintId = hint ? `${id}-hint` : null;
  const input = h("input.field__input", { id, name: id, type, autocomplete, inputmode, value, spellcheck: "false", autocapitalize: "off", aria: { describedby: [hintId, errId].filter(Boolean).join(" ") } });
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

// ---- screens --------------------------------------------------------------------------------

export function renderLogin({ go }) {
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
  return authScreen({
    title: t("auth.login_title"),
    lead: t("auth.login_lead"),
    body: f.el,
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
  const consent = h("div.consent", h("p", icon("shield"), h("span", t("auth.consent_before"), " ", toggle)), privacy);
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
    body: f.el,
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
