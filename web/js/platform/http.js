// HTTP wrapper over fetch. Returns { status, body } and never throws (status 0 = network error).
// Only our own backend is called; no API keys live in the client.

const DEFAULT_TIMEOUT = 20000;

export async function request(path, { method = "GET", json, timeout = DEFAULT_TIMEOUT } = {}) {
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeout) : null;
  try {
    const res = await fetch(path, {
      method,
      headers: json ? { "Content-Type": "application/json", Accept: "application/json" } : { Accept: "application/json" },
      body: json ? JSON.stringify(json) : undefined,
      signal: ctrl?.signal,
      credentials: "same-origin",
    });
    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { status: res.status, body };
  } catch {
    return { status: 0, body: null };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function getJson(path, opts) {
  return request(path, { ...opts, method: "GET" });
}

export async function postJson(path, json, opts) {
  return request(path, { ...opts, method: "POST", json });
}

/** Fetch a static file (i18n dictionaries) relative to the app root. */
export async function getStatic(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
