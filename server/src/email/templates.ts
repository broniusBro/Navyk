// Письма Navyk на ru/uk/en/pl: подтверждение адреса, сброс пароля, «аккаунт уже есть».
// Стиль D: бумага #FFFDF8, чернила #22223B, оранжевая кнопка #FFB020 с тёмным текстом. Только инлайн-стили.
export type EmailLang = "ru" | "uk" | "en" | "pl";
export type EmailKind = "confirm" | "reset" | "already_registered";

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

interface Copy {
  subject: string;
  title: string;
  body: string;
  button: string;
  note: string;
}

const COPY: Record<EmailLang, Record<EmailKind, Copy> & { footer: string; fallback: string; ignore: string }> = {
  ru: {
    confirm: {
      subject: "Подтверди адрес в Navyk",
      title: "Привет! Остался один шаг",
      body: "Нажми кнопку, чтобы подтвердить адрес и сохранить прогресс в аккаунте.",
      button: "Подтвердить адрес",
      note: "Ссылка действует 24 часа.",
    },
    reset: {
      subject: "Новый пароль для Navyk",
      title: "Сбросим пароль",
      body: "Кто-то (надеемся, ты) попросил сменить пароль. Нажми кнопку и придумай новый.",
      button: "Задать новый пароль",
      note: "Ссылка действует 1 час. После смены пароля мы выйдем из аккаунта на других устройствах.",
    },
    already_registered: {
      subject: "У тебя уже есть аккаунт в Navyk",
      title: "Аккаунт уже есть",
      body: "Кто-то пытался зарегистрироваться с этим адресом, но аккаунт уже создан. Если забыл пароль — задай новый.",
      button: "Задать новый пароль",
      note: "Ссылка действует 1 час. Если это был не ты, просто ничего не делай — аккаунт в порядке.",
    },
    footer: "Navyk — независимый курс, не связан с Anthropic.",
    fallback: "Если кнопка не работает, открой ссылку:",
    ignore: "Если ты не запрашивал это письмо, просто удали его.",
  },
  uk: {
    confirm: {
      subject: "Підтверди адресу в Navyk",
      title: "Привіт! Лишився один крок",
      body: "Натисни кнопку, щоб підтвердити адресу й зберігати прогрес в акаунті.",
      button: "Підтвердити адресу",
      note: "Посилання діє 24 години.",
    },
    reset: {
      subject: "Новий пароль для Navyk",
      title: "Скинемо пароль",
      body: "Хтось (сподіваємося, ти) попросив змінити пароль. Натисни кнопку й придумай новий.",
      button: "Задати новий пароль",
      note: "Посилання діє 1 годину. Після зміни пароля ми вийдемо з акаунта на інших пристроях.",
    },
    already_registered: {
      subject: "У тебе вже є акаунт у Navyk",
      title: "Акаунт уже є",
      body: "Хтось намагався зареєструватися з цією адресою, але акаунт уже створено. Якщо забув пароль — задай новий.",
      button: "Задати новий пароль",
      note: "Посилання діє 1 годину. Якщо це був не ти, нічого не роби — з акаунтом усе гаразд.",
    },
    footer: "Navyk — незалежний курс, не пов'язаний з Anthropic.",
    fallback: "Якщо кнопка не працює, відкрий посилання:",
    ignore: "Якщо ти не запитував цей лист, просто видали його.",
  },
  en: {
    confirm: {
      subject: "Confirm your email for Navyk",
      title: "Hi! Just one more step",
      body: "Tap the button to confirm your email and keep your progress in your account.",
      button: "Confirm email",
      note: "The link works for 24 hours.",
    },
    reset: {
      subject: "Your new Navyk password",
      title: "Let's reset your password",
      body: "Someone (hopefully you) asked to change your password. Tap the button to choose a new one.",
      button: "Set a new password",
      note: "The link works for 1 hour. After the change we'll sign you out on other devices.",
    },
    already_registered: {
      subject: "You already have a Navyk account",
      title: "You already have an account",
      body: "Someone tried to sign up with this email, but the account already exists. Forgot your password? Set a new one.",
      button: "Set a new password",
      note: "The link works for 1 hour. If this wasn't you, do nothing — your account is fine.",
    },
    footer: "Navyk is an independent course, not affiliated with Anthropic.",
    fallback: "If the button doesn't work, open this link:",
    ignore: "If you didn't ask for this email, just delete it.",
  },
  pl: {
    confirm: {
      subject: "Potwierdź adres e-mail w Navyk",
      title: "Cześć! Został jeszcze jeden krok",
      body: "Kliknij przycisk, żeby potwierdzić adres e-mail i zapisywać postępy na swoim koncie.",
      button: "Potwierdź e-mail",
      note: "Link jest ważny przez 24 godziny.",
    },
    reset: {
      subject: "Nowe hasło do Navyk",
      title: "Ustawmy nowe hasło",
      body: "Ktoś (mamy nadzieję, że ty) poprosił o zmianę hasła. Kliknij przycisk i wybierz nowe.",
      button: "Ustaw nowe hasło",
      note: "Link jest ważny przez 1 godzinę. Po zmianie hasła wylogujemy cię na innych urządzeniach.",
    },
    already_registered: {
      subject: "Masz już konto w Navyk",
      title: "Konto już istnieje",
      body: "Ktoś próbował zarejestrować się z tym adresem, ale konto już istnieje. Nie pamiętasz hasła? Ustaw nowe.",
      button: "Ustaw nowe hasło",
      note: "Link jest ważny przez 1 godzinę. Jeśli to nie ty, nic nie rób — z kontem wszystko w porządku.",
    },
    footer: "Navyk to niezależny kurs, niezwiązany z Anthropic.",
    fallback: "Jeśli przycisk nie działa, otwórz ten link:",
    ignore: "Jeśli nie prosiłeś(-aś) o tę wiadomość, po prostu ją usuń.",
  },
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function renderEmail(kind: EmailKind, lang: EmailLang, link: string): RenderedEmail {
  const L = COPY[lang] ?? COPY.en;
  const c = L[kind];
  const text = [c.title, "", c.body, "", `${c.button}: ${link}`, "", c.note, L.ignore, "", "—", L.footer, ""].join("\n");
  const html = `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(c.subject)}</title></head>
<body style="margin:0;padding:0;background:#FFFDF8;color:#22223B;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFFDF8;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#FFFDF8;border:2px solid #22223B;border-radius:16px;">
<tr><td style="padding:28px 28px 8px 28px;font-size:22px;font-weight:800;letter-spacing:-0.5px;color:#22223B;">Navyk</td></tr>
<tr><td style="padding:8px 28px 0 28px;font-size:20px;font-weight:700;line-height:1.3;color:#22223B;">${esc(c.title)}</td></tr>
<tr><td style="padding:12px 28px 0 28px;font-size:16px;line-height:1.5;color:#22223B;">${esc(c.body)}</td></tr>
<tr><td style="padding:24px 28px;"><a href="${esc(link)}" style="display:inline-block;background:#FFB020;color:#22223B;font-size:16px;font-weight:700;text-decoration:none;padding:14px 24px;border:2px solid #22223B;border-radius:12px;">${esc(c.button)}</a></td></tr>
<tr><td style="padding:0 28px;font-size:14px;line-height:1.5;color:#22223B;">${esc(c.note)}</td></tr>
<tr><td style="padding:16px 28px 0 28px;font-size:13px;line-height:1.5;color:#4A4A68;">${esc(L.fallback)}<br><a href="${esc(link)}" style="color:#22223B;word-break:break-all;">${esc(link)}</a></td></tr>
<tr><td style="padding:16px 28px 28px 28px;font-size:13px;line-height:1.5;color:#4A4A68;">${esc(L.ignore)}</td></tr>
</table>
<p style="max-width:480px;margin:16px auto 0 auto;font-size:12px;line-height:1.5;color:#4A4A68;">${esc(L.footer)}</p>
</td></tr></table>
</body></html>`;
  return { subject: c.subject, text, html };
}
