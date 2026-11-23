import { isInstalledApp } from "@/lib/installed-app";

const touchQuery = "(hover: none) and (pointer: coarse)";

/** Turns a phone sideways for the tree, and upright again for the list. A desktop is left alone. */
export function lockScreenOrientation(mode: "landscape" | "portrait") {
  if (typeof window === "undefined") return;
  if (!window.matchMedia(touchQuery).matches) return;
  const orientation = window.screen?.orientation;
  if (!orientation || typeof orientation.lock !== "function") return;

  if (mode === "portrait") {
    void orientation.lock("portrait").catch(() => undefined);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    return;
  }

  if (isInstalledApp()) {
    void orientation.lock("landscape").catch(() => undefined);
    return;
  }

  const enter = document.fullscreenElement ? Promise.resolve() : document.documentElement.requestFullscreen();
  void enter.then(() => orientation.lock("landscape")).catch(() => undefined);
}
