"use client";

/** Fixed bottom navigation between products, grocery, lists, recipes, events, packing, and actions. */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { useAppPath } from "@/components/app-path";
import { useDataTransfer } from "@/components/data-transfer";
import {
  AppsIcon,
  CalendarIcon,
  DotsIcon,
  DownloadIcon,
  GroceryIcon,
  ListsIcon,
  PlaneIcon,
  ProductsIcon,
  RecipesIcon,
  ReloadIcon,
  TreeIcon,
  SettingsIcon,
  UploadIcon,
} from "@/components/icons";
import { useListsOptional } from "@/components/lists-provider";
import type { AccountSection } from "@/lib/account-sections";

const tabs = [
  { href: "/inventory", label: "רשימת מוצרים", icon: ProductsIcon },
  { href: "/grocery", label: "עגלת קניות", icon: GroceryIcon },
  { href: "/lists", label: "רשימות", icon: ListsIcon },
  { href: "/recipes", label: "מתכונים", icon: RecipesIcon },
] as const;

export function BottomNav({ signedIn }: { signedIn: boolean }) {
  const nextPath = usePathname();
  const appPath = useAppPath();
  const pathname = appPath?.path || nextPath;
  const lists = useListsOptional();
  const sections = lists?.sections;
  const allowed = (section: AccountSection) => !sections || sections.includes(section);
  const visibleTabs = tabs.filter((tab) =>
    tab.href === "/lists" ? allowed("lists") : tab.href === "/recipes" ? allowed("recipes") : allowed("shopping"),
  );
  const showEvents = allowed("events");
  const showPacking = allowed("packing");
  const showTrees = allowed("trees");
  const showMore = showEvents || showPacking || showTrees;
  const transfer = useDataTransfer();
  const groceryCount = lists?.grocery.length ?? 0;
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [reloading, setReloading] = useState(false);
  const launcherRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const settingsActive =
    pathname === "/settings" || pathname.startsWith("/settings/");
  const packingActive =
    pathname === "/packing" || pathname.startsWith("/packing/");
  const datesActive = pathname === "/dates" || pathname.startsWith("/dates/");
  const treesActive = pathname === "/trees" || pathname.startsWith("/trees/");
  useEffect(() => {
    if (!launcherOpen && !actionsOpen) return;
    function onPointer(event: PointerEvent) {
      const target = event.target as Node;
      if (
        launcherRef.current?.contains(target) ||
        actionsRef.current?.contains(target)
      )
        return;
      setLauncherOpen(false);
      setActionsOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setLauncherOpen(false);
        setActionsOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [actionsOpen, launcherOpen]);
  useEffect(() => {
    setLauncherOpen(false);
    setActionsOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!reloading) return;
    const timer = window.setTimeout(() => {
      window.location.reload();
    }, 80);
    return () => window.clearTimeout(timer);
  }, [reloading]);
  return (
    <nav
      dir="ltr"
      className="fixed bottom-0 left-1/2 z-50 flex w-full max-w-[480px] -translate-x-1/2 border-t border-neutral-200 bg-white pb-[env(safe-area-inset-bottom)]"
      aria-label="ניווט ראשי"
    >
      {visibleTabs.map((tab) => {
        const active =
          pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        const href = signedIn ? tab.href : "/settings";
        const Icon = tab.icon;
        const instant = signedIn && href === tab.href;
        const className = `flex min-w-0 flex-1 flex-col items-center gap-1 px-0.5 py-2 text-center text-[10px] leading-tight ${active ? "text-black" : "text-neutral-400"}`;
        const label =
          tab.href === "/grocery" && groceryCount > 0
            ? `${tab.label}, ${groceryCount}`
            : undefined;
        if (instant) {
          return (
            <a
              key={tab.href}
              href={href}
              className={className}
              aria-current={active ? "page" : undefined}
              aria-label={label}
              onClick={(event) => {
                if (
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey ||
                  event.button !== 0
                )
                  return;
                event.preventDefault();
                appPath?.go(href);
              }}
            >
              <span className="relative">
                <Icon className="size-6" />
                {tab.href === "/grocery" && groceryCount > 0 ? (
                  <span className="absolute -top-1.5 -end-2 min-w-4 rounded-full bg-neutral-200 px-1 text-center text-[10px] font-semibold leading-4 text-neutral-600">
                    {groceryCount > 99 ? "99+" : groceryCount}
                  </span>
                ) : null}
              </span>
              <span>{tab.label}</span>
            </a>
          );
        }
        return (
          <Link
            key={tab.href}
            href={href}
            className={className}
            aria-current={active ? "page" : undefined}
            aria-label={label}
          >
            <span className="relative">
              <Icon className="size-6" />
              {tab.href === "/grocery" && groceryCount > 0 ? (
                <span className="absolute -top-1.5 -end-2 min-w-4 rounded-full bg-neutral-200 px-1 text-center text-[10px] font-semibold leading-4 text-neutral-600">
                  {groceryCount > 99 ? "99+" : groceryCount}
                </span>
              ) : null}
            </span>
            <span>{tab.label}</span>
          </Link>
        );
      })}
      {showMore ? (
      <div
        ref={launcherRef}
        className={`relative flex min-w-0 flex-1 flex-col items-center ${packingActive || datesActive || treesActive || launcherOpen ? "text-black" : "text-neutral-400"}`}
      >
        {launcherOpen ? (
          <div
            className="absolute bottom-full z-10 mb-2 flex rounded-xl border border-neutral-200 bg-white p-2 text-neutral-800 shadow-lg"
            style={{ right: 0 }}
          >
            <button
              type="button"
              className="flex w-16 flex-col items-center gap-1 rounded-lg px-1 py-2 text-neutral-800"
              aria-current={datesActive ? "page" : undefined}
              hidden={!showEvents}
              onClick={() => {
                setLauncherOpen(false);
                if (!signedIn) {
                  appPath?.go("/settings");
                  return;
                }
                appPath?.go("/dates");
              }}
            >
              <CalendarIcon className="size-7" />
              <span className="text-xs">ארועים</span>
            </button>
            <button
              type="button"
              className="flex w-16 flex-col items-center gap-1 rounded-lg px-1 py-2 text-neutral-800"
              aria-current={packingActive ? "page" : undefined}
              hidden={!showPacking}
              onClick={() => {
                setLauncherOpen(false);
                if (!signedIn) {
                  appPath?.go("/settings");
                  return;
                }
                appPath?.go("/packing");
              }}
            >
              <PlaneIcon className="size-7" />
              <span className="text-xs">אריזות</span>
            </button>
            <button
              type="button"
              className="flex w-16 flex-col items-center gap-1 rounded-lg px-1 py-2 text-neutral-800"
              aria-current={treesActive ? "page" : undefined}
              hidden={!showTrees}
              onClick={() => {
                setLauncherOpen(false);
                if (!signedIn) {
                  appPath?.go("/settings");
                  return;
                }
                appPath?.go("/trees");
              }}
            >
              <TreeIcon className="size-7" />
              <span className="text-xs">יוחסין</span>
            </button>
          </div>
        ) : null}
        <button
          type="button"
          className="flex w-full flex-col items-center gap-1 px-0.5 py-2 text-center"
          style={{ fontSize: "10px", lineHeight: "12.5px" }}
          aria-current={packingActive || datesActive || treesActive ? "page" : undefined}
          aria-expanded={launcherOpen}
          aria-haspopup="menu"
          aria-label="עוד"
          onClick={() => {
            setActionsOpen(false);
            setLauncherOpen((open) => !open);
          }}
        >
          <AppsIcon className="size-6" />
          <span dir="rtl">עוד...</span>
        </button>
      </div>
      ) : null}
      <div
        ref={actionsRef}
        className={`relative flex w-11 shrink-0 flex-col items-center ${settingsActive || actionsOpen ? "text-black" : "text-neutral-400"}`}
      >
        {actionsOpen ? (
          <div
            role="menu"
            dir="rtl"
            className="absolute bottom-full z-10 mb-2 rounded-xl border border-neutral-200 bg-white py-1 text-neutral-800 shadow-lg"
            style={{ right: 0, minWidth: "11.5rem" }}
          >
            {transfer ? (
              <>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2 text-start disabled:opacity-30"
                  style={{ fontSize: "0.875rem", lineHeight: "1.25rem" }}
                  disabled={transfer.busy}
                  onClick={() => {
                    setActionsOpen(false);
                    transfer.requestExport();
                  }}
                >
                  <DownloadIcon className="size-5 shrink-0" />
                  <span>{transfer.exporting ? "מייצא…" : "ייצוא נתונים"}</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2 text-start disabled:opacity-30"
                  style={{ fontSize: "0.875rem", lineHeight: "1.25rem" }}
                  disabled={transfer.busy}
                  onClick={() => {
                    setActionsOpen(false);
                    transfer.requestImport();
                  }}
                >
                  <UploadIcon className="size-5 shrink-0" />
                  <span>{transfer.importing ? "מייבא…" : "ייבוא נתונים"}</span>
                </button>
                <div
                  role="separator"
                  className="mx-3 my-1 h-px bg-neutral-200"
                />
              </>
            ) : null}
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-start disabled:opacity-30"
              style={{ fontSize: "0.875rem", lineHeight: "1.25rem" }}
              disabled={reloading}
              onClick={() => {
                setActionsOpen(false);
                setReloading(true);
              }}
            >
              <ReloadIcon className="size-5 shrink-0" />
              <span>{reloading ? "מרענן…" : "רענון האפליקציה"}</span>
            </button>
            <div role="separator" className="mx-3 my-1 h-px bg-neutral-200" />
            <a
              href="/settings"
              role="menuitem"
              dir="rtl"
              className="flex w-full items-center gap-2 px-3 py-2 text-start text-sm"
              onClick={(event) => {
                setActionsOpen(false);
                if (!signedIn) return;
                if (
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey ||
                  event.button !== 0
                )
                  return;
                event.preventDefault();
                appPath?.go("/settings");
              }}
            >
              <SettingsIcon className="size-5 shrink-0" />
              <span>הגדרות</span>
            </a>
          </div>
        ) : null}
        <button
          type="button"
          className="flex w-full flex-col items-center gap-1 px-0.5 py-2 text-center"
          aria-current={settingsActive ? "page" : undefined}
          aria-expanded={actionsOpen}
          aria-haspopup="menu"
          aria-label="פעולות"
          onClick={() => {
            setLauncherOpen(false);
            setActionsOpen((open) => !open);
          }}
        >
          <DotsIcon className="size-6" />
          <span
            aria-hidden
            className="invisible"
            style={{ fontSize: "10px", lineHeight: "12.5px" }}
          >
            .
          </span>
        </button>
      </div>
      {reloading ? <ReloadNotice /> : null}
    </nav>
  );
}

function ReloadNotice() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      if (dialog.open) dialog.close();
    };
  }, []);
  return (
    <dialog
      ref={dialogRef}
      aria-label="מרענן את האפליקציה"
      onCancel={(event) => event.preventDefault()}
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        maxWidth: "none",
        maxHeight: "none",
        margin: 0,
        padding: 24,
        border: "none",
        background: "rgba(0, 0, 0, 0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 360,
          borderRadius: 16,
          background: "#fff",
          textAlign: "center",
          padding: "2rem 1.5rem",
          boxShadow: "0 12px 40px rgba(0, 0, 0, 0.28)",
        }}
      >
        <style>
          {"@keyframes cnaanlist-spin { to { transform: rotate(360deg); } }"}
        </style>
        <div
          aria-hidden
          style={{
            width: 52,
            height: 52,
            margin: "0 auto 20px",
            borderRadius: "50%",
            border: "4px solid #e5e5e5",
            borderTopColor: "var(--teal)",
            animation: "cnaanlist-spin 0.8s linear infinite",
          }}
        />
        <p
          className="font-semibold"
          style={{ fontSize: "1.5rem", lineHeight: 1.35 }}
        >
          מרענן את האפליקציה…
        </p>
      </div>
    </dialog>
  );
}
