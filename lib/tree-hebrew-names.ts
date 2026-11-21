const storageKey = "cnaanlist-tree-hebrew-names";
export const treeHebrewNamesEvent = "cnaanlist-tree-hebrew-names";

export function readTreeHebrewNames() {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(storageKey) !== "0";
  } catch {
    return true;
  }
}

export function writeTreeHebrewNames(enabled: boolean) {
  window.localStorage.setItem(storageKey, enabled ? "1" : "0");
  window.dispatchEvent(new Event(treeHebrewNamesEvent));
}
