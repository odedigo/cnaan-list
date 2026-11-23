"use client";

/** On a touch device held sideways, asks for portrait. The tree chart and the calendar stay open. */

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const landscapeQuery = "(orientation: landscape) and (hover: none) and (pointer: coarse)";

export function LandscapeLock() {
  const pathname = usePathname();
  const [path, setPath] = useState(pathname);
  const [seen, setSeen] = useState(pathname);
  const [landscape, setLandscape] = useState(false);
  const [chart, setChart] = useState(false);

  if (pathname !== seen) {
    setSeen(pathname);
    setPath(pathname);
  }

  useEffect(() => {
    const sync = () => setPath(window.location.pathname);
    window.addEventListener("popstate", sync);
    window.addEventListener("cnaan-navigate", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("cnaan-navigate", sync);
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia(landscapeQuery);
    const update = () => setLandscape(media.matches);
    update();
    media.addEventListener("change", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      media.removeEventListener("change", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  useEffect(() => {
    const update = () => setChart(document.documentElement.dataset.allowLandscape === "1");
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-allow-landscape"],
    });
    return () => observer.disconnect();
  }, []);

  const calendar = path === "/calendar" || path.startsWith("/calendar/");
  if (!(landscape && !calendar && !chart)) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[var(--cream)] px-8 text-center">
      <p className="text-lg font-medium text-neutral-800">סובבו את המסך לאורך</p>
    </div>
  );
}
