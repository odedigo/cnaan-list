"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { AppHeader } from "@/components/app-header";
import { DetailsSheet, type Editor } from "@/components/details-sheet";
import { DotsIcon, GripIcon, PlusIcon, TrashIcon } from "@/components/icons";
import { ImageBubble, Lightbox } from "@/components/images";
import { readSingleOpenCategory, singleOpenCategoryEvent } from "@/lib/single-category";
import { useLists, useListsOptional } from "@/components/lists-provider";
import { colorHex } from "@/lib/colors";
import { DEFAULT_STORE_COLOR, inkFor } from "@/lib/stores";
import type { Category, Item } from "@/lib/types";
import { downloadInventoryZip } from "@/lib/export-inventory";
import { createClient } from "@/lib/supabase/client";
import { formatQuantity, stepQuantity, unitById } from "@/lib/units";

const purchasedCategoryId = "purchased";

export function ListPage({ mode }: { mode: "inventory" | "grocery" }) {
  const lists = useListsOptional();
  if (!lists) {
    return (
      <div>
        <AppHeader title={mode === "inventory" ? "רשימת המוצרים" : "עגלת קניות"} actionsEnabled={false} />
        <p className="px-6 pt-16 text-center text-neutral-500">יש להתחבר כדי לראות את הרשימה.</p>
      </div>
    );
  }
  return <ListScreen mode={mode} />;
}

function ListScreen({ mode }: { mode: "inventory" | "grocery" }) {
  const lists = useLists();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [collapseReady, setCollapseReady] = useState(mode !== "inventory");
  const collapseKey = mode === "inventory" ? `cnaanlist-inventory-collapsed:${lists.accountId}` : null;
  const [editor, setEditor] = useState<Editor | null>(null);
  const [confirmClearPurchased, setConfirmClearPurchased] = useState(false);
  const [confirmClearGrocery, setConfirmClearGrocery] = useState(false);
  const [confirmExport, setConfirmExport] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [sorting, setSorting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [lightbox, setLightbox] = useState<{
    src: string | null;
    label: string;
    onReplace: (file: File) => void;
    onRemove?: () => void;
  } | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    if (!collapseKey) return;
    const stored = readCollapsed(collapseKey);
    if (readSingleOpenCategory()) {
      const openId = lists.categories.find((category) => stored[category.id] === false)?.id ?? null;
      const next: Record<string, boolean> = {};
      for (const category of lists.categories) next[category.id] = category.id !== openId;
      setCollapsed(next);
    } else {
      setCollapsed(stored);
    }
    setCollapseReady(true);
  }, [collapseKey]);

  useEffect(() => {
    if (!collapseKey || !collapseReady) return;
    localStorage.setItem(collapseKey, JSON.stringify(collapsed));
  }, [collapseKey, collapseReady, collapsed]);

  function isExpanded(id: string, state: Record<string, boolean> = collapsed) {
    if (mode === "inventory") return state[id] === false;
    return state[id] !== true;
  }

  function toggleCategory(id: string) {
    setCollapsed((current) => {
      const opening = !isExpanded(id, current);
      if (mode === "inventory" && opening && readSingleOpenCategory()) {
        const next: Record<string, boolean> = {};
        for (const category of lists.categories) next[category.id] = true;
        next[id] = false;
        return next;
      }
      return {
        ...current,
        [id]: isExpanded(id, current),
      };
    });
  }

  useEffect(() => {
    if (mode !== "inventory") return;
    function onSingleCategory() {
      if (!readSingleOpenCategory()) return;
      setCollapsed((current) => {
        const openId = lists.categories.find((category) => current[category.id] === false)?.id ?? null;
        const next: Record<string, boolean> = {};
        for (const category of lists.categories) next[category.id] = category.id !== openId;
        return next;
      });
    }
    window.addEventListener(singleOpenCategoryEvent, onSingleCategory);
    return () => window.removeEventListener(singleOpenCategoryEvent, onSingleCategory);
  }, [lists.categories, mode]);

  const needle = query.trim().toLocaleLowerCase("he");
  const groceryByItem = useMemo(() => new Map(lists.grocery.map((line) => [line.item_id, line])), [lists.grocery]);

  const visibleCategories = lists.categories.filter((category) => {
    if (mode === "inventory") {
      if (!needle) return true;
      if (category.name.toLocaleLowerCase("he").includes(needle)) return true;
      return lists.items.some((item) => item.category_id === category.id && item.name.toLocaleLowerCase("he").includes(needle));
    }
    return lists.items.some((item) => item.category_id === category.id && groceryByItem.get(item.id) && !groceryByItem.get(item.id)?.checked);
  });

  const cartItems = lists.items
    .filter((item) => groceryByItem.get(item.id)?.checked)
    .sort((a, b) => {
      const categoryA = lists.categories.find((category) => category.id === a.category_id)?.sort_order ?? 0;
      const categoryB = lists.categories.find((category) => category.id === b.category_id)?.sort_order ?? 0;
      return categoryA - categoryB || a.sort_order - b.sort_order;
    });

  const purchasedVisible = mode === "grocery" && !lists.reorderMode && cartItems.length > 0;

  function categoriesOpen(state: Record<string, boolean> = collapsed) {
    if (lists.categories.some((category) => isExpanded(category.id, state))) return true;
    return purchasedVisible && isExpanded(purchasedCategoryId, state);
  }

  const searchResults =
    mode === "grocery" && needle
      ? lists.items.filter((item) => {
          if (!item.name.toLocaleLowerCase("he").includes(needle)) return false;
          const line = groceryByItem.get(item.id);
          return !line || line.checked;
        })
      : [];

  function itemsFor(category: Category) {
    return lists.items.filter((item) => {
      if (item.category_id !== category.id) return false;
      if (mode === "grocery") return Boolean(groceryByItem.get(item.id) && !groceryByItem.get(item.id)?.checked);
      if (!needle) return true;
      if (category.name.toLocaleLowerCase("he").includes(needle)) return true;
      return item.name.toLocaleLowerCase("he").includes(needle);
    });
  }

  function onDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : "";
    if (!overId || activeId === overId) return;
    const visibleIds = visibleCategories.map((category) => category.id);
    if (visibleIds.includes(activeId) && visibleIds.includes(overId)) {
      lists.moveCategories(activeId, overId, visibleIds);
      return;
    }
    const activeItem = lists.items.find((item) => item.id === activeId);
    const overItem = lists.items.find((item) => item.id === overId);
    if (!activeItem || !overItem || activeItem.category_id !== overItem.category_id) return;
    const category = lists.categories.find((entry) => entry.id === activeItem.category_id);
    if (!category) return;
    lists.moveItems(activeItem.category_id, activeId, overId, itemsFor(category).map((item) => item.id));
  }

  function chooseSearchResult(itemId: string) {
    void lists.addToGrocery(itemId);
    setQuery("");
    searchInputRef.current?.focus();
  }

  function openImage(kind: "item" | "category", id: string, label: string, path: string | null) {
    setLightbox({
      src: lists.imageSrc(kind, id, path),
      label,
      onReplace: (file) => void lists.uploadImage(kind, id, file),
      onRemove: () => void lists.removeImage(kind, id),
    });
  }

  const title = mode === "inventory" ? "רשימת המוצרים" : "עגלת קניות";

  return (
    <div>
      <AppHeader
        title={title}
        actionsEnabled={!importing}
        reorderActive={lists.reorderMode}
        searchOpen={searchOpen}
        searchValue={query}
        searchPlaceholder={mode === "inventory" ? "חיפוש במלאי" : "חיפוש מוצר להוספה"}
        searchInputRef={searchInputRef}
        searchSide={mode === "grocery" ? "end" : "start"}
        onSearchToggle={() => {
          setSearchOpen((open) => !open);
          setQuery("");
        }}
        onSearchChange={(value) => {
          setQuery(value);
          const nextNeedle = value.trim().toLocaleLowerCase("he");
          if (!nextNeedle || mode !== "inventory") return;
          setCollapsed((current) => {
            const matches = lists.categories.filter((category) => {
              const matchesName = category.name.toLocaleLowerCase("he").includes(nextNeedle);
              const matchesItem = lists.items.some(
                (item) => item.category_id === category.id && item.name.toLocaleLowerCase("he").includes(nextNeedle),
              );
              return matchesName || matchesItem;
            });
            if (readSingleOpenCategory()) {
              const openId = matches[0]?.id;
              if (!openId) return current;
              const next: Record<string, boolean> = {};
              for (const category of lists.categories) next[category.id] = category.id !== openId;
              return next;
            }
            const next = { ...current };
            for (const category of matches) next[category.id] = false;
            return next;
          });
        }}
        onAdd={mode === "inventory" ? () => setEditor({ kind: "new-category" }) : undefined}
        onSort={
          mode === "inventory"
            ? () => {
                setSorting(true);
                void lists.sortAlphabetically().finally(() => setSorting(false));
              }
            : undefined
        }
        onReorder={mode === "inventory" ? () => void lists.toggleReorder() : undefined}
        onExport={mode === "inventory" ? () => setConfirmExport(true) : undefined}
        exporting={exporting}
        onImport={mode === "inventory" ? () => importInputRef.current?.click() : undefined}
        importing={importing}
        categoriesExpanded={categoriesOpen()}
        onClearGrocery={mode === "grocery" ? () => setConfirmClearGrocery(true) : undefined}
        clearGroceryEnabled={lists.grocery.length > 0}
        onToggleCategories={
          lists.categories.length > 0 || purchasedVisible
            ? () => {
                setCollapsed((current) => {
                  const ids = lists.categories.map((category) => category.id);
                  if (mode === "grocery") ids.push(purchasedCategoryId);
                  const expanded = ids.some((id) => (id === purchasedCategoryId && !purchasedVisible ? false : isExpanded(id, current)));
                  const next: Record<string, boolean> = {};
                  for (const id of ids) next[id] = expanded;
                  return next;
                });
              }
            : undefined
        }
      />
      {lists.reorderMode ? <p className="px-4 pb-2 text-center text-sm text-[var(--teal)]">גררו לסידור, ולחצו שוב על כפתור הסידור לשמירה</p> : null}
      {exporting ? <p className="px-4 pb-2 text-center text-sm text-neutral-500">מייצא את הנתונים…</p> : null}
      {importing ? <ImportProgress progress={importProgress} /> : null}
      {sorting ? <SortProgress /> : null}
      <input
        ref={importInputRef}
        type="file"
        accept=".zip,application/zip"
        tabIndex={-1}
        aria-hidden
        style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          event.target.value = "";
          if (file) setImportFile(file);
        }}
      />
      {lists.error ? <p className="mx-4 mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{lists.error}</p> : null}
      {exportError ? <p className="mx-4 mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{exportError}</p> : null}
      {mode === "grocery" && searchOpen && needle ? (
        <ul className="mx-4 mb-3 overflow-hidden rounded-xl bg-white shadow-sm">
          {searchResults.length === 0 ? <li className="px-3 py-3 text-sm text-neutral-500">לא נמצאו מוצרים במלאי</li> : null}
          {searchResults.map((item) => (
            <li key={item.id}>
              <div
                role="button"
                tabIndex={0}
                className="flex w-full items-center gap-3 px-3 py-2 text-start"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => chooseSearchResult(item.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    chooseSearchResult(item.id);
                  }
                }}
              >
                <ImageBubble src={lists.imageSrc("item", item.id, item.image_path)} label={item.name} size="size-9" />
                <span className="min-w-0 flex-1 text-start">
                  <span className="block truncate">{item.name}</span>
                  {item.comments ? <span className="block truncate text-sm text-neutral-500">{item.comments}</span> : null}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={visibleCategories.map((category) => category.id)} strategy={verticalListSortingStrategy}>
          <div className="px-3 pt-2 pb-4">
            {visibleCategories.length === 0 ? (
              <p className="px-4 pt-16 text-center text-neutral-500">
                {mode === "inventory" ? "אין עדיין קטגוריות. לחצו על + כדי להוסיף קטגוריה." : "רשימת הקניות ריקה. חפשו מוצר כדי להוסיף אותו."}
              </p>
            ) : null}
            {visibleCategories.map((category) => {
              const open = isExpanded(category.id);
              const categoryItems = itemsFor(category);
              const productCount = lists.items.filter((item) => item.category_id === category.id).length;
              const shadedCategory = category.name.includes("----");
              const categoryLabel = shadedCategory ? category.name.replaceAll("----", " ").replace(/\s+/g, " ").trim() : category.name;
              const store = lists.stores.find((entry) => entry.id === category.store_id);
              const categoryBackground = shadedCategory ? "#b5b5b5" : (store?.color ?? DEFAULT_STORE_COLOR);
              const categoryInk = inkFor(categoryBackground);
              return (
                <SortableBlock key={category.id} id={category.id}>
                  {(handle) => (
                    <section className="mb-2">
                      {mode === "grocery" && !lists.reorderMode ? (
                        <div
                          className="mb-1 grid cursor-pointer grid-cols-[4.75rem_minmax(0,1fr)_4.75rem] items-center rounded-md py-1"
                          style={{ background: categoryBackground, color: categoryInk }}
                          onClick={() => toggleCategory(category.id)}
                        >
                          <div className="flex items-center ps-2">
                            <span className="min-w-5 rounded-full bg-white px-1.5 text-center text-xs font-semibold leading-5 text-neutral-800">
                              {categoryItems.length}
                            </span>
                          </div>
                          <div className="min-w-0 truncate px-1 text-center text-base font-medium">{categoryLabel}</div>
                          <div className="flex items-center justify-end pe-1">
                            <button
                              type="button"
                              className="grid size-8 place-items-center text-inherit"
                              aria-label="פרטי קטגוריה"
                              onClick={(event) => {
                                event.stopPropagation();
                                setEditor({ kind: "category", id: category.id });
                              }}
                            >
                              <DotsIcon className="size-5" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <EntityCard
                          name={category.name}
                          count={mode === "inventory" ? productCount : undefined}
                          color={colorHex(category.color)}
                          src={lists.imageSrc("category", category.id, category.image_path)}
                          handle={lists.reorderMode ? handle : undefined}
                          onAdd={
                            mode === "inventory" && !lists.reorderMode
                              ? () => setEditor({ kind: "new-item", categoryId: category.id })
                              : undefined
                          }
                          onDots={lists.reorderMode ? undefined : () => setEditor({ kind: "category", id: category.id })}
                          onClick={mode === "inventory" && !lists.reorderMode ? () => toggleCategory(category.id) : undefined}
                        />
                      )}
                      {open ? (
                        <>
                          <SortableContext items={categoryItems.map((item) => item.id)} strategy={verticalListSortingStrategy}>
                            {categoryItems.map((item) => (
                              <ItemRow
                                key={item.id}
                                item={item}
                                color={colorHex(category.color)}
                                mode={mode}
                                reorderMode={lists.reorderMode}
                                src={lists.imageSrc("item", item.id, item.image_path)}
                                onOpen={() => setEditor({ kind: "item", id: item.id })}
                                onImage={() => openImage("item", item.id, item.name, item.image_path)}
                                inGrocery={lists.grocery.some((line) => line.item_id === item.id)}
                                onAdd={() => void lists.addToGrocery(item.id)}
                                onCheck={() => void lists.setChecked(item.id, true)}
                                onQuantity={(quantity) => void lists.setQuantity(item.id, quantity)}
                              />
                            ))}
                          </SortableContext>
                        </>
                      ) : null}
                    </section>
                  )}
                </SortableBlock>
              );
            })}
            {purchasedVisible ? (
              <section className="mt-6">
                <div
                  className="mb-2 grid cursor-pointer grid-cols-[4.75rem_minmax(0,1fr)_4.75rem] items-center rounded-md bg-[#e7f3ef] py-2.5"
                  onClick={() => toggleCategory(purchasedCategoryId)}
                >
                  <div className="flex items-center ps-2">
                    <span className="min-w-5 rounded-full bg-white px-1.5 text-center text-xs font-semibold leading-5 text-neutral-800">
                      {cartItems.length}
                    </span>
                  </div>
                  <div className="min-w-0 truncate px-1 text-center text-base font-medium">בעגלת הקניות</div>
                  <div className="flex items-center justify-end pe-1">
                    <button
                      type="button"
                      className="grid size-8 place-items-center text-neutral-600"
                      aria-label="ניקוי הפריטים שנקנו"
                      onClick={(event) => {
                        event.stopPropagation();
                        setConfirmClearPurchased(true);
                      }}
                    >
                      <TrashIcon className="size-5" />
                    </button>
                  </div>
                </div>
                {isExpanded(purchasedCategoryId)
                  ? cartItems.map((item) => (
                      <EntityCard
                        key={item.id}
                        nested
                        purchased
                        name={item.name}
                        comment={item.comments}
                        color={colorHex(lists.categories.find((category) => category.id === item.category_id)?.color)}
                        src={lists.imageSrc("item", item.id, item.image_path)}
                        onOpenImage={() => openImage("item", item.id, item.name, item.image_path)}
                        onDots={() => setEditor({ kind: "item", id: item.id })}
                        onClick={() => void lists.setChecked(item.id, false)}
                      />
                    ))
                  : null}
              </section>
            ) : null}
          </div>
        </SortableContext>
      </DndContext>
      {editor ? (
        <DetailsSheet
          key={"id" in editor ? `${editor.kind}-${editor.id}` : "categoryId" in editor ? `${editor.kind}-${editor.categoryId}` : editor.kind}
          editor={editor}
          allowRemove={mode === "grocery"}
          onClose={() => setEditor(null)}
          onEnlarge={(src, label, onReplace, onRemove) => setLightbox({ src, label, onReplace, onRemove })}
        />
      ) : null}
      {importFile ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="אישור ייבוא המלאי">
          <div className="w-full max-w-xs rounded-2xl bg-white p-4 text-center">
            <p className="text-sm font-medium">ייבוא יחליף את כל הקטגוריות, המוצרים והתמונות בחשבון זה, וגם ירוקן את רשימת הקניות. רשימות שבקובץ מחליפות את הרשימות בחשבון.</p>
            <button
              type="button"
              className="mt-4 w-full rounded-xl bg-[var(--teal)] py-3 font-medium text-white"
              onClick={() => {
                const file = importFile;
                setImportFile(null);
                setImportProgress(0);
                setImporting(true);
                setExportError(null);
                void lists
                  .importInventory(file, (ratio) => {
                    setImportProgress(ratio);
                    if (ratio >= 1) setImporting(false);
                  })
                  .finally(() => setImporting(false));
              }}
            >
              ייבוא
            </button>
            <button type="button" className="mt-2 w-full rounded-xl bg-neutral-100 py-3 font-medium text-neutral-700" onClick={() => setImportFile(null)}>
              ביטול
            </button>
          </div>
        </div>
      ) : null}
      {confirmExport ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="אישור ייצוא המלאי">
          <div className="w-full max-w-xs rounded-2xl bg-white p-4 text-center">
            <p className="text-sm font-medium">לייצא את המוצרים והרשימות לקובץ?</p>
            <button
              type="button"
              className="mt-4 w-full rounded-xl bg-[var(--teal)] py-3 font-medium text-white"
              onClick={() => {
                setConfirmExport(false);
                setExporting(true);
                setExportError(null);
                void downloadInventoryZip(createClient(), lists.categories, lists.items, lists.checklist, lists.stores)
                  .catch(() => setExportError("לא ניתן לייצא את הרשימה"))
                  .finally(() => setExporting(false));
              }}
            >
              ייצוא
            </button>
            <button type="button" className="mt-2 w-full rounded-xl bg-neutral-100 py-3 font-medium text-neutral-700" onClick={() => setConfirmExport(false)}>
              ביטול
            </button>
          </div>
        </div>
      ) : null}
      {confirmClearGrocery ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="אישור ריקון רשימת הקניות">
          <div className="w-full max-w-xs rounded-2xl bg-white p-4 text-center">
            <p className="text-sm font-medium">להסיר את כל הפריטים מרשימת הקניות, כולל הפריטים שנקנו?</p>
            <button
              type="button"
              className="mt-4 w-full rounded-xl bg-red-50 py-3 font-medium text-red-700"
              onClick={() => {
                setConfirmClearGrocery(false);
                void lists.clearGrocery();
              }}
            >
              אישור מחיקה
            </button>
            <button type="button" className="mt-2 w-full rounded-xl bg-neutral-100 py-3 font-medium text-neutral-700" onClick={() => setConfirmClearGrocery(false)}>
              ביטול
            </button>
          </div>
        </div>
      ) : null}
      {confirmClearPurchased ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="אישור ניקוי הפריטים שנקנו">
          <div className="w-full max-w-xs rounded-2xl bg-white p-4 text-center">
            <p className="text-sm font-medium">להסיר את הפריטים שנקנו מהרשימה?</p>
            <button
              type="button"
              className="mt-4 w-full rounded-xl bg-red-50 py-3 font-medium text-red-700"
              onClick={() => {
                setConfirmClearPurchased(false);
                void lists.clearPurchased();
              }}
            >
              אישור מחיקה
            </button>
            <button type="button" className="mt-2 w-full rounded-xl bg-neutral-100 py-3 font-medium text-neutral-700" onClick={() => setConfirmClearPurchased(false)}>
              ביטול
            </button>
          </div>
        </div>
      ) : null}
      {lightbox ? (
        <Lightbox
          src={lightbox.src}
          label={lightbox.label}
          onClose={() => setLightbox(null)}
          onReplace={(file) => {
            lightbox.onReplace(file);
            setLightbox((current) => (current ? { ...current, src: URL.createObjectURL(file) } : current));
          }}
          onRemove={
            lightbox.onRemove
              ? () => {
                  lightbox.onRemove?.();
                  setLightbox(null);
                }
              : undefined
          }
        />
      ) : null}
    </div>
  );
}

function readCollapsed(key: string) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const next: Record<string, boolean> = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (typeof value === "boolean") next[id] = value;
    }
    return next;
  } catch {
    return {};
  }
}

function ItemRow({
  item,
  color,
  mode,
  reorderMode,
  inGrocery,
  src,
  onOpen,
  onImage,
  onAdd,
  onCheck,
  onQuantity,
}: {
  item: Item;
  color: string;
  mode: "inventory" | "grocery";
  reorderMode: boolean;
  inGrocery: boolean;
  src: string | null;
  onOpen: () => void;
  onImage: () => void;
  onAdd: () => void;
  onCheck: () => void;
  onQuantity: (quantity: number) => void;
}) {
  return (
    <SortableBlock id={item.id}>
      {(handle) => (
        <EntityCard
          nested
          name={item.name}
          comment={item.comments}
          color={color}
          src={src}
          highlighted={mode === "inventory" && inGrocery}
          handle={reorderMode ? handle : undefined}
          extra={
            mode === "grocery" && !reorderMode ? (
              <Stepper quantity={item.quantity} unitShort={unitById(item.unit).short} onChange={onQuantity} />
            ) : null
          }
          onOpenImage={onImage}
          onDots={reorderMode ? undefined : onOpen}
          onClick={reorderMode ? undefined : mode === "grocery" ? onCheck : onAdd}
        />
      )}
    </SortableBlock>
  );
}

function EntityCard({
  name,
  count,
  comment,
  color,
  src,
  handle,
  extra,
  nested = false,
  highlighted = false,
  purchased = false,
  onOpenImage,
  onAdd,
  onDots,
  onClick,
}: {
  name: string;
  count?: number;
  comment?: string;
  color: string;
  src: string | null;
  handle?: Record<string, unknown>;
  extra?: ReactNode;
  nested?: boolean;
  highlighted?: boolean;
  purchased?: boolean;
  onOpenImage?: () => void;
  onAdd?: () => void;
  onDots?: () => void;
  onClick?: () => void;
}) {
  return (
    <div
      dir="rtl"
      onClick={onClick}
      className={`relative mb-1 flex items-center gap-1.5 overflow-hidden rounded-lg py-2 pe-1 ps-2.5 shadow-sm ${purchased ? "bg-neutral-200" : highlighted ? "bg-[#d7efe9]" : "bg-white"} ${onClick ? "cursor-pointer" : ""} ${nested ? "ms-6 w-[calc(100%-1.5rem)]" : ""}`}
    >
      <span className="absolute inset-y-0 start-0 w-1.5" style={{ background: color }} />
      <ImageBubble src={src} label={name} onOpen={onOpenImage} size="size-10" />
      <div className="min-w-0 flex-1 text-start text-base leading-tight">
        <div className="flex min-w-0 items-center gap-1">
          <div className="flex min-w-0 flex-1 items-baseline gap-1">
            <span className="truncate">{name}</span>
            {count != null ? (
              <span className="shrink-0 min-w-4 rounded-full bg-neutral-200 px-1 text-center text-[10px] font-semibold leading-4 text-neutral-600">
                {count}
              </span>
            ) : null}
          </div>
          {extra}
          <div className="flex shrink-0 items-center">
            {onAdd ? (
              <button
                type="button"
                className="grid size-8 place-items-center text-black"
                aria-label="הוספת מוצר חדש"
                onClick={(event) => {
                  event.stopPropagation();
                  onAdd();
                }}
              >
                <PlusIcon className="size-4" />
              </button>
            ) : null}
            <button
              type="button"
              className={`grid size-8 place-items-center text-neutral-400 ${handle ? "cursor-grab touch-none text-neutral-500 active:cursor-grabbing" : ""}`}
              aria-label={handle ? "גרירה" : "פרטים"}
              {...handle}
              onClick={(event) => {
                event.stopPropagation();
                if (!handle) onDots?.();
              }}
            >
              {handle ? <GripIcon className="size-5" /> : <DotsIcon className="size-4" />}
            </button>
          </div>
        </div>
        {comment ? <div className="truncate text-sm text-neutral-500">{comment}</div> : null}
      </div>
    </div>
  );
}

function Stepper({ quantity, unitShort, onChange }: { quantity: number; unitShort: string; onChange: (quantity: number) => void }) {
  return (
    <div dir="ltr" className="flex shrink-0 items-center gap-2 text-sm" onClick={(event) => event.stopPropagation()}>
      <button type="button" aria-label="הפחתה" className="grid size-6 place-items-center rounded-full border border-neutral-300" onClick={() => onChange(stepQuantity(quantity, -1))}>
        −
      </button>
      <span dir="rtl" className="min-w-8 px-0.5 text-center">
        <bdi>{formatQuantity(quantity)}</bdi> <bdi>{unitShort}</bdi>
      </span>
      <button type="button" aria-label="הוספה" className="grid size-6 place-items-center rounded-full border border-neutral-300" onClick={() => onChange(stepQuantity(quantity, 1))}>
        +
      </button>
    </div>
  );
}

function SortProgress() {
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
      aria-label="ממיין את הרשימה"
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
        <style>{"@keyframes cnaanlist-spin { to { transform: rotate(360deg); } }"}</style>
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
        <p className="font-semibold" style={{ fontSize: "1.5rem", lineHeight: 1.35 }}>
          ממיין את הרשימה…
        </p>
      </div>
    </dialog>
  );
}

function ImportProgress({ progress }: { progress: number }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const percent = Math.round(progress * 100);
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
      aria-label="מייבא את הנתונים"
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
        <p className="font-semibold" style={{ fontSize: "1.5rem", lineHeight: 1.35 }}>
          מייבא את הנתונים…
        </p>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label="התקדמות הייבוא"
          style={{ height: 16, marginTop: 28, overflow: "hidden", borderRadius: 999, background: "#e5e5e5" }}
        >
          <div style={{ width: `${percent}%`, height: "100%", borderRadius: 999, background: "var(--teal)", transition: "width 200ms ease" }} />
        </div>
        <p className="font-medium" style={{ fontSize: "1.35rem", marginTop: 16, color: "#404040" }}>
          {percent}%
        </p>
      </div>
    </dialog>
  );
}

function SortableBlock({ id, children }: { id: string; children: (handle: Record<string, unknown> | undefined) => ReactNode }) {
  const { reorderMode } = useLists();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !reorderMode });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.75 : 1 }}>
      {children(reorderMode ? { ...attributes, ...listeners } : undefined)}
    </div>
  );
}
