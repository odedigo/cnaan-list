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
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { AppHeader } from "@/components/app-header";
import { DetailsSheet, type Editor } from "@/components/details-sheet";
import { DotsIcon, GripIcon, PlusIcon } from "@/components/icons";
import { ImageBubble, Lightbox } from "@/components/images";
import { useLists, useListsOptional } from "@/components/lists-provider";
import { colorHex } from "@/lib/colors";
import type { Category, Item } from "@/lib/types";
import { formatQuantity, unitById } from "@/lib/units";

export function ListPage({ mode }: { mode: "inventory" | "grocery" }) {
  const lists = useListsOptional();
  if (!lists) {
    return (
      <div>
        <AppHeader title={mode === "inventory" ? "רשימת המוצרים" : "רשימת הקניות"} actionsEnabled={false} />
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
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [collapseReady, setCollapseReady] = useState(mode !== "inventory");
  const collapseKey = mode === "inventory" ? `cnaanlist-inventory-collapsed:${lists.accountId}` : null;
  const [editor, setEditor] = useState<Editor | null>(null);
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
    setCollapsed(readCollapsed(collapseKey));
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
    setCollapsed((current) => ({
      ...current,
      [id]: isExpanded(id, current),
    }));
  }

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

  function openImage(kind: "item" | "category", id: string, label: string, path: string | null) {
    setLightbox({
      src: lists.imageSrc(kind, id, path),
      label,
      onReplace: (file) => void lists.uploadImage(kind, id, file),
      onRemove: () => void lists.removeImage(kind, id),
    });
  }

  const title = mode === "inventory" ? "רשימת המוצרים" : "רשימת הקניות";

  return (
    <div>
      <AppHeader
        title={title}
        actionsEnabled
        reorderActive={lists.reorderMode}
        searchOpen={searchOpen}
        searchValue={query}
        searchPlaceholder={mode === "inventory" ? "חיפוש במלאי" : "חיפוש מוצר להוספה"}
        onSearchToggle={() => {
          setSearchOpen((open) => !open);
          setQuery("");
        }}
        onSearchChange={(value) => {
          setQuery(value);
          const nextNeedle = value.trim().toLocaleLowerCase("he");
          if (!nextNeedle || mode !== "inventory") return;
          setCollapsed((current) => {
            const next = { ...current };
            for (const category of lists.categories) {
              const matchesName = category.name.toLocaleLowerCase("he").includes(nextNeedle);
              const matchesItem = lists.items.some(
                (item) => item.category_id === category.id && item.name.toLocaleLowerCase("he").includes(nextNeedle),
              );
              if (matchesName || matchesItem) next[category.id] = false;
            }
            return next;
          });
        }}
        onAdd={() => setEditor({ kind: "new-category" })}
        onSort={() => void lists.sortAlphabetically()}
        onReorder={() => void lists.toggleReorder()}
        categoriesExpanded={lists.categories.some((category) => isExpanded(category.id))}
        onToggleCategories={
          lists.categories.length > 0
            ? () => {
                setCollapsed((current) => {
                  const expanded = lists.categories.some((category) => isExpanded(category.id, current));
                  const next: Record<string, boolean> = {};
                  for (const category of lists.categories) next[category.id] = expanded;
                  return next;
                });
              }
            : undefined
        }
      />
      {lists.reorderMode ? <p className="px-4 pb-2 text-center text-sm text-[var(--teal)]">גררו לסידור, ולחצו שוב על כפתור הסידור לשמירה</p> : null}
      {lists.error ? <p className="mx-4 mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{lists.error}</p> : null}
      {mode === "grocery" && searchOpen && needle ? (
        <ul className="mx-4 mb-3 overflow-hidden rounded-xl bg-white shadow-sm">
          {searchResults.length === 0 ? <li className="px-3 py-3 text-sm text-neutral-500">לא נמצאו מוצרים במלאי</li> : null}
          {searchResults.map((item) => (
            <li key={item.id}>
              <div
                role="button"
                tabIndex={0}
                className="flex w-full items-center gap-3 px-3 py-2 text-start"
                onClick={() => void lists.addToGrocery(item.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    void lists.addToGrocery(item.id);
                  }
                }}
              >
                <ImageBubble
                  src={lists.imageSrc("item", item.id, item.image_path)}
                  label={item.name}
                  size="size-9"
                  onOpen={() => openImage("item", item.id, item.name, item.image_path)}
                />
                <span className="min-w-0 flex-1 text-start">
                  <span className="block truncate">{item.name}</span>
                  {item.comments ? <span className="block truncate text-xs text-neutral-500">{item.comments}</span> : null}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={visibleCategories.map((category) => category.id)} strategy={verticalListSortingStrategy}>
          <div className="px-3 pb-4">
            {visibleCategories.length === 0 ? (
              <p className="px-4 pt-16 text-center text-neutral-500">
                {mode === "inventory" ? "אין עדיין קטגוריות. לחצו על + כדי להוסיף קטגוריה." : "רשימת הקניות ריקה. חפשו מוצר כדי להוסיף אותו."}
              </p>
            ) : null}
            {visibleCategories.map((category) => {
              const open = isExpanded(category.id);
              const categoryItems = itemsFor(category);
              const productCount = lists.items.filter((item) => item.category_id === category.id).length;
              return (
                <SortableBlock key={category.id} id={category.id}>
                  {(handle) => (
                    <section className="mb-2">
                      {mode === "grocery" && !lists.reorderMode ? (
                        <div
                          className="relative mb-1 flex cursor-pointer items-center rounded-md bg-[var(--bar)] py-1"
                          onClick={() => toggleCategory(category.id)}
                        >
                          <div className="flex-1 text-center text-sm font-medium">{category.name}</div>
                          <div className="absolute end-1 flex items-center gap-2">
                            <button
                              type="button"
                              className="grid size-8 place-items-center text-[var(--orange)]"
                              aria-label="הוספת מוצר חדש"
                              onClick={(event) => {
                                event.stopPropagation();
                                setEditor({ kind: "new-item", categoryId: category.id });
                              }}
                            >
                              <PlusIcon className="size-4" />
                            </button>
                            <button
                              type="button"
                              className="grid size-8 place-items-center text-neutral-600"
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
                          onOpenImage={() => openImage("category", category.id, category.name, category.image_path)}
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
            {mode === "grocery" && !lists.reorderMode && cartItems.length > 0 ? (
              <section className="mt-6">
                <div className="mb-2 rounded-md bg-[#e7f3ef] py-2 text-center text-sm font-medium">בעגלת הקניות</div>
                {cartItems.map((item) => (
                  <EntityCard
                    key={item.id}
                    nested
                    name={item.name}
                    comment={item.comments}
                    color={colorHex(lists.categories.find((category) => category.id === item.category_id)?.color)}
                    src={lists.imageSrc("item", item.id, item.image_path)}
                    onOpenImage={() => openImage("item", item.id, item.name, item.image_path)}
                    onDots={() => setEditor({ kind: "item", id: item.id })}
                    onClick={() => void lists.setChecked(item.id, false)}
                  />
                ))}
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
  onOpenImage?: () => void;
  onAdd?: () => void;
  onDots?: () => void;
  onClick?: () => void;
}) {
  return (
    <div
      dir="rtl"
      onClick={onClick}
      className={`relative mb-1 flex items-center gap-1.5 overflow-hidden rounded-lg py-1 pe-1 ps-2.5 shadow-sm ${highlighted ? "bg-[#d7efe9]" : "bg-white"} ${onClick ? "cursor-pointer" : ""} ${nested ? "ms-6 w-[calc(100%-1.5rem)]" : ""}`}
    >
      <span className="absolute inset-y-0 start-0 w-1.5" style={{ background: color }} />
      <ImageBubble src={src} label={name} onOpen={onOpenImage} size="size-8" />
      <div className="min-w-0 flex-1 text-start text-sm leading-tight">
        <div className="flex min-w-0 items-baseline gap-1">
          <span className="truncate">{name}</span>
          {count != null ? (
            <span className="shrink-0 min-w-4 rounded-full bg-neutral-200 px-1 text-center text-[10px] font-semibold leading-4 text-neutral-600">
              {count}
            </span>
          ) : null}
        </div>
        {comment ? <div className="truncate text-xs text-neutral-500">{comment}</div> : null}
      </div>
      {extra}
      <div className="flex shrink-0 items-center gap-2">
        {onAdd ? (
          <button
            type="button"
            className="grid size-8 place-items-center text-[var(--orange)]"
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
  );
}

function Stepper({ quantity, unitShort, onChange }: { quantity: number; unitShort: string; onChange: (quantity: number) => void }) {
  return (
    <div dir="ltr" className="flex items-center gap-1 text-sm" onClick={(event) => event.stopPropagation()}>
      <button type="button" aria-label="הפחתה" className="grid size-7 place-items-center rounded-full border border-neutral-300" onClick={() => onChange(quantity - 1)}>
        −
      </button>
      <span className="min-w-12 text-center">
        {formatQuantity(quantity)} {unitShort}
      </span>
      <button type="button" aria-label="הוספה" className="grid size-7 place-items-center rounded-full border border-neutral-300" onClick={() => onChange(quantity + 1)}>
        +
      </button>
    </div>
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
