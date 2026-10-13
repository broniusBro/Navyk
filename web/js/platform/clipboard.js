// Clipboard and share wrappers. Expo: expo-clipboard and Share API.

export async function copyText(text) {
  try {
    if (globalThis.navigator?.clipboard?.writeText) {
      await globalThis.navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

export async function shareText({ title, text, url }) {
  try {
    if (globalThis.navigator?.share) {
      await globalThis.navigator.share({ title, text, url });
      return true;
    }
  } catch {
    return false;
  }
  return copyText([text, url].filter(Boolean).join(" "));
}

export const canShare = () => Boolean(globalThis.navigator?.share);
