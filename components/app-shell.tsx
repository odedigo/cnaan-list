"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { usePathname } from "next/navigation";

import { AppPathContext } from "@/components/app-path";
import { AppHeader } from "@/components/app-header";
import { BottomNav } from "@/components/bottom-nav";
import { ListPage } from "@/components/list-page";
import { useLists } from "@/components/lists-provider";
import { SignedInSettings } from "@/components/settings-panel";

export function AppShell({
  signedIn,
  version,
  children,
}: {
  signedIn: boolean;
  version: string;
  children: ReactNode;
}) {
  const nextPath = usePathname();
  const [path, setPath] = useState(nextPath);
  const pathRef = useRef(path);
  const scrolls = useRef<Record<string, number>>({});
  const restoreRef = useRef<string | null>(null);
  const nativePushState = useRef<History["pushState"] | null>(null);
  const [warm, setWarm] = useState(false);

  useLayoutEffect(() => {
    // Keep the browser's own pushState. Next.js patches it and would refetch these pages from the server.
    nativePushState.current = window.history.pushState.bind(window.history);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setWarm(true), 250);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const onPop = () => {
      const next = window.location.pathname;
      if (next === "/grocery" || next === "/inventory") restoreRef.current = next;
      pathRef.current = next;
      setPath(next);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const go = useCallback((href: string) => {
    const current = pathRef.current;
    if (current === href) return;
    scrolls.current[current] = window.scrollY;
    pathRef.current = href;
    if (href === "/grocery" || href === "/inventory") restoreRef.current = href;
    if (window.location.pathname !== href) {
      const push = nativePushState.current ?? window.history.pushState.bind(window.history);
      push(null, "", href);
    }
    setPath(href);
    if (href === "/settings") window.scrollTo(0, 0);
  }, []);

  const body = signedIn ? (
    <>
      <LazyList mode="grocery" active={path === "/grocery"} warm={warm} scrolls={scrolls} restoreRef={restoreRef} />
      <LazyList mode="inventory" active={path === "/inventory"} warm={warm} scrolls={scrolls} restoreRef={restoreRef} />
      {path === "/settings" ? <SignedInSettingsView version={version} /> : null}
    </>
  ) : (
    children
  );

  return (
    <AppPathContext.Provider value={{ path, go }}>
      <div className="pb-24">{body}</div>
      <BottomNav signedIn={signedIn} />
    </AppPathContext.Provider>
  );
}

function SignedInSettingsView({ version }: { version: string }) {
  const lists = useLists();
  return (
    <>
      <AppHeader title="הגדרות" actionsEnabled={false} />
      <SignedInSettings username={lists.username} version={version} />
    </>
  );
}

function LazyList({
  mode,
  active,
  warm,
  scrolls,
  restoreRef,
}: {
  mode: "grocery" | "inventory";
  active: boolean;
  warm: boolean;
  scrolls: RefObject<Record<string, number>>;
  restoreRef: RefObject<string | null>;
}) {
  const [mounted, setMounted] = useState(active);

  useEffect(() => {
    if (active || warm) setMounted(true);
  }, [active, warm]);

  useLayoutEffect(() => {
    if (!active || restoreRef.current !== mode) return;
    restoreRef.current = null;
    window.scrollTo(0, scrolls.current?.[mode] ?? 0);
  }, [active, mode, restoreRef, scrolls]);

  if (!mounted) return null;
  return (
    <div hidden={!active}>
      <ListPage mode={mode} />
    </div>
  );
}
