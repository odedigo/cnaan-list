"use client";

/** On a touch device held sideways, asks for portrait. The tree chart and the calendar stay open. */

import { useEffect, useState } from "react";

const landscapeQuery = "(orientation: landscape) and (hover: none) and (pointer: coarse)";

export function LandscapeLock() {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(landscapeQuery);
    const update = () => {
      const path = window.location.pathname;
      const calendar = path === "/calendar" || path.startsWith("/calendar/");
      const chart = document.documentElement.dataset.allowLandscape === "1";
      setBlocked(media.matches && !calendar && !chart);
    };
    update();
    const { pushState, replaceState } = history;
    history.pushState = function (...args) {
      const result = pushState.apply(this, args);
      update();
      return result;
    };
    history.replaceState = function (...args) {
      const result = replaceState.apply(this, args);
      update();
      return result;
    };
    media.addEventListener("change", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    window.addEventListener("popstate", update);
    window.addEventListener("cnaan-navigate", update);
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-allow-landscape"] });
    return () => {
      history.pushState = pushState;
      history.replaceState = replaceState;
      media.removeEventListener("change", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      window.removeEventListener("popstate", update);
      window.removeEventListener("cnaan-navigate", update);
      observer.disconnect();
    };
  }, []);

  if (!blocked) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[var(--cream)] px-8 text-center">
      <p className="text-lg font-medium text-neutral-800">סובבו את המסך לאורך</p>
    </div>
  );
}
