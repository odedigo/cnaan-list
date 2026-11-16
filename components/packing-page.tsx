"use client";

/** Trip packing lists: named lists, colored categories, quantities, and checked items. */

import {
  closestCenter,
  DndContext,
  PointerSensor,
  TouchSensor,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { AppHeader } from "@/components/app-header";
import { useDataTransfer } from "@/components/data-transfer";
import { CheckIcon, ClearMarksIcon, CloseIcon, CopyIcon, DotsIcon, DownloadIcon, GripIcon, PenIcon, PlusIcon } from "@/components/icons";
import { useLists } from "@/components/lists-provider";
import { downloadPackingList } from "@/lib/export-inventory";
import { pushAppHistory, replaceAppHistory } from "@/lib/history";
import { sortByOrder } from "@/lib/order";
import type { PackingCategory, PackingItem, PackingList } from "@/lib/types";
import { formatQuantity, stepQuantity, unitById } from "@/lib/units";

type MenuState = { kind: "list" | "category" | "item"; id: string } | null;
type NamePrompt = { title: string; initial: string; onSave: (name: string) => void };
type ConfirmPrompt = { title: string; body: string; confirmLabel?: string; onConfirm: () => void };

export function PackingPage({ active }: { active: boolean }) {
  const lists = useLists();
  const transfer = useDataTransfer();
  const [listId, setListId] = useState<string | null>(null);
  const indexScroll = useRef(0);
  const [menu, setMenu] = useState<MenuState>(null);
  const [prompt, setPrompt] = useState<NamePrompt | null>(null);
  const [confirm, setConfirm] = useState<ConfirmPrompt | null>(null);
  const list = lists.packingLists.find((row) => row.id === listId) ?? null;
  const busy = lists.saving || Boolean(transfer?.busy);

  useEffect(() => {
    if (active) return;
    setMenu(null);
  }, [active]);

  useEffect(() => {
    const onPop = () => {
      if (window.location.pathname !== "/packing") return;
      setListId(readPackingHistory(window.history.state)?.listId ?? null);
      setMenu(null);
      if (!readPackingHistory(window.history.state)?.listId) window.scrollTo(0, indexScroll.current);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (!listId || !lists.packingReady) return;
    if (!lists.packingLists.some((row) => row.id === listId)) setListId(null);
  }, [listId, lists.packingLists, lists.packingReady]);

  function openList(id: string) {
    setMenu(null);
    indexScroll.current = window.scrollY;
    replaceAppHistory("/packing", { cnaanPacking: { listId: null } });
    pushAppHistory("/packing", { cnaanPacking: { listId: id } });
    setListId(id);
    window.scrollTo(0, 0);
  }

  function back() {
    if (readPackingHistory(window.history.state)?.listId) {
      window.history.back();
      return;
    }
    setListId(null);
  }

  return (
    <div className="min-h-[calc(100dvh-6rem)]">
      {lists.error ? <p className="mx-3 mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{lists.error}</p> : null}
      {!lists.packingReady ? (
        <>
          <AppHeader title="רשימות אריזה" actionsEnabled={false} />
          <p className="px-4 py-8 text-center text-neutral-500">לא ניתן לטעון את רשימות האריזה</p>
        </>
      ) : list ? (
        <PackingDetail
          list={list}
          categories={lists.packingCategories.filter((row) => row.list_id === list.id)}
          items={lists.packingItems}
          busy={busy}
          menu={menu}
          onMenu={setMenu}
          onBack={back}
          onAddCategory={() =>
            setPrompt({
              title: "הוספת קטגוריה",
              initial: "",
              onSave: (name) => void lists.addPackingCategory(list.id, name),
            })
          }
          onRenameCategory={(category) =>
            setPrompt({
              title: "שינוי שם",
              initial: category.name,
              onSave: (name) => void lists.renamePackingCategory(category.id, name),
            })
          }
          onDeleteCategory={(category) =>
            setConfirm({
              title: "מחיקת קטגוריה",
              body: `למחוק את "${category.name}" ואת הפריטים שבה?`,
              onConfirm: () => void lists.deletePackingCategory(category.id),
            })
          }
          onAddItem={(categoryId) =>
            setPrompt({
              title: "הוספת פריט",
              initial: "",
              onSave: (name) => void lists.addPackingItem(categoryId, name),
            })
          }
          onRenameItem={(item) =>
            setPrompt({
              title: "שינוי שם",
              initial: item.name,
              onSave: (name) => void lists.renamePackingItem(item.id, name),
            })
          }
          onDeleteItem={(item) =>
            setConfirm({
              title: "מחיקת פריט",
              body: `למחוק את "${item.name}"?`,
              onConfirm: () => void lists.deletePackingItem(item.id),
            })
          }
          onToggleItem={(item) => void lists.setPackingItemChecked(item.id, !item.checked)}
          onQuantity={(item, quantity) => void lists.setPackingItemQuantity(item.id, quantity)}
          onMoveCategory={(activeId, overId) => void lists.movePackingCategory(list.id, activeId, overId)}
          onMarkAll={() => void lists.setPackingListChecked(list.id, true)}
          onClearMarks={() => void lists.setPackingListChecked(list.id, false)}
          onSort={() => void lists.sortPackingItems(list.id)}
        />
      ) : (
        <PackingIndex
          rows={lists.packingLists}
          busy={busy}
          menu={menu}
          onMenu={setMenu}
          onOpen={openList}
          onAdd={() =>
            setPrompt({
              title: "הוספת רשימה",
              initial: "",
              onSave: (name) => void lists.addPackingList(name),
            })
          }
          onRename={(row) =>
            setPrompt({
              title: "שינוי שם הרשימה",
              initial: row.name,
              onSave: (name) => void lists.renamePackingList(row.id, name),
            })
          }
          onDelete={(row) =>
            setConfirm({
              title: "מחיקת רשימה",
              body: `למחוק את "${row.name}"?`,
              onConfirm: () => void lists.deletePackingList(row.id),
            })
          }
          onDuplicate={(row) =>
            setConfirm({
              title: "שכפול רשימה",
              body: `לשכפל את "${row.name}"?`,
              confirmLabel: "שכפול",
              onConfirm: () => void lists.duplicatePackingList(row.id),
            })
          }
          onMove={(activeId, overId) => void lists.movePackingList(activeId, overId)}
          onMarkAll={(row) => void lists.setPackingListChecked(row.id, true)}
          onClearMarks={(row) => void lists.setPackingListChecked(row.id, false)}
          onExport={(row) =>
            setConfirm({
              title: "ייצוא רשימה",
              body: `לייצא את "${row.name}"?`,
              confirmLabel: "ייצוא",
              onConfirm: () => downloadPackingList(row, lists.packingCategories, lists.packingItems),
            })
          }
          onImport={() => transfer?.requestPackingImport()}
        />
      )}
      {menu ? (
        <button type="button" className="fixed inset-0 z-20 cursor-default" aria-label="סגירת תפריט" onClick={() => setMenu(null)} />
      ) : null}
      {prompt ? (
        <NameDialog
          title={prompt.title}
          initial={prompt.initial}
          onClose={() => setPrompt(null)}
          onSave={(name) => {
            setPrompt(null);
            prompt.onSave(name);
          }}
        />
      ) : null}
      {confirm ? (
        <ConfirmDialog
          title={confirm.title}
          body={confirm.body}
          confirmLabel={confirm.confirmLabel}
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null);
            confirm.onConfirm();
          }}
        />
      ) : null}
    </div>
  );
}

function PackingIndex({
  rows,
  busy,
  menu,
  onMenu,
  onOpen,
  onAdd,
  onRename,
  onDelete,
  onDuplicate,
  onMove,
  onMarkAll,
  onClearMarks,
  onExport,
  onImport,
}: {
  rows: PackingList[];
  busy: boolean;
  menu: MenuState;
  onMenu: (menu: MenuState) => void;
  onOpen: (id: string) => void;
  onAdd: () => void;
  onRename: (row: PackingList) => void;
  onDelete: (row: PackingList) => void;
  onDuplicate: (row: PackingList) => void;
  onMove: (activeId: string, overId: string) => void;
  onMarkAll: (row: PackingList) => void;
  onClearMarks: (row: PackingList) => void;
  onExport: (row: PackingList) => void;
  onImport: () => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }));
  function onDragEnd(event: DragEndEvent) {
    const overId = event.over ? String(event.over.id) : "";
    const activeId = String(event.active.id);
    if (!overId || overId === activeId) return;
    onMove(activeId, overId);
  }
  return (
    <>
      <AppHeader
        title="רשימות אריזה"
        actionsEnabled={!busy}
        onHeaderPlus={onAdd}
        headerPlusLabel="הוספת רשימה"
        onImportList={onImport}
      />
      {rows.length === 0 ? <p className="px-4 py-8 text-center text-neutral-500">אין רשימות אריזה</p> : null}
      <DndContext id="packing-lists" sensors={sensors} collisionDetection={closestCenter} onDragStart={() => onMenu(null)} onDragEnd={onDragEnd}>
        <SortableContext items={rows.map((row) => row.id)} strategy={verticalListSortingStrategy}>
          <div className="px-3 pb-4 pt-3">
            {rows.map((row) => (
              <SortableRow key={row.id} id={row.id} raised={menu?.kind === "list" && menu.id === row.id}>
                {(handle) => (
                  <div dir="rtl" className="relative mb-2 flex items-center gap-1 rounded-lg bg-white py-2 pe-1 ps-3 shadow-sm">
                    <button type="button" className="min-w-0 flex-1 truncate text-start text-base" onClick={() => onOpen(row.id)}>
                      {row.name}
                    </button>
                    <div className="relative">
                      <button
                        type="button"
                        className="grid size-8 place-items-center text-neutral-500"
                        aria-label="פעולות הרשימה"
                        aria-expanded={menu?.kind === "list" && menu.id === row.id}
                        onClick={() => onMenu(menu?.kind === "list" && menu.id === row.id ? null : { kind: "list", id: row.id })}
                      >
                        <DotsIcon className="size-4" />
                      </button>
                      {menu?.kind === "list" && menu.id === row.id ? (
                        <div role="menu" className="absolute end-0 top-9 z-30 w-max min-w-48 rounded-xl bg-white py-1 text-start shadow-lg">
                          <RowMenuItem
                            label="שינוי שם הרשימה"
                            icon={<PenIcon className="size-5" />}
                            onClick={() => {
                              onMenu(null);
                              onRename(row);
                            }}
                          />
                          <RowMenuItem
                            label="סימון הכל"
                            icon={<CheckIcon className="size-5" />}
                            onClick={() => {
                              onMenu(null);
                              onMarkAll(row);
                            }}
                          />
                          <RowMenuItem
                            label="ביטול סימונים"
                            icon={<ClearMarksIcon className="size-5" />}
                            onClick={() => {
                              onMenu(null);
                              onClearMarks(row);
                            }}
                          />
                          <RowMenuItem
                            label="שכפול הרשימה"
                            icon={<CopyIcon className="size-5" />}
                            onClick={() => {
                              onMenu(null);
                              onDuplicate(row);
                            }}
                          />
                          <RowMenuItem
                            label="ייצוא הרשימה"
                            icon={<DownloadIcon className="size-5" />}
                            onClick={() => {
                              onMenu(null);
                              onExport(row);
                            }}
                          />
                          <RowMenuItem
                            label="מחיקת רשימה"
                            icon={<CloseIcon className="size-5" />}
                            onClick={() => {
                              onMenu(null);
                              onDelete(row);
                            }}
                          />
                        </div>
                      ) : null}
                    </div>
                    <button type="button" className="grid size-8 cursor-grab touch-none place-items-center text-neutral-500 active:cursor-grabbing" aria-label="גרירה" {...handle}>
                      <GripIcon className="size-5" />
                    </button>
                  </div>
                )}
              </SortableRow>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </>
  );
}

function PackingDetail({
  list,
  categories,
  items,
  busy,
  menu,
  onMenu,
  onBack,
  onAddCategory,
  onRenameCategory,
  onDeleteCategory,
  onAddItem,
  onRenameItem,
  onDeleteItem,
  onToggleItem,
  onQuantity,
  onMoveCategory,
  onMarkAll,
  onClearMarks,
  onSort,
}: {
  list: PackingList;
  categories: PackingCategory[];
  items: PackingItem[];
  busy: boolean;
  menu: MenuState;
  onMenu: (menu: MenuState) => void;
  onBack: () => void;
  onAddCategory: () => void;
  onRenameCategory: (category: PackingCategory) => void;
  onDeleteCategory: (category: PackingCategory) => void;
  onAddItem: (categoryId: string) => void;
  onRenameItem: (item: PackingItem) => void;
  onDeleteItem: (item: PackingItem) => void;
  onToggleItem: (item: PackingItem) => void;
  onQuantity: (item: PackingItem, quantity: number) => void;
  onMoveCategory: (activeId: string, overId: string) => void;
  onMarkAll: () => void;
  onClearMarks: () => void;
  onSort: () => void;
}) {
  const ordered = sortByOrder(categories);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [collapseReady, setCollapseReady] = useState(false);
  const collapseKey = `cnaanlist-packing-collapsed:${list.account_id}:${list.id}`;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }));

  useEffect(() => {
    setCollapsed(readCollapsed(collapseKey));
    setCollapseReady(true);
  }, [collapseKey]);

  useEffect(() => {
    if (!collapseReady) return;
    localStorage.setItem(collapseKey, JSON.stringify(collapsed));
  }, [collapseKey, collapseReady, collapsed]);

  function isOpen(id: string) {
    return collapsed[id] === false;
  }

  function toggleCategory(id: string) {
    setCollapsed((current) => ({ ...current, [id]: isOpen(id) }));
  }

  function onDragEnd(event: DragEndEvent) {
    const overId = event.over ? String(event.over.id) : "";
    const activeId = String(event.active.id);
    if (!overId || overId === activeId) return;
    onMoveCategory(activeId, overId);
  }

  return (
    <>
      <AppHeader
        title={list.name}
        actionsEnabled={!busy}
        onBack={onBack}
        onHeaderPlus={onAddCategory}
        headerPlusLabel="הוספת קטגוריה"
        onMarkAll={onMarkAll}
        onClearMarks={onClearMarks}
        onSortWithin={onSort}
      />
      {ordered.length === 0 ? <p className="px-4 py-8 text-center text-neutral-500">אין קטגוריות ברשימה</p> : null}
      <DndContext id="packing-categories" sensors={sensors} collisionDetection={closestCenter} onDragStart={() => onMenu(null)} onDragEnd={onDragEnd}>
        <SortableContext items={ordered.map((category) => category.id)} strategy={verticalListSortingStrategy}>
          <div className="px-3 pb-4 pt-3">
            {ordered.map((category) => {
              const categoryItems = sortByOrder(items.filter((item) => item.category_id === category.id));
              const checked = categoryItems.filter((item) => item.checked).length;
              const open = isOpen(category.id);
              return (
                <SortableRow key={category.id} id={category.id} raised={menu?.id === category.id || categoryItems.some((item) => menu?.kind === "item" && menu.id === item.id)}>
                  {(handle) => (
                    <div className="relative mb-2">
                      <div dir="rtl" className={`relative flex items-center gap-1 overflow-hidden rounded-lg bg-white py-2 pe-1 ps-3 shadow-sm ${open && categoryItems.length > 0 ? "mb-1" : ""}`}>
                        <span className="absolute inset-y-0 start-0 w-1.5" style={{ background: category.color }} />
                        <button type="button" className="flex min-w-0 flex-1 items-center gap-1 text-start" onClick={() => toggleCategory(category.id)}>
                          <span className="truncate text-base">{category.name}</span>
                          <span className="shrink-0 rounded-full bg-neutral-200 px-1.5 text-[10px] font-semibold leading-4 text-neutral-600">
                            {checked}/{categoryItems.length}
                          </span>
                        </button>
                        <button
                          type="button"
                          className="grid size-8 place-items-center text-black"
                          aria-label="הוספת פריט לקטגוריה"
                          onClick={() => {
                            setCollapsed((current) => ({ ...current, [category.id]: false }));
                            onAddItem(category.id);
                          }}
                        >
                          <PlusIcon className="size-4" />
                        </button>
                        <button
                          type="button"
                          className="grid size-8 place-items-center text-neutral-400"
                          aria-label="פרטים"
                          aria-expanded={menu?.kind === "category" && menu.id === category.id}
                          onClick={() => onMenu(menu?.kind === "category" && menu.id === category.id ? null : { kind: "category", id: category.id })}
                        >
                          <DotsIcon className="size-4" />
                        </button>
                        <button type="button" className="grid size-8 cursor-grab touch-none place-items-center text-neutral-500 active:cursor-grabbing" aria-label="גרירה" {...handle}>
                          <GripIcon className="size-5" />
                        </button>
                      </div>
                      {menu?.kind === "category" && menu.id === category.id ? (
                        <div role="menu" className="absolute end-10 top-12 z-30 w-max min-w-36 rounded-xl bg-white py-1 text-start shadow-lg">
                          <RowMenuItem
                            label="שינוי שם"
                            onClick={() => {
                              onMenu(null);
                              onRenameCategory(category);
                            }}
                          />
                          <RowMenuItem
                            label="מחיקה"
                            onClick={() => {
                              onMenu(null);
                              onDeleteCategory(category);
                            }}
                          />
                        </div>
                      ) : null}
                      {open
                        ? categoryItems.map((item) => (
                            <div
                              key={item.id}
                              dir="rtl"
                              className={`relative mb-1 ms-6 flex cursor-pointer items-center gap-1 rounded-lg py-2 pe-1 ps-3 shadow-sm ${item.checked ? "bg-neutral-200" : "bg-white"}`}
                              onClick={() => onToggleItem(item)}
                            >
                              <span className="min-w-0 flex-1 truncate text-start">{item.name}</span>
                              <Stepper quantity={item.quantity} onChange={(quantity) => onQuantity(item, quantity)} />
                              <div className="relative">
                                <button
                                  type="button"
                                  className="grid size-8 place-items-center text-neutral-400"
                                  aria-label="פרטים"
                                  aria-expanded={menu?.kind === "item" && menu.id === item.id}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    onMenu(menu?.kind === "item" && menu.id === item.id ? null : { kind: "item", id: item.id });
                                  }}
                                >
                                  <DotsIcon className="size-4" />
                                </button>
                                {menu?.kind === "item" && menu.id === item.id ? (
                                  <div role="menu" className="absolute end-0 top-9 z-30 w-max min-w-36 rounded-xl bg-white py-1 text-start shadow-lg" onClick={(event) => event.stopPropagation()}>
                                    <RowMenuItem
                                      label="שינוי שם"
                                      onClick={() => {
                                        onMenu(null);
                                        onRenameItem(item);
                                      }}
                                    />
                                    <RowMenuItem
                                      label="מחיקה"
                                      onClick={() => {
                                        onMenu(null);
                                        onDeleteItem(item);
                                      }}
                                    />
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          ))
                        : null}
                    </div>
                  )}
                </SortableRow>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </>
  );
}

function SortableRow({ id, raised, children }: { id: string; raised?: boolean; children: (handle: Record<string, unknown>) => ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.75 : 1,
        position: "relative",
        zIndex: raised ? 40 : undefined,
      }}
    >
      {children({ ...attributes, ...listeners })}
    </div>
  );
}

function Stepper({ quantity, onChange }: { quantity: number; onChange: (quantity: number) => void }) {
  return (
    <div dir="ltr" className="flex shrink-0 items-center gap-2 text-sm" onClick={(event) => event.stopPropagation()}>
      <button type="button" aria-label="הפחתה" className="grid size-6 place-items-center rounded-full border border-neutral-300" onClick={() => onChange(stepQuantity(quantity, -1))}>
        −
      </button>
      <span dir="rtl" className="min-w-8 px-0.5 text-center">
        <bdi>{formatQuantity(quantity)}</bdi> <bdi>{unitById("unit").short}</bdi>
      </span>
      <button type="button" aria-label="הוספה" className="grid size-6 place-items-center rounded-full border border-neutral-300" onClick={() => onChange(stepQuantity(quantity, 1))}>
        +
      </button>
    </div>
  );
}

function RowMenuItem({ label, icon, onClick }: { label: string; icon?: ReactNode; onClick: () => void }) {
  return (
    <button type="button" role="menuitem" className="flex w-full items-center gap-2 px-3 py-2.5 text-start text-sm" onClick={onClick}>
      {icon ? <span className="grid size-5 shrink-0 place-items-center">{icon}</span> : null}
      {label}
    </button>
  );
}

function NameDialog({ title, initial, onClose, onSave }: { title: string; initial: string; onClose: () => void; onSave: (name: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <form
        className="w-full max-w-xs rounded-2xl bg-white p-4 text-start"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(value);
        }}
      >
        <p className="text-sm font-semibold">{title}</p>
        <input
          autoFocus
          value={value}
          maxLength={80}
          onChange={(event) => setValue(event.target.value)}
          className="mt-3 w-full rounded-xl border border-neutral-300 px-3 py-2 outline-none focus:border-[var(--teal)]"
          aria-label={title}
        />
        <button type="submit" className="mt-4 w-full rounded-xl bg-[var(--teal)] py-3 font-medium text-white">
          שמירה
        </button>
        <button type="button" className="mt-2 w-full rounded-xl bg-neutral-100 py-3 font-medium text-neutral-700" onClick={onClose}>
          ביטול
        </button>
      </form>
    </div>
  );
}

function ConfirmDialog({ title, body, confirmLabel = "מחיקה", onClose, onConfirm }: { title: string; body: string; confirmLabel?: string; onClose: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-xs rounded-2xl bg-white p-4 text-start">
        <p className="text-sm font-medium">{body}</p>
        <button type="button" className={`mt-4 w-full rounded-xl py-3 font-medium text-white ${confirmLabel === "מחיקה" ? "bg-red-600" : "bg-[var(--teal)]"}`} onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button type="button" className="mt-2 w-full rounded-xl bg-neutral-100 py-3 font-medium text-neutral-700" onClick={onClose}>
          ביטול
        </button>
      </div>
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

function readPackingHistory(state: unknown) {
  if (!state || typeof state !== "object" || !("cnaanPacking" in state)) return null;
  const entry = (state as { cnaanPacking?: { listId?: unknown } }).cnaanPacking;
  if (!entry || typeof entry !== "object") return null;
  return { listId: typeof entry.listId === "string" ? entry.listId : null };
}
