// Key-value storage wrapper. Web: localStorage. Expo: swap for AsyncStorage with the same API
// (make the functions async there; callers already treat them as fire-and-forget).

const PREFIX = "navyk:";
const memory = new Map(); // fallback when localStorage is blocked (private mode, quota)

function ls() {
  try {
    const s = globalThis.localStorage;
    if (!s) return null;
    const probe = `${PREFIX}__probe`;
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

const store = ls();

export function getItem(key, fallback = null) {
  try {
    const raw = store ? store.getItem(PREFIX + key) : memory.get(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function setItem(key, value) {
  const raw = JSON.stringify(value);
  try {
    if (store) store.setItem(PREFIX + key, raw);
    else memory.set(key, raw);
    return true;
  } catch {
    memory.set(key, raw);
    return false;
  }
}

export function removeItem(key) {
  try {
    if (store) store.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
  memory.delete(key);
}

export const isPersistent = () => Boolean(store);
