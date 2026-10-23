const storageKey = "cnaanlist-show-store-badge";
export const showStoreBadgeEvent = "cnaanlist-show-store-badge";

export function readShowStoreBadge() {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(storageKey) !== "0";
  } catch {
    return true;
  }
}

export function writeShowStoreBadge(enabled: boolean) {
  window.localStorage.setItem(storageKey, enabled ? "1" : "0");
  window.dispatchEvent(new Event(showStoreBadgeEvent));
}
