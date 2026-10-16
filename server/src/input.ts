// Очистка пользовательского ввода на границе сервера. Всё, что приходит из сети, — данные, а не команды:
// SQL — только через параметры, HTML — только через textContent, текст для модели — внутри тегов.
// Здесь убираем то, что невидимо глазу, но может обмануть человека или модель.

/**
 * Невидимые и управляющие символы: C0/C1 (кроме \n и \t), мягкий перенос, нулевой ширины, разделители строк,
 * переключатели направления текста (bidi — «перевёрнутые» строки), BOM, interlinear-аннотации,
 * Unicode-«теги» U+E0000–E007F (скрытый ASCII-текст для ИИ) и дополнительные селекторы вариантов
 * U+E0100–E01EF (тоже используются, чтобы прятать текст).
 */
const INVISIBLE = /[\u0000-\u0008\u000b-\u000c\u000e-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u2029\u202a-\u202e\u2060-\u206f\ufeff\ufff9-\ufffb\u{e0000}-\u{e007f}\u{e0100}-\u{e01ef}]/gu;

/** Текст из формы: NFC, переводы строк \n, без невидимых символов, без пробелов по краям. */
export function cleanText(s: string): string {
  return s.normalize("NFC").replace(/\r\n?/g, "\n").replace(INVISIBLE, "").trim();
}

/** Есть ли в строке невидимые или управляющие символы (для полей, где их быть не может: почта, токены). */
export function hasInvisible(s: string): boolean {
  INVISIBLE.lastIndex = 0;
  return INVISIBLE.test(s);
}

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** JSON.parse без ключей, которыми подменяют прототип объекта (prototype pollution). */
export function parseJsonSafe(text: string): unknown {
  return JSON.parse(text, (k, v) => (FORBIDDEN_KEYS.has(k) ? undefined : v));
}
