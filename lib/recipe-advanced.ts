const storageKey = "cnaanlist-recipe-advanced";
export const recipeAdvancedEvent = "cnaanlist-recipe-advanced";

export function readRecipeAdvanced() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(storageKey) === "1";
  } catch {
    return false;
  }
}

export function writeRecipeAdvanced(enabled: boolean) {
  window.localStorage.setItem(storageKey, enabled ? "1" : "0");
  window.dispatchEvent(new Event(recipeAdvancedEvent));
}
