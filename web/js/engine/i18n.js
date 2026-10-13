// Message lookup with {name} interpolation and plural forms. Pure: dictionaries are passed in.
// Plural entries are objects keyed by Intl.PluralRules categories: { one, few, many, other }.

export function createTranslator(dict, lang, fallback = null) {
  const rules = typeof Intl !== "undefined" && Intl.PluralRules ? new Intl.PluralRules(lang) : null;
  const get = (key) => {
    const v = key.split(".").reduce((o, k) => (o == null ? undefined : o[k]), dict);
    if (v !== undefined) return v;
    return fallback ? key.split(".").reduce((o, k) => (o == null ? undefined : o[k]), fallback) : undefined;
  };
  return function t(key, params = {}) {
    let v = get(key);
    if (v && typeof v === "object" && "other" in v) {
      const cat = rules && Number.isFinite(params.count) ? rules.select(params.count) : "other";
      v = v[cat] ?? v.other;
    }
    if (typeof v !== "string") return key;
    return v.replace(/\{(\w+)\}/g, (m, name) => (params[name] != null ? String(params[name]) : m));
  };
}

/** Flattened key list (for tests: all locales share the same keys). */
export function flatKeys(obj, prefix = "") {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !("other" in v)) out.push(...flatKeys(v, key));
    else out.push(key);
  }
  return out.sort();
}
