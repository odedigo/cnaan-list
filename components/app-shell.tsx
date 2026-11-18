"use client";

/** Signed-in layout that keeps the main pages mounted and switches them without a server refetch. */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { usePathname } from "next/navigation";

import { AppPathContext } from "@/components/app-path";
import { AppHeader } from "@/components/app-header";
import { BottomNav } from "@/components/bottom-nav";
import { DataTransfer } from "@/components/data-transfer";
import { CalendarPage } from "@/components/calendar-page";
import { ChecklistPage } from "@/components/checklist-page";
import { DatesPage } from "@/components/dates-page";
import { ListPage } from "@/components/list-page";
import { PackingPage } from "@/components/packing-page";
import { RecipesPage } from "@/components/recipes-page";
import { TreesPage } from "@/components/trees-page";
import { useBootError, useLists, useListsOptional } from "@/components/lists-provider";
import { firstSectionPath, sectionForPath } from "@/lib/account-sections";
import { pushAppHistory } from "@/lib/history";
import { bindKeepAwake } from "@/lib/keep-awake";
import { bindSavedSession } from "@/lib/saved-accounts";
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
  const [warm, setWarm] = useState(false);
  const lists = useListsOptional();
  const bootError = useBootError();

  useEffect(() => {
    const timer = window.setTimeout(() => setWarm(true), 250);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    return bindKeepAwake();
  }, [signedIn]);

  useEffect(() => {
    if (!signedIn || !lists?.username) return;
    return bindSavedSession(lists.username);
  }, [signedIn, lists?.username]);

  useEffect(() => {
    const onPop = () => {
      const next = window.location.pathname;
      if (next === "/grocery" || next === "/inventory" || next === "/lists" || next === "/recipes" || next === "/packing" || next === "/dates" || next === "/trees" || next === "/calendar") restoreRef.current = next;
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
    if (href === "/grocery" || href === "/inventory" || href === "/lists" || href === "/recipes" || href === "/packing" || href === "/dates" || href === "/trees" || href === "/calendar") restoreRef.current = href;
    if (window.location.pathname !== href) pushAppHistory(href);
    setPath(href);
    if (href === "/settings") window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (!signedIn || !lists) return;
    const section = sectionForPath(path);
    if (!section || lists.sections.includes(section)) return;
    go(firstSectionPath(lists.sections));
  }, [go, lists, path, signedIn]);

  useEffect(() => {
    if (!signedIn) return;
    let startX = 0;
    let startY = 0;
    let tracking = false;
    const onStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      const current = pathRef.current;
      if (current !== "/grocery" && current !== "/inventory") return;
      if (lists?.reorderMode) return;
      if (document.querySelector("[role='dialog'], [role='menu']")) return;
      const target = event.target;
      if (target instanceof Element && target.closest("input, textarea, select, nav")) return;
      tracking = true;
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
    };
    const onEnd = (event: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const touch = event.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      const current = pathRef.current;
      if (current === "/grocery" && dx > 0) go("/inventory");
      else if (current === "/inventory" && dx < 0) go("/grocery");
    };
    const stop = () => {
      tracking = false;
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", stop);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", stop);
    };
  }, [go, lists?.reorderMode, signedIn]);

  const body = !signedIn ? (
    children
  ) : !lists ? (
    <LoadingScreen path={path} version={version} message={bootError ?? undefined} />
  ) : (
    <>
      <LazyList mode="grocery" active={path === "/grocery"} warm={warm} scrolls={scrolls} restoreRef={restoreRef} shown={!lists || lists.sections.includes("shopping")} />
      <LazyList mode="inventory" active={path === "/inventory"} warm={warm} scrolls={scrolls} restoreRef={restoreRef} shown={!lists || lists.sections.includes("shopping")} />
      <LazyChecklist active={path === "/lists"} warm={warm} scrolls={scrolls} restoreRef={restoreRef} shown={!lists || lists.sections.includes("lists")} />
      <LazyRecipes active={path === "/recipes"} warm={warm} scrolls={scrolls} restoreRef={restoreRef} shown={!lists || lists.sections.includes("recipes")} />
      <LazyPacking active={path === "/packing"} warm={warm} scrolls={scrolls} restoreRef={restoreRef} shown={!lists || lists.sections.includes("packing")} />
      <LazyDates active={path === "/dates"} warm={warm} scrolls={scrolls} restoreRef={restoreRef} shown={!lists || lists.sections.includes("events")} />
      <LazyTrees active={path === "/trees"} warm={warm} scrolls={scrolls} restoreRef={restoreRef} shown={!lists || lists.sections.includes("trees")} />
      <LazyCalendar active={path === "/calendar"} warm={warm} scrolls={scrolls} restoreRef={restoreRef} shown={!lists || lists.sections.includes("calendar")} />
      {path === "/settings" ? <SignedInSettingsView version={version} /> : null}
    </>
  );

  const frame = (
    <>
      <div className="pb-24">{body}</div>
      <BottomNav signedIn={signedIn} />
    </>
  );

  return (
    <AppPathContext.Provider value={{ path, go }}>
      {signedIn && lists ? <DataTransfer>{frame}</DataTransfer> : frame}
    </AppPathContext.Provider>
  );
}

function LazyChecklist({
  active,
  warm,
  scrolls,
  restoreRef,
  shown,
}: {
  active: boolean;
  warm: boolean;
  scrolls: RefObject<Record<string, number>>;
  restoreRef: RefObject<string | null>;
  shown: boolean;
}) {
  const [mounted, setMounted] = useState(active && shown);

  useEffect(() => {
    if (shown && (active || warm)) setMounted(true);
  }, [active, warm, shown]);

  useLayoutEffect(() => {
    if (!active || restoreRef.current !== "/lists") return;
    restoreRef.current = null;
    window.scrollTo(0, scrolls.current?.["/lists"] ?? 0);
  }, [active, restoreRef, scrolls]);

  if (!shown || !mounted) return null;
  return (
    <div hidden={!active}>
      <ChecklistPage active={active} />
    </div>
  );
}

function LazyRecipes({
  active,
  warm,
  scrolls,
  restoreRef,
  shown,
}: {
  active: boolean;
  warm: boolean;
  scrolls: RefObject<Record<string, number>>;
  restoreRef: RefObject<string | null>;
  shown: boolean;
}) {
  const [mounted, setMounted] = useState(active && shown);

  useEffect(() => {
    if (shown && (active || warm)) setMounted(true);
  }, [active, warm, shown]);

  useLayoutEffect(() => {
    if (!active || restoreRef.current !== "/recipes") return;
    restoreRef.current = null;
    window.scrollTo(0, scrolls.current?.["/recipes"] ?? 0);
  }, [active, restoreRef, scrolls]);

  if (!shown || !mounted) return null;
  return (
    <div hidden={!active}>
      <RecipesPage active={active} />
    </div>
  );
}

function LazyPacking({
  active,
  warm,
  scrolls,
  restoreRef,
  shown,
}: {
  active: boolean;
  warm: boolean;
  scrolls: RefObject<Record<string, number>>;
  restoreRef: RefObject<string | null>;
  shown: boolean;
}) {
  const [mounted, setMounted] = useState(active && shown);

  useEffect(() => {
    if (shown && (active || warm)) setMounted(true);
  }, [active, warm, shown]);

  useLayoutEffect(() => {
    if (!active || restoreRef.current !== "/packing") return;
    restoreRef.current = null;
    window.scrollTo(0, scrolls.current?.["/packing"] ?? 0);
  }, [active, restoreRef, scrolls]);

  if (!shown || !mounted) return null;
  return (
    <div hidden={!active}>
      <PackingPage active={active} />
    </div>
  );
}

function LazyDates({
  active,
  warm,
  scrolls,
  restoreRef,
  shown,
}: {
  active: boolean;
  warm: boolean;
  scrolls: RefObject<Record<string, number>>;
  restoreRef: RefObject<string | null>;
  shown: boolean;
}) {
  const [mounted, setMounted] = useState(active && shown);

  useEffect(() => {
    if (shown && (active || warm)) setMounted(true);
  }, [active, warm, shown]);

  useLayoutEffect(() => {
    if (!active || restoreRef.current !== "/dates") return;
    restoreRef.current = null;
    window.scrollTo(0, scrolls.current?.["/dates"] ?? 0);
  }, [active, restoreRef, scrolls]);

  if (!shown || !mounted) return null;
  return (
    <div hidden={!active}>
      <DatesPage active={active} />
    </div>
  );
}

function LazyTrees({
  active,
  warm,
  scrolls,
  restoreRef,
  shown,
}: {
  active: boolean;
  warm: boolean;
  scrolls: RefObject<Record<string, number>>;
  restoreRef: RefObject<string | null>;
  shown: boolean;
}) {
  const [mounted, setMounted] = useState(active && shown);

  useEffect(() => {
    if (shown && (active || warm)) setMounted(true);
  }, [active, warm, shown]);

  useLayoutEffect(() => {
    if (!active || restoreRef.current !== "/trees") return;
    restoreRef.current = null;
    window.scrollTo(0, scrolls.current?.["/trees"] ?? 0);
  }, [active, restoreRef, scrolls]);

  if (!shown || !mounted) return null;
  return (
    <div hidden={!active}>
      <TreesPage active={active} />
    </div>
  );
}

function LazyCalendar({
  active,
  warm,
  scrolls,
  restoreRef,
  shown,
}: {
  active: boolean;
  warm: boolean;
  scrolls: RefObject<Record<string, number>>;
  restoreRef: RefObject<string | null>;
  shown: boolean;
}) {
  const [mounted, setMounted] = useState(active && shown);

  useEffect(() => {
    if (shown && (active || warm)) setMounted(true);
  }, [active, warm, shown]);

  useLayoutEffect(() => {
    if (!active || restoreRef.current !== "/calendar") return;
    restoreRef.current = null;
    window.scrollTo(0, scrolls.current?.["/calendar"] ?? 0);
  }, [active, restoreRef, scrolls]);

  if (!shown || !mounted) return null;
  return (
    <div hidden={!active}>
      <CalendarPage />
    </div>
  );
}

function LoadingScreen({ path, version, message }: { path: string; version: string; message?: string }) {
  const title =
    path === "/inventory"
      ? "רשימת המוצרים"
      : path === "/lists"
        ? "רשימות"
        : path === "/recipes"
        ? "מתכונים"
        : path === "/packing"
          ? "רשימות אריזה"
          : path === "/dates"
            ? "ארועים"
            : path === "/trees"
              ? "עצי משפחה"
              : path === "/calendar"
                ? "לוח שנה"
                : path === "/settings"
                  ? "הגדרות"
                  : "עגלת קניות";
  return (
    <>
      <AppHeader title={title} actionsEnabled={false} showCredit={path === "/settings"} creditVersion={version} />
      <p className="px-6 pt-16 text-center text-neutral-500">{message ?? "טוען…"}</p>
    </>
  );
}

function SignedInSettingsView({ version }: { version: string }) {
  const lists = useLists();
  return (
    <>
      <AppHeader title="הגדרות" actionsEnabled={false} showCredit creditVersion={version} />
      <SignedInSettings username={lists.username} />
    </>
  );
}

function LazyList({
  mode,
  active,
  warm,
  scrolls,
  restoreRef,
  shown,
}: {
  mode: "grocery" | "inventory";
  active: boolean;
  warm: boolean;
  scrolls: RefObject<Record<string, number>>;
  restoreRef: RefObject<string | null>;
  shown: boolean;
}) {
  const [mounted, setMounted] = useState(active && shown);

  useEffect(() => {
    if (shown && (active || warm)) setMounted(true);
  }, [active, warm, shown]);

  useLayoutEffect(() => {
    if (!active || restoreRef.current !== mode) return;
    restoreRef.current = null;
    window.scrollTo(0, scrolls.current?.[mode] ?? 0);
  }, [active, mode, restoreRef, scrolls]);

  if (!shown || !mounted) return null;
  return (
    <div hidden={!active}>
      <ListPage mode={mode} />
    </div>
  );
}
