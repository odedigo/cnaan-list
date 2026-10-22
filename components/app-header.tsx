"use client";

import type { ReactNode, Ref } from "react";

import { ChevronIcon, CloseIcon, PlusIcon, ReorderIcon, SearchIcon, SortIcon, TrashIcon } from "@/components/icons";

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
  categoriesExpanded,
  onToggleCategories,
  onClearGrocery,
  clearGroceryEnabled = false,
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
  categoriesExpanded?: boolean;
  onToggleCategories?: () => void;
  onClearGrocery?: () => void;
  clearGroceryEnabled?: boolean;
}) {
  const searchButton = onSearchToggle ? (
    <button
      type="button"
      className="grid size-10 shrink-0 place-items-center disabled:opacity-30"
      aria-label="חיפוש"
      disabled={!actionsEnabled}
      onClick={onSearchToggle}
    >
      <SearchIcon className={`size-6 ${searchOpen ? "text-[var(--teal)]" : ""}`} />
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
              <ChevronIcon className={`size-6 ${categoriesExpanded ? "" : "rotate-180"}`} />
            </HeaderButton>
          ) : null}
          {onClearGrocery ? (
            <HeaderButton label="ריקון רשימת הקניות" disabled={!actionsEnabled || !clearGroceryEnabled} onClick={onClearGrocery}>
              <TrashIcon className="size-5" />
            </HeaderButton>
          ) : null}
          {searchSide === "start" ? searchButton : null}
        </div>
        <h1 className="min-w-0 truncate px-1 text-center text-lg font-semibold">{title}</h1>
        <div className="flex shrink-0 items-center justify-self-end">
          {onAdd ? (
            <HeaderButton label="הוספה" disabled={!actionsEnabled} onClick={onAdd}>
              <PlusIcon className="size-6" />
            </HeaderButton>
          ) : null}
          {onSort ? (
            <HeaderButton label="מיון אלפביתי" disabled={!actionsEnabled} onClick={onSort}>
              <SortIcon className="size-6" />
            </HeaderButton>
          ) : null}
          {onReorder ? (
            <HeaderButton label={reorderActive ? "שמירת הסדר" : "סידור"} disabled={!actionsEnabled} pressed={reorderActive} onClick={onReorder}>
              <ReorderIcon className={`size-6 ${reorderActive ? "text-[var(--teal)]" : ""}`} />
            </HeaderButton>
          ) : null}
          {searchSide === "end" ? searchButton : null}
        </div>
      </div>
      {searchOpen ? (
        <div dir="ltr" className="flex items-center gap-1 px-2 pb-3">
          <button type="button" className="grid size-10 shrink-0 place-items-center text-neutral-500" aria-label="סגירת חיפוש" onClick={onSearchToggle}>
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
