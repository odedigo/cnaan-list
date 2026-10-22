const storageKey = "cnaanlist-keep-awake";
const changeEvent = "cnaanlist-keep-awake";

export function readKeepAwake() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(storageKey) === "1";
  } catch {
    return false;
  }
}

export function writeKeepAwake(enabled: boolean) {
  window.localStorage.setItem(storageKey, enabled ? "1" : "0");
  window.dispatchEvent(new Event(changeEvent));
}

export function bindKeepAwake() {
  let sentinel: WakeLockSentinel | null = null;
  let stopped = false;

  const apply = async () => {
    if (stopped) return;
    const enabled = readKeepAwake() && document.visibilityState === "visible";
    if (!enabled) {
      const current = sentinel;
      sentinel = null;
      await current?.release().catch(() => undefined);
      return;
    }
    if (sentinel && !sentinel.released) return;
    if (!("wakeLock" in navigator)) return;
    try {
      const next = await navigator.wakeLock.request("screen");
      sentinel = next;
      next.addEventListener("release", () => {
        if (sentinel === next) sentinel = null;
        if (!stopped && readKeepAwake() && document.visibilityState === "visible") void apply();
      });
    } catch {
      sentinel = null;
    }
  };

  const onChange = () => {
    void apply();
  };
  void apply();
  window.addEventListener(changeEvent, onChange);
  document.addEventListener("visibilitychange", onChange);
  return () => {
    stopped = true;
    window.removeEventListener(changeEvent, onChange);
    document.removeEventListener("visibilitychange", onChange);
    const current = sentinel;
    sentinel = null;
    void current?.release().catch(() => undefined);
  };
}
