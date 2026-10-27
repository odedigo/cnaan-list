"use client";

/** Sticky page header with the action menu, search, about dialog, and refresh notice. */

import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  Ref,
} from "react";

import {
  ChevronIcon,
  CloseIcon,
  ExportIcon,
  LinkIcon,
  MenuIcon,
  PasteIcon,
  PlusIcon,
  ReorderIcon,
  SearchIcon,
  SortIcon,
  TrashIcon,
} from "@/components/icons";

export function AppHeader({
  title,
  badge,
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
  onPlus,
  plusLabel = "הוספת שורה",
  onLink,
  onPasteRecipe,
  onExportFile,
  exportFileEnabled = true,
  showCredit = false,
  creditVersion = "",
}: {
  title: string;
  badge?: number;
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
  onPlus?: () => void;
  plusLabel?: string;
  onLink?: () => void;
  onPasteRecipe?: () => void;
  onExportFile?: () => void;
  exportFileEnabled?: boolean;
  showCredit?: boolean;
  creditVersion?: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [creditOpen, setCreditOpen] = useState(false);
  const showMenu = Boolean(onAdd || onSort || onReorder || onPlus || onLink || onPasteRecipe || onExportFile);
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
  const countBadge =
    badge != null ? (
      <span
        className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-white py-0.5 ps-1.5 text-xs font-semibold text-neutral-700"
        style={{ minHeight: "1.25rem", paddingInlineEnd: onClearGrocery ? "0.125rem" : "0.375rem" }}
      >
        <span className="min-w-4 text-center leading-5">{badge > 99 ? "99+" : badge}</span>
        {onClearGrocery ? (
          <button
            type="button"
            className="grid size-5 place-items-center rounded-full text-neutral-600 disabled:opacity-30"
            aria-label="ריקון רשימת הקניות"
            disabled={!actionsEnabled || !clearGroceryEnabled}
            onClick={onClearGrocery}
          >
            <TrashIcon className="size-3.5" />
          </button>
        ) : null}
      </span>
    ) : null;
  return (
    <header className="sticky top-0 z-20 border-b-[3px] border-[var(--cream)] bg-[var(--header)]">
      <div
        dir="ltr"
        className="grid h-14 grid-cols-[minmax(max-content,1fr)_minmax(0,max-content)_minmax(max-content,1fr)] items-center px-1"
      >
        <div className="flex items-center justify-self-start">
          {onToggleCategories && !showMenu ? (
            <HeaderButton
              label={categoriesExpanded ? "כווץ את הקטגוריות" : "הרחב את הקטגוריות"}
              disabled={!actionsEnabled || reorderActive}
              pressed={categoriesExpanded}
              onClick={onToggleCategories}
            >
              <ChevronIcon
                className={`size-6 ${categoriesExpanded ? "" : "rotate-180"}`}
              />
            </HeaderButton>
          ) : null}
          {countBadge}
          {searchSide === "start" ? searchButton : null}
        </div>
        <h1
          dir="rtl"
          className="flex min-w-0 items-center justify-center gap-1.5 px-1 text-lg font-semibold"
        >
          <img
            src="/header-logo.png"
            alt=""
            className="h-[1.2em] w-auto shrink-0"
          />
          <span className="min-w-0 truncate">{title}</span>
        </h1>
        <div className="relative flex shrink-0 items-center justify-self-end">
          {showCredit ? (
            <HeaderButton label="אודות" onClick={() => setCreditOpen(true)}>
              <span className="text-xl font-semibold leading-none">@</span>
            </HeaderButton>
          ) : null}
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
                {onAdd ? (
                  <MenuItem
                    label="הוספת קטגוריה"
                    disabled={!actionsEnabled}
                    onClick={() => {
                      setMenuOpen(false);
                      onAdd();
                    }}
                  >
                    <PlusIcon className="size-5" />
                  </MenuItem>
                ) : null}
                {onReorder ? (
                  <MenuItem
                    label={reorderActive ? "שמירת הסדר" : "גרירה לשינוי סדר"}
                    pressed={reorderActive}
                    disabled={!actionsEnabled}
                    onClick={() => {
                      setMenuOpen(false);
                      onReorder();
                    }}
                  >
                    <ReorderIcon
                      className={`size-5 ${reorderActive ? "text-[var(--teal)]" : ""}`}
                    />
                  </MenuItem>
                ) : null}
                {onSort ? (
                  <MenuItem
                    label="מיון אלפביתי"
                    disabled={!actionsEnabled}
                    onClick={() => {
                      setMenuOpen(false);
                      onSort();
                    }}
                  >
                    <SortIcon className="size-5" />
                  </MenuItem>
                ) : null}
                {onExportFile ? (
                  <MenuItem
                    label="ייצוא מתכון"
                    disabled={!actionsEnabled || !exportFileEnabled}
                    onClick={() => {
                      setMenuOpen(false);
                      onExportFile();
                    }}
                  >
                    <ExportIcon className="size-5" />
                  </MenuItem>
                ) : null}
                {onPlus ? (
                  <MenuItem
                    label={plusLabel}
                    disabled={!actionsEnabled}
                    onClick={() => {
                      setMenuOpen(false);
                      onPlus();
                    }}
                  >
                    <PlusIcon className="size-5" />
                  </MenuItem>
                ) : null}
                {onLink ? (
                  <>
                    <div role="separator" className="mx-3 my-1 h-px bg-neutral-200" />
                    <MenuItem
                      label="מתכון מקישור"
                      disabled={!actionsEnabled}
                      onClick={() => {
                        setMenuOpen(false);
                        onLink();
                      }}
                    >
                      <LinkIcon className="size-5" />
                    </MenuItem>
                  </>
                ) : null}
                {onPasteRecipe ? (
                  <MenuItem
                    label="מתכון מטקסט"
                    disabled={!actionsEnabled}
                    onClick={() => {
                      setMenuOpen(false);
                      onPasteRecipe();
                    }}
                  >
                    <PasteIcon className="size-5" />
                  </MenuItem>
                ) : null}
                {onToggleCategories ? (
                  <MenuItem
                    label={categoriesExpanded ? "כווץ את הקטגוריות" : "הרחב את הקטגוריות"}
                    pressed={categoriesExpanded}
                    disabled={!actionsEnabled || reorderActive}
                    onClick={() => {
                      setMenuOpen(false);
                      onToggleCategories();
                    }}
                  >
                    <ChevronIcon
                      className={`size-5 ${categoriesExpanded ? "" : "rotate-180"}`}
                    />
                  </MenuItem>
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
          <div dir="rtl" className="relative min-w-0 flex-1">
            <input
              ref={searchInputRef}
              autoFocus
              value={searchValue}
              onChange={(event) => onSearchChange?.(event.target.value)}
              placeholder={searchPlaceholder}
              className={`w-full rounded-xl border border-neutral-200 bg-white py-2 outline-none focus:border-[var(--teal)] ${searchValue ? "ps-3 pe-10" : "px-3"}`}
              aria-label={searchPlaceholder}
            />
            {searchValue ? (
              <button
                type="button"
                className="absolute end-1 top-1/2 grid size-8 -translate-y-1/2 place-items-center text-neutral-400"
                aria-label="ניקוי החיפוש"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onSearchChange?.("")}
              >
                <CloseIcon className="size-4" />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {creditOpen ? <CreditDialog version={creditVersion} onClose={() => setCreditOpen(false)} /> : null}
    </header>
  );
}

function CreditDialog({ version, onClose }: { version: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);
  return (
    <dialog
      ref={dialogRef}
      aria-label="אודות"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
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
        dir="rtl"
        className="text-center text-neutral-700"
        style={{
          width: "100%",
          maxWidth: 320,
          borderRadius: 16,
          background: "#fff",
          padding: "1.75rem 1.5rem 1.25rem",
          boxShadow: "0 12px 40px rgba(0, 0, 0, 0.28)",
        }}
      >
        <p className="text-base font-medium">פותח על ידי עודד כנען</p>
        <p className="mt-1 text-sm">כל הזכויות שמורות</p>
        {version ? <p className="mt-1 text-sm">גרסה {version}</p> : null}
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-xl bg-neutral-100 py-3 font-medium text-neutral-700"
        >
          סגירה
        </button>
      </div>
    </dialog>
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
