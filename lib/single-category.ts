const storageKey = "cnaanlist-single-open-category";
export const singleOpenCategoryEvent = "cnaanlist-single-open-category";

export function readSingleOpenCategory() {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(storageKey) !== "0";
  } catch {
    return true;
  }
}

export function writeSingleOpenCategory(enabled: boolean) {
  window.localStorage.setItem(storageKey, enabled ? "1" : "0");
  window.dispatchEvent(new Event(singleOpenCategoryEvent));
}
