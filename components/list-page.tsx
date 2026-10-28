"use client";

/** Inventory and grocery screens: categories, products, reorder, and the shopping cart. */

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
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { AppHeader } from "@/components/app-header";
import { DetailsSheet, type Editor } from "@/components/details-sheet";
import { DotsIcon, GripIcon, GroceryIcon, PlusIcon, TrashIcon } from "@/components/icons";
import { ImageBubble, Lightbox } from "@/components/images";
import {
  readSingleOpenCategory,
  singleOpenCategoryEvent,
} from "@/lib/single-category";
import { readShowStoreBadge, showStoreBadgeEvent } from "@/lib/store-badge";
import { useLists, useListsOptional } from "@/components/lists-provider";
import { colorHex } from "@/lib/colors";
import { DEFAULT_STORE_COLOR, inkFor } from "@/lib/stores";
import type { Category, Item } from "@/lib/types";
import { formatQuantity, stepQuantity, unitById } from "@/lib/units";

const purchasedCategoryId = "purchased";

export function ListPage({ mode }: { mode: "inventory" | "grocery" }) {
  const lists = useListsOptional();
  if (!lists) {
    return (
      <div>
        <AppHeader
          title={mode === "inventory" ? "רשימת המוצרים" : "עגלת קניות"}
          actionsEnabled={false}
        />
        <p className="px-6 pt-16 text-center text-neutral-500">
          יש להתחבר כדי לראות את הרשימה.
        </p>
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
  const searchResultsRef = useRef<HTMLUListElement>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [collapseReady, setCollapseReady] = useState(mode !== "inventory");
  const collapseKey =
    mode === "inventory"
      ? `cnaanlist-inventory-collapsed:${lists.accountId}`
      : null;
  const screenRef = useRef<HTMLDivElement>(null);
  const categoryNodes = useRef(new Map<string, HTMLElement>());
  const pendingScrollId = useRef<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [confirmClearPurchased, setConfirmClearPurchased] = useState(false);
  const [confirmClearGrocery, setConfirmClearGrocery] = useState(false);
  const [sorting, setSorting] = useState(false);
  const [showStoreBadge, setShowStoreBadge] = useState(true);
  const [lightbox, setLightbox] = useState<{
    src: string | null;
    label: string;
    onReplace: (file: File) => void;
    onRemove?: () => void;
  } | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useEffect(() => {
    if (!collapseKey) return;
    const stored = readCollapsed(collapseKey);
    if (readSingleOpenCategory()) {
      const openId =
        lists.categories.find((category) => stored[category.id] === false)
          ?.id ?? null;
      const next: Record<string, boolean> = {};
      for (const category of lists.categories)
        next[category.id] = category.id !== openId;
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
    const opening = !isExpanded(id);
    const replacing =
      mode === "inventory" &&
      opening &&
      readSingleOpenCategory() &&
      lists.categories.some(
        (category) => category.id !== id && isExpanded(category.id),
      );
    if (replacing) pendingScrollId.current = id;
    setCollapsed((current) => {
      if (
        mode === "inventory" &&
        !isExpanded(id, current) &&
        readSingleOpenCategory()
      ) {
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

  useLayoutEffect(() => {
    const id = pendingScrollId.current;
    if (!id) return;
    const section = categoryNodes.current.get(id);
    const header = screenRef.current?.querySelector("header");
    if (!section || !header) return;
    pendingScrollId.current = null;
    const gap = 8;
    const top =
      section.getBoundingClientRect().top -
      header.getBoundingClientRect().bottom -
      gap;
    window.scrollTo(0, Math.max(0, window.scrollY + top));
  }, [collapsed, lists.categories, editor, query]);

  function revealCategory(id: string) {
    pendingScrollId.current = id;
    if (query) setQuery("");
    if (searchOpen) setSearchOpen(false);
  }

  useEffect(() => {
    const syncBadge = () => setShowStoreBadge(readShowStoreBadge());
    syncBadge();
    window.addEventListener(showStoreBadgeEvent, syncBadge);
    return () => window.removeEventListener(showStoreBadgeEvent, syncBadge);
  }, []);

  useEffect(() => {
    if (mode !== "inventory") return;
    function onSingleCategory() {
      if (!readSingleOpenCategory()) return;
      setCollapsed((current) => {
        const openId =
          lists.categories.find((category) => current[category.id] === false)
            ?.id ?? null;
        const next: Record<string, boolean> = {};
        for (const category of lists.categories)
          next[category.id] = category.id !== openId;
        return next;
      });
    }
    window.addEventListener(singleOpenCategoryEvent, onSingleCategory);
    return () =>
      window.removeEventListener(singleOpenCategoryEvent, onSingleCategory);
  }, [lists.categories, mode]);

  const needle = query.trim().toLocaleLowerCase("he");

  useLayoutEffect(() => {
    if (mode !== "grocery" || !searchOpen || !needle) return;
    const list = searchResultsRef.current;
    const header = screenRef.current?.querySelector("header");
    if (!list || !header) return;
    const place = () => {
      const rect = header.getBoundingClientRect();
      const top = rect.bottom + 8;
      const nav = document.querySelector('nav[aria-label="ניווט ראשי"]');
      const navTop = nav?.getBoundingClientRect().top ?? window.innerHeight;
      list.style.top = `${top}px`;
      list.style.left = `${rect.left + 16}px`;
      list.style.width = `${Math.max(0, rect.width - 32)}px`;
      list.style.maxHeight = `${Math.max(120, navTop - top - 8)}px`;
    };
    list.scrollTop = 0;
    place();
    window.addEventListener("resize", place);
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", place);
    viewport?.addEventListener("scroll", place);
    return () => {
      window.removeEventListener("resize", place);
      viewport?.removeEventListener("resize", place);
      viewport?.removeEventListener("scroll", place);
    };
  }, [mode, searchOpen, needle]);

  const groceryByItem = useMemo(
    () => new Map(lists.grocery.map((line) => [line.item_id, line])),
    [lists.grocery],
  );

  const visibleCategories = lists.categories.filter((category) => {
    if (mode === "inventory") {
      if (!needle) return true;
      if (category.name.toLocaleLowerCase("he").includes(needle)) return true;
      return lists.items.some(
        (item) =>
          item.category_id === category.id &&
          item.name.toLocaleLowerCase("he").includes(needle),
      );
    }
    return lists.items.some(
      (item) =>
        item.category_id === category.id &&
        groceryByItem.get(item.id) &&
        !groceryByItem.get(item.id)?.checked,
    );
  });

  const cartItems = lists.items
    .filter((item) => groceryByItem.get(item.id)?.checked)
    .sort((a, b) => {
      const categoryA =
        lists.categories.find((category) => category.id === a.category_id)
          ?.sort_order ?? 0;
      const categoryB =
        lists.categories.find((category) => category.id === b.category_id)
          ?.sort_order ?? 0;
      return categoryA - categoryB || a.sort_order - b.sort_order;
    });

  const purchasedVisible =
    mode === "grocery" && !lists.reorderMode && cartItems.length > 0;

  function categoriesOpen(state: Record<string, boolean> = collapsed) {
    if (lists.categories.some((category) => isExpanded(category.id, state)))
      return true;
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
      if (mode === "grocery")
        return Boolean(
          groceryByItem.get(item.id) && !groceryByItem.get(item.id)?.checked,
        );
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
    if (
      !activeItem ||
      !overItem ||
      activeItem.category_id !== overItem.category_id
    )
      return;
    const category = lists.categories.find(
      (entry) => entry.id === activeItem.category_id,
    );
    if (!category) return;
    lists.moveItems(
      activeItem.category_id,
      activeId,
      overId,
      itemsFor(category).map((item) => item.id),
    );
  }

  function chooseSearchResult(itemId: string) {
    void lists.addToGrocery(itemId);
    setQuery("");
    searchInputRef.current?.focus();
  }

  function openImage(
    kind: "item" | "category",
    id: string,
    label: string,
    path: string | null,
  ) {
    setLightbox({
      src: lists.imageSrc(kind, id, path),
      label,
      onReplace: (file) => void lists.uploadImage(kind, id, file),
      onRemove: () => void lists.removeImage(kind, id),
    });
  }

  const title = mode === "inventory" ? "רשימת המוצרים" : "עגלת קניות";

  return (
    <div ref={screenRef}>
      <AppHeader
        title={title}
        badge={mode === "grocery" ? lists.grocery.length : undefined}
        actionsEnabled
        reorderActive={lists.reorderMode}
        searchOpen={searchOpen}
        searchValue={query}
        searchPlaceholder={
          mode === "inventory" ? "חיפוש במלאי" : "חיפוש מוצר להוספה"
        }
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
              const matchesName = category.name
                .toLocaleLowerCase("he")
                .includes(nextNeedle);
              const matchesItem = lists.items.some(
                (item) =>
                  item.category_id === category.id &&
                  item.name.toLocaleLowerCase("he").includes(nextNeedle),
              );
              return matchesName || matchesItem;
            });
            if (readSingleOpenCategory()) {
              const openId = matches[0]?.id;
              if (!openId) return current;
              const next: Record<string, boolean> = {};
              for (const category of lists.categories)
                next[category.id] = category.id !== openId;
              return next;
            }
            const next = { ...current };
            for (const category of matches) next[category.id] = false;
            return next;
          });
        }}
        onAdd={
          mode === "inventory"
            ? () => setEditor({ kind: "new-category" })
            : undefined
        }
        onSort={
          mode === "inventory"
            ? () => {
                setSorting(true);
                void lists
                  .sortAlphabetically()
                  .finally(() => setSorting(false));
              }
            : undefined
        }
        onReorder={
          mode === "inventory" ? () => void lists.toggleReorder() : undefined
        }
        categoriesExpanded={categoriesOpen()}
        onClearGrocery={
          mode === "grocery" ? () => setConfirmClearGrocery(true) : undefined
        }
        clearGroceryEnabled={lists.grocery.length > 0}
        onToggleCategories={
          lists.categories.length > 0 || purchasedVisible
            ? () => {
                setCollapsed((current) => {
                  const ids = lists.categories.map((category) => category.id);
                  if (mode === "grocery") ids.push(purchasedCategoryId);
                  const expanded = ids.some((id) =>
                    id === purchasedCategoryId && !purchasedVisible
                      ? false
                      : isExpanded(id, current),
                  );
                  const next: Record<string, boolean> = {};
                  for (const id of ids) next[id] = expanded;
                  return next;
                });
              }
            : undefined
        }
      />
      {lists.reorderMode ? (
        <p className="px-4 pb-2 text-center text-sm text-[var(--teal)]">
          גררו לסידור, ולחצו שוב על כפתור הסידור לשמירה
        </p>
      ) : null}
      {sorting ? <SortProgress /> : null}
      {lists.error ? (
        <p className="mx-4 mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {lists.error}
        </p>
      ) : null}
      {mode === "grocery" && searchOpen && needle ? (
        <ul
          ref={searchResultsRef}
          className="overflow-y-auto rounded-xl border border-neutral-200 bg-white shadow-sm"
          style={{ position: "fixed", zIndex: 10, overscrollBehavior: "contain" }}
        >
          {searchResults.length === 0 ? (
            <li className="px-3 py-3 text-sm text-neutral-500">
              לא נמצאו מוצרים ברשימה
            </li>
          ) : null}
          {searchResults.map((item) => (
            <li key={item.id}>
              <div
                className="flex w-full items-center gap-3 px-3 py-2 text-start"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => chooseSearchResult(item.id)}
              >
                <ImageBubble
                  src={lists.imageSrc("item", item.id, item.image_path)}
                  label={item.name}
                  size="size-9"
                />
                <span className="min-w-0 flex-1 text-start">
                  <span className="block truncate">{item.name}</span>
                  {item.comments ? (
                    <span className="block truncate text-sm text-neutral-500">
                      {item.comments}
                    </span>
                  ) : null}
                </span>
                <Stepper
                  quantity={item.quantity}
                  unitShort={unitById(item.unit).short}
                  onChange={(quantity) => void lists.setQuantity(item.id, quantity)}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={visibleCategories.map((category) => category.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="px-3 pt-2 pb-4">
            {visibleCategories.length === 0 ? (
              <p className="px-4 pt-16 text-center text-neutral-500">
                {mode === "inventory"
                  ? "אין עדיין קטגוריות. לחצו על + כדי להוסיף קטגוריה."
                  : "רשימת הקניות ריקה. חפשו מוצר כדי להוסיף אותו."}
              </p>
            ) : null}
            {visibleCategories.map((category) => {
              const open = isExpanded(category.id);
              const categoryItems = itemsFor(category);
              const productCount = lists.items.filter(
                (item) => item.category_id === category.id,
              ).length;
              const shadedCategory = category.name.includes("----");
              const categoryLabel = shadedCategory
                ? category.name
                    .replaceAll("----", " ")
                    .replace(/\s+/g, " ")
                    .trim()
                : category.name;
              const store = lists.stores.find(
                (entry) => entry.id === category.store_id,
              );
              const storeLabel = showStoreBadge && store ? store.name : null;
              const categoryBackground = shadedCategory
                ? "#b5b5b5"
                : (store?.color ?? DEFAULT_STORE_COLOR);
              const categoryInk = inkFor(categoryBackground);
              const showSeparator = mode === "inventory" && category.separator_after;
              const separatorText = category.separator_text.trim();
              return (
                <SortableBlock key={category.id} id={category.id}>
                  {(handle) => (
                    <section
                      className={showSeparator ? undefined : "mb-2"}
                      ref={(node) => {
                        if (node) categoryNodes.current.set(category.id, node);
                        else categoryNodes.current.delete(category.id);
                      }}
                    >
                      {mode === "grocery" && !lists.reorderMode ? (
                        <div
                          className="mb-1 grid cursor-pointer grid-cols-[4.75rem_minmax(0,1fr)_4.75rem] items-center rounded-md py-1"
                          style={{
                            background: categoryBackground,
                            color: categoryInk,
                          }}
                          onClick={() => toggleCategory(category.id)}
                        >
                          <div className="flex items-center ps-2">
                            <span className="min-w-5 rounded-full bg-white px-1.5 text-center text-xs font-semibold leading-5 text-neutral-800">
                              {categoryItems.length}
                            </span>
                          </div>
                          <div
                            className="min-w-0 truncate px-1 text-center text-base font-medium"
                            style={
                              storeLabel
                                ? { paddingInlineEnd: "4.75rem" }
                                : undefined
                            }
                          >
                            {categoryLabel}
                          </div>
                          <div className="relative flex items-center justify-end pe-1">
                            {storeLabel ? (
                              <span
                                className="pointer-events-none absolute top-1/2 max-w-24 -translate-y-1/2 truncate rounded-full px-1.5 text-xs font-semibold leading-4 text-neutral-800"
                                style={{
                                  insetInlineEnd: "2rem",
                                  background: "rgba(255,255,255,0.85)",
                                }}
                              >
                                {storeLabel}
                              </span>
                            ) : null}
                            <button
                              type="button"
                              className="grid size-8 place-items-center text-inherit"
                              aria-label="פרטי קטגוריה"
                              onClick={(event) => {
                                event.stopPropagation();
                                setEditor({
                                  kind: "category",
                                  id: category.id,
                                });
                              }}
                            >
                              <DotsIcon className="size-5" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <EntityCard
                          name={category.name}
                          storeLabel={storeLabel}
                          count={
                            mode === "inventory" ? productCount : undefined
                          }
                          color={colorHex(category.color)}
                          src={lists.imageSrc(
                            "category",
                            category.id,
                            category.image_path,
                          )}
                          handle={lists.reorderMode ? handle : undefined}
                          onAdd={
                            mode === "inventory" && !lists.reorderMode
                              ? () =>
                                  setEditor({
                                    kind: "new-item",
                                    categoryId: category.id,
                                  })
                              : undefined
                          }
                          onDots={
                            lists.reorderMode
                              ? undefined
                              : () =>
                                  setEditor({
                                    kind: "category",
                                    id: category.id,
                                  })
                          }
                          onClick={
                            mode === "inventory" && !lists.reorderMode
                              ? () => toggleCategory(category.id)
                              : undefined
                          }
                        />
                      )}
                      {open ? (
                        <>
                          <SortableContext
                            items={categoryItems.map((item) => item.id)}
                            strategy={verticalListSortingStrategy}
                          >
                            {categoryItems.map((item) => (
                              <ItemRow
                                key={item.id}
                                item={item}
                                color={colorHex(category.color)}
                                mode={mode}
                                reorderMode={lists.reorderMode}
                                src={lists.imageSrc(
                                  "item",
                                  item.id,
                                  item.image_path,
                                )}
                                onOpen={() =>
                                  setEditor({ kind: "item", id: item.id })
                                }
                                onImage={() =>
                                  openImage(
                                    "item",
                                    item.id,
                                    item.name,
                                    item.image_path,
                                  )
                                }
                                inGrocery={lists.grocery.some(
                                  (line) => line.item_id === item.id,
                                )}
                                onAdd={() =>
                                  void (lists.grocery.some((line) => line.item_id === item.id)
                                    ? lists.removeFromGrocery(item.id)
                                    : lists.addToGrocery(item.id))
                                }
                                onCheck={() =>
                                  void lists.setChecked(item.id, true)
                                }
                                onQuantity={(quantity) =>
                                  void lists.setQuantity(item.id, quantity)
                                }
                              />
                            ))}
                          </SortableContext>
                        </>
                      ) : null}
                      {showSeparator ? (
                        <div
                          role="separator"
                          aria-hidden={separatorText ? undefined : true}
                          className="flex items-center"
                          style={{ marginTop: "1.25rem", marginBottom: "1.25rem", gap: separatorText ? "0.75rem" : 0 }}
                        >
                          {separatorText ? (
                            <span className="max-w-[70%] shrink-0 truncate text-sm font-bold text-neutral-800">{separatorText}</span>
                          ) : null}
                          <span style={{ height: "1px", flex: 1, background: "#c4c4c4" }} />
                        </div>
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
                  <div />
                  <div className="min-w-0 truncate px-1 text-center text-base font-medium">
                    בעגלת הקניות
                  </div>
                  <div className="flex items-center justify-end pe-1">
                    <span
                      dir="ltr"
                      className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-white py-0.5 ps-1.5 text-xs font-semibold text-neutral-700"
                      style={{ minHeight: "1.25rem", paddingInlineEnd: "0.125rem" }}
                    >
                      <span className="min-w-4 text-center leading-5">{cartItems.length}</span>
                      <button
                        type="button"
                        className="grid size-5 place-items-center rounded-full text-neutral-600"
                        aria-label="ניקוי הפריטים שנקנו"
                        onClick={(event) => {
                          event.stopPropagation();
                          setConfirmClearPurchased(true);
                        }}
                      >
                        <TrashIcon className="size-3.5" />
                      </button>
                    </span>
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
                        color={colorHex(
                          lists.categories.find(
                            (category) => category.id === item.category_id,
                          )?.color,
                        )}
                        src={lists.imageSrc("item", item.id, item.image_path)}
                        onOpenImage={() =>
                          openImage("item", item.id, item.name, item.image_path)
                        }
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
          key={
            "id" in editor
              ? `${editor.kind}-${editor.id}`
              : "categoryId" in editor
                ? `${editor.kind}-${editor.categoryId}`
                : editor.kind
          }
          editor={editor}
          allowRemove={mode === "grocery"}
          allowDelete={mode === "inventory"}
          onClose={() => setEditor(null)}
          onCategoryAdded={revealCategory}
          onEnlarge={(src, label, onReplace, onRemove) =>
            setLightbox({ src, label, onReplace, onRemove })
          }
        />
      ) : null}
      {confirmClearGrocery ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="אישור ריקון רשימת הקניות"
        >
          <div className="w-full max-w-xs rounded-2xl bg-white p-4 text-center">
            <p className="text-sm font-medium">
              להסיר את כל הפריטים מרשימת הקניות, כולל הפריטים שנקנו?
            </p>
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
            <button
              type="button"
              className="mt-2 w-full rounded-xl bg-neutral-100 py-3 font-medium text-neutral-700"
              onClick={() => setConfirmClearGrocery(false)}
            >
              ביטול
            </button>
          </div>
        </div>
      ) : null}
      {confirmClearPurchased ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="אישור ניקוי הפריטים שנקנו"
        >
          <div className="w-full max-w-xs rounded-2xl bg-white p-4 text-center">
            <p className="text-sm font-medium">
              להסיר את הפריטים שנקנו מהרשימה?
            </p>
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
            <button
              type="button"
              className="mt-2 w-full rounded-xl bg-neutral-100 py-3 font-medium text-neutral-700"
              onClick={() => setConfirmClearPurchased(false)}
            >
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
            setLightbox((current) =>
              current
                ? { ...current, src: URL.createObjectURL(file) }
                : current,
            );
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
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
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
              <Stepper
                quantity={item.quantity}
                unitShort={unitById(item.unit).short}
                onChange={onQuantity}
              />
            ) : null
          }
          onOpenImage={onImage}
          onDots={reorderMode ? undefined : onOpen}
          onClick={
            reorderMode ? undefined : mode === "grocery" ? onCheck : onAdd
          }
        />
      )}
    </SortableBlock>
  );
}

function EntityCard({
  name,
  storeLabel,
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
  storeLabel?: string | null;
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
      <span
        className="absolute inset-y-0 start-0 w-1.5"
        style={{ background: color }}
      />
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
            {storeLabel ? (
              <span className="max-w-24 min-w-0 truncate rounded-full bg-neutral-100 px-1.5 text-xs font-medium leading-4 text-neutral-600">
                {storeLabel}
              </span>
            ) : null}
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
            {highlighted ? (
              <GroceryIcon
                className="size-4 shrink-0 text-[var(--teal)]"
                style={{ marginInlineEnd: "0.5rem" }}
                aria-hidden={false}
                role="img"
                aria-label="בעגלת הקניות"
              />
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
              {handle ? (
                <GripIcon className="size-5" />
              ) : (
                <DotsIcon className="size-4" />
              )}
            </button>
          </div>
        </div>
        {comment ? (
          <div className="truncate text-sm text-neutral-500">{comment}</div>
        ) : null}
      </div>
    </div>
  );
}

function Stepper({
  quantity,
  unitShort,
  onChange,
}: {
  quantity: number;
  unitShort: string;
  onChange: (quantity: number) => void;
}) {
  return (
    <div
      dir="ltr"
      className="flex shrink-0 items-center gap-2 text-sm"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        aria-label="הפחתה"
        className="grid size-6 place-items-center rounded-full border border-neutral-300"
        onClick={() => onChange(stepQuantity(quantity, -1))}
      >
        −
      </button>
      <span dir="rtl" className="min-w-8 px-0.5 text-center">
        <bdi>{formatQuantity(quantity)}</bdi> <bdi>{unitShort}</bdi>
      </span>
      <button
        type="button"
        aria-label="הוספה"
        className="grid size-6 place-items-center rounded-full border border-neutral-300"
        onClick={() => onChange(stepQuantity(quantity, 1))}
      >
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
          ממיין את הרשימה…
        </p>
      </div>
    </dialog>
  );
}

function SortableBlock({
  id,
  children,
}: {
  id: string;
  children: (handle: Record<string, unknown> | undefined) => ReactNode;
}) {
  const { reorderMode } = useLists();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !reorderMode });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.75 : 1,
      }}
    >
      {children(reorderMode ? { ...attributes, ...listeners } : undefined)}
    </div>
  );
}
