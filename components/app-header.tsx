"use client";

import { useEffect, useState, type ReactNode, Ref } from "react";

import {
  ChevronIcon,
  CloseIcon,
  DownloadIcon,
  MenuIcon,
  UploadIcon,
  ReloadIcon,
  PlusIcon,
  ReorderIcon,
  SearchIcon,
  SortIcon,
  TrashIcon,
} from "@/components/icons";

export function AppHeader({
  title,
  actionsEnabled,
  reorderActive = false,
  searchOpen = false,
  searchValue = "",
  searchPlaceholder = "",
  searchInputRef,
  searchSide = "start",
  onSearchToggle,
  onSearchChange,
  onAdd,
  onSort,
  onReorder,
  onExport,
  exporting = false,
  onImport,
  importing = false,
  categoriesExpanded,
  onToggleCategories,
  onClearGrocery,
  clearGroceryEnabled = false,
  onPlus,
}: {
  title: string;
  actionsEnabled: boolean;
  reorderActive?: boolean;
  searchOpen?: boolean;
  searchValue?: string;
  searchPlaceholder?: string;
  searchInputRef?: Ref<HTMLInputElement>;
  searchSide?: "start" | "end";
  onSearchToggle?: () => void;
  onSearchChange?: (value: string) => void;
  onAdd?: () => void;
  onSort?: () => void;
  onReorder?: () => void;
  onExport?: () => void;
  exporting?: boolean;
  onImport?: () => void;
  importing?: boolean;
  categoriesExpanded?: boolean;
  onToggleCategories?: () => void;
  onClearGrocery?: () => void;
  clearGroceryEnabled?: boolean;
  onPlus?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [installed, setInstalled] = useState(false);
  const showMenu = Boolean(onAdd || onSort || onReorder || onExport || onImport);
  useEffect(() => {
    const media = window.matchMedia("(display-mode: standalone)");
    const sync = () => {
      const nav = navigator as Navigator & { standalone?: boolean };
      setInstalled(media.matches || nav.standalone === true);
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  const searchButton = onSearchToggle ? (
    <button
      type="button"
      className="grid size-10 shrink-0 place-items-center disabled:opacity-30"
      aria-label="חיפוש"
      disabled={!actionsEnabled}
      onClick={onSearchToggle}
    >
      <SearchIcon
        className={`size-6 ${searchOpen ? "text-[var(--teal)]" : ""}`}
      />
    </button>
  ) : null;
  return (
    <header className="sticky top-0 z-20 border-b-[3px] border-[var(--cream)] bg-[var(--header)]">
      <div
        dir="ltr"
        className="grid h-14 grid-cols-[minmax(max-content,1fr)_minmax(0,max-content)_minmax(max-content,1fr)] items-center px-1"
      >
        <div className="flex items-center justify-self-start">
          {onToggleCategories ? (
            <HeaderButton
              label={categoriesExpanded ? "כווץ הכל" : "הרחב הכל"}
              disabled={!actionsEnabled || reorderActive}
              pressed={categoriesExpanded}
              onClick={onToggleCategories}
            >
              <ChevronIcon
                className={`size-6 ${categoriesExpanded ? "" : "rotate-180"}`}
              />
            </HeaderButton>
          ) : null}
          {onClearGrocery ? (
            <HeaderButton
              label="ריקון רשימת הקניות"
              disabled={!actionsEnabled || !clearGroceryEnabled}
              onClick={onClearGrocery}
            >
              <TrashIcon className="size-5" />
            </HeaderButton>
          ) : null}
          {searchSide === "start" ? searchButton : null}
        </div>
        <h1 dir="rtl" className="flex min-w-0 items-center justify-center gap-1.5 px-1 text-lg font-semibold">
          <img src="/header-logo.png" alt="" className="h-[1.2em] w-auto shrink-0" />
          <span className="min-w-0 truncate">{title}</span>
        </h1>
        <div className="relative flex shrink-0 items-center justify-self-end">
          {showMenu ? (
            <HeaderButton
              label="תפריט"
              disabled={!actionsEnabled}
              pressed={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <MenuIcon className="size-6" />
            </HeaderButton>
          ) : null}
          {onPlus ? (
            <HeaderButton label="הוספת שורה" disabled={!actionsEnabled} onClick={onPlus}>
              <PlusIcon className="size-7" />
            </HeaderButton>
          ) : null}
          {searchSide === "end" ? searchButton : null}
          {menuOpen && showMenu ? (
            <>
              <button
                type="button"
                className="fixed inset-0 z-20 cursor-default"
                aria-label="סגירת תפריט"
                onClick={() => setMenuOpen(false)}
              />
              <div
                dir="rtl"
                role="menu"
                className="absolute right-0 top-12 z-30 w-52 overflow-hidden rounded-xl bg-white py-1 text-start shadow-lg"
              >
                <MenuItem
                  label="הוספת קטגוריה"
                  disabled={!actionsEnabled || !onAdd}
                  onClick={() => {
                    setMenuOpen(false);
                    onAdd?.();
                  }}
                >
                  <PlusIcon className="size-5" />
                </MenuItem>
                <MenuItem
                  label={reorderActive ? "שמירת הסדר" : "שינוי סדר"}
                  pressed={reorderActive}
                  disabled={!actionsEnabled || !onReorder}
                  onClick={() => {
                    setMenuOpen(false);
                    onReorder?.();
                  }}
                >
                  <ReorderIcon
                    className={`size-5 ${reorderActive ? "text-[var(--teal)]" : ""}`}
                  />
                </MenuItem>
                <MenuItem
                  label="מיון אלפביתי"
                  disabled={!actionsEnabled || !onSort}
                  onClick={() => {
                    setMenuOpen(false);
                    onSort?.();
                  }}
                >
                  <SortIcon className="size-5" />
                </MenuItem>
                <div role="separator" className="mx-3 my-1 h-px bg-neutral-200" />
                <MenuItem
                  label="רענון האפליקציה"
                  onClick={() => {
                    window.location.reload();
                  }}
                >
                  <ReloadIcon className="size-5" />
                </MenuItem>
                <div role="separator" className="mx-3 my-1 h-px bg-neutral-200" />
                <MenuItem
                  label={exporting ? "מייצא…" : "ייצוא כל הנתונים"}
                  disabled={!actionsEnabled || !onExport || exporting || importing}
                  onClick={() => {
                    setMenuOpen(false);
                    onExport?.();
                  }}
                >
                  <DownloadIcon className="size-5" />
                </MenuItem>
                <MenuItem
                  label={importing ? "מייבא…" : "ייבוא נתונים"}
                  disabled={!actionsEnabled || !onImport || importing || exporting}
                  onClick={() => {
                    setMenuOpen(false);
                    onImport?.();
                  }}
                >
                  <UploadIcon className="size-5" />
                </MenuItem>
                {installed ? (
                  <>
                    <div role="separator" className="mx-3 my-1 h-px bg-neutral-200" />
                    <MenuItem
                      label="סגירת האפליקציה"
                      onClick={() => {
                        setMenuOpen(false);
                        window.close();
                      }}
                    >
                      <CloseIcon className="size-5" />
                    </MenuItem>
                  </>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </div>
      {searchOpen ? (
        <div dir="ltr" className="flex items-center gap-1 px-2 pb-3">
          <button
            type="button"
            className="grid size-10 shrink-0 place-items-center text-neutral-500"
            aria-label="סגירת חיפוש"
            onClick={onSearchToggle}
          >
            <CloseIcon className="size-5" />
          </button>
          <input
            ref={searchInputRef}
            autoFocus
            dir="rtl"
            value={searchValue}
            onChange={(event) => onSearchChange?.(event.target.value)}
            placeholder={searchPlaceholder}
            className="min-w-0 flex-1 rounded-xl border border-neutral-200 bg-white px-3 py-2 outline-none focus:border-[var(--teal)]"
            aria-label={searchPlaceholder}
          />
        </div>
      ) : null}
    </header>
  );
}

function MenuItem({
  label,
  disabled,
  pressed,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      aria-pressed={pressed}
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-2.5 text-sm disabled:opacity-30"
    >
      {children}
      <span>{label}</span>
    </button>
  );
}

function HeaderButton({
  label,
  disabled,
  pressed,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  pressed?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="grid size-10 shrink-0 place-items-center disabled:opacity-30"
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
