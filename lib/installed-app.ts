export function isInstalledApp() {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

function isIos() {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

export function closeInstalledApp() {
  // Browsers only honor close() for a window a script opened, or a session
  // whose history has a single entry. This runs inside the menu click.
  window.close();
  if (window.history.length <= 1) {
    window.history.back();
    return;
  }
  if (isIos()) return;
  // Android and desktop installs still block close() while older history
  // entries exist. Opening this window onto itself clears that block.
  const opened = window.open("", "_self");
  opened?.close();
}
