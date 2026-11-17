const storageKey = "cnaanlist-packing-single-open-category";
export const packingSingleOpenEvent = "cnaanlist-packing-single-open-category";

export function readPackingSingleOpen() {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(storageKey) !== "0";
  } catch {
    return true;
  }
}

export function writePackingSingleOpen(enabled: boolean) {
  window.localStorage.setItem(storageKey, enabled ? "1" : "0");
  window.dispatchEvent(new Event(packingSingleOpenEvent));
}
