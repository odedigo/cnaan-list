"use client";

/** Registers the worker Android needs before this app can appear in the share sheet. */

import { useEffect } from "react";

export function ShareWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
  }, []);
  return null;
}
