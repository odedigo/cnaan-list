"use client";

import type { ReactNode, Ref } from "react";

import { ChevronIcon, PlusIcon, ReorderIcon, SearchIcon, SortIcon } from "@/components/icons";

export function AppHeader({
  title,
  actionsEnabled,
  reorderActive = false,
  searchOpen = false,
  searchValue = "",
  searchPlaceholder = "",
  searchInputRef,
  onSearchToggle,
  onSearchChange,
  onAdd,
  onSort,
  onReorder,
  categoriesExpanded,
  onToggleCategories,
}: {
  title: string;
  actionsEnabled: boolean;
  reorderActive?: boolean;
  searchOpen?: boolean;
  searchValue?: string;
  searchPlaceholder?: string;
  searchInputRef?: Ref<HTMLInputElement>;
  onSearchToggle?: () => void;
  onSearchChange?: (value: string) => void;
  onAdd?: () => void;
  onSort?: () => void;
  onReorder?: () => void;
  categoriesExpanded?: boolean;
  onToggleCategories?: () => void;
}) {
  return (
    <header className="sticky top-0 z-20 bg-[var(--cream)]">
      <div
        dir="ltr"
        className="grid h-14 grid-cols-[minmax(max-content,1fr)_minmax(0,max-content)_minmax(max-content,1fr)] items-center px-1"
      >
        <button
          type="button"
          className="grid size-10 shrink-0 place-items-center justify-self-start disabled:opacity-30"
          aria-label="חיפוש"
          disabled={!actionsEnabled}
          onClick={onSearchToggle}
        >
          <SearchIcon className={`size-6 ${searchOpen ? "text-[var(--teal)]" : ""}`} />
        </button>
        <h1 className="min-w-0 truncate px-1 text-center text-lg font-semibold">{title}</h1>
        <div className="flex shrink-0 items-center justify-self-end">
          <HeaderButton label="הוספה" disabled={!actionsEnabled} onClick={onAdd}>
            <PlusIcon className="size-6" />
          </HeaderButton>
          <HeaderButton label="מיון אלפביתי" disabled={!actionsEnabled} onClick={onSort}>
            <SortIcon className="size-6" />
          </HeaderButton>
          <HeaderButton label={reorderActive ? "שמירת הסדר" : "סידור"} disabled={!actionsEnabled} pressed={reorderActive} onClick={onReorder}>
            <ReorderIcon className={`size-6 ${reorderActive ? "text-[var(--teal)]" : ""}`} />
          </HeaderButton>
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
        </div>
      </div>
      {searchOpen ? (
        <div className="px-4 pb-3">
          <input
            ref={searchInputRef}
            autoFocus
            value={searchValue}
            onChange={(event) => onSearchChange?.(event.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 outline-none focus:border-[var(--teal)]"
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
