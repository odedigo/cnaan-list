"use client";

/** Free-form lists page: indented lines, drag reorder, check-off, and a done section. */

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
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { flushSync } from "react-dom";

import { AppHeader } from "@/components/app-header";
import { ArrowIcon, CheckIcon, CloseIcon, FlagIcon, GripIcon } from "@/components/icons";
import { useLists } from "@/components/lists-provider";
import { activeEntries, changeIndent, doneEntries, type ChecklistEntry } from "@/lib/checklist";
import type { ChecklistPriority } from "@/lib/types";

const priorities: { id: ChecklistPriority; label: string; background: string; color: string }[] = [
  { id: "immediate", label: "מיידי", background: "#000000", color: "#ffffff" },
  { id: "high", label: "גבוה", background: "#f8d0d0", color: "#000000" },
  { id: "medium", label: "בינוני", background: "#ffd7b5", color: "#000000" },
  { id: "low", label: "נמוך", background: "#e5e5e5", color: "#000000" },
];

const placeholder = "טקסט כלשהו";

export function ChecklistPage({ active = true }: { active?: boolean }) {
  const lists = useLists();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const draftRef = useRef(draft);
  const selectedRef = useRef(selectedId);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const moved = useRef(false);
  const drag = useRef<{ id: string; x: number; y: number } | null>(null);
  const saveTimer = useRef(0);
  draftRef.current = draft;
  selectedRef.current = selectedId;

  const openRows = activeEntries(lists.checklist);
  const done = doneEntries(lists.checklist);

  useEffect(() => {
    return () => window.clearTimeout(saveTimer.current);
  }, []);

  useEffect(() => {
    if (selectedId && !lists.checklist.some((row) => row.id === selectedId)) setSelectedId(null);
  }, [lists.checklist, selectedId]);

  useEffect(() => {
    if (!menuId) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-priority-menu]")) return;
      setMenuId(null);
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [menuId]);

  useEffect(() => {
    if (active) return;
    setMenuId(null);
    const id = selectedRef.current;
    if (!id) return;
    window.clearTimeout(saveTimer.current);
    void lists.setChecklistBody(id, draftRef.current);
    setSelectedId(null);
  }, [active, lists]);

  useEffect(() => {
    if (!active || !selectedId) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-checklist-line]")) return;
      const id = selectedRef.current;
      if (!id) return;
      window.clearTimeout(saveTimer.current);
      void lists.setChecklistBody(id, draftRef.current);
      setSelectedId(null);
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [active, lists, selectedId]);

  function flushDraft(id: string | null, text: string) {
    window.clearTimeout(saveTimer.current);
    if (!id) return;
    void lists.setChecklistBody(id, text);
  }

  function select(id: string) {
    if (moved.current) {
      moved.current = false;
      return;
    }
    if (selectedRef.current && selectedRef.current !== id) flushDraft(selectedRef.current, draftRef.current);
    const row = lists.checklist.find((entry) => entry.id === id);
    flushSync(() => {
      setDraft(row?.body ?? "");
      setSelectedId(id);
    });
    inputRef.current?.focus();
  }

  function addTop() {
    if (selectedRef.current) flushDraft(selectedRef.current, draftRef.current);
    const id = lists.addChecklistRow({ at: "start" });
    if (!id) return;
    flushSync(() => {
      setDraft("");
      setSelectedId(id);
    });
    window.scrollTo(0, 0);
    inputRef.current?.focus();
  }

  function addSibling(id: string) {
    flushDraft(id, draftRef.current);
    const nextId = lists.addChecklistRow({ afterId: id });
    if (!nextId) return;
    flushSync(() => {
      setDraft("");
      setSelectedId(nextId);
    });
    inputRef.current?.focus();
    inputRef.current?.scrollIntoView({ block: "nearest" });
  }

  function changeDraft(id: string, value: string) {
    setDraft(value);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void lists.setChecklistBody(id, value);
    }, 350);
  }

  function commitDraft(id: string, value: string) {
    window.clearTimeout(saveTimer.current);
    void lists.setChecklistBody(id, value);
  }

  function remove(id: string) {
    window.clearTimeout(saveTimer.current);
    setSelectedId(null);
    setMenuId(null);
    void lists.deleteChecklistRow(id);
  }

  function toggleMenu(id: string) {
    setMenuId((current) => (current === id ? null : id));
  }

  function choosePriority(id: string, priority: ChecklistPriority) {
    const row = lists.checklist.find((entry) => entry.id === id);
    setMenuId(null);
    void lists.setChecklistPriority(id, row?.priority === priority ? null : priority);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  function onDragStart() {
    setMenuId(null);
  }

  function onDragEnd(event: DragEndEvent) {
    const overId = event.over ? String(event.over.id) : "";
    const activeDragId = String(event.active.id);
    if (!overId || overId === activeDragId) return;
    void lists.moveChecklist(activeDragId, overId);
  }

  const lineProps = {
    selectedId,
    draft,
    inputRef,
    drag,
    onSelect: select,
    onDraft: changeDraft,
    onCommit: commitDraft,
    onEnter: addSibling,
    onDelete: remove,
    onChecked: (id: string, checked: boolean) => {
      void lists.setChecklistChecked(id, checked);
    },
    onGestureStart: () => {
      moved.current = false;
    },
    onSwipe: (id: string, direction: "increase" | "decrease") => {
      moved.current = true;
      void lists.setChecklistIndent(id, direction);
    },
    menuId,
    onToggleMenu: toggleMenu,
    onPriority: choosePriority,
  };

  return (
    <div className="min-h-[calc(100dvh-6rem)]">
      <AppHeader title="רשימות" actionsEnabled onPlus={addTop} />
      {lists.checklistError ? (
        <p className="mx-3 mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{lists.checklistError}</p>
      ) : null}
      <DndContext id="checklist" sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="pb-4 pt-3">
          <SortableContext items={openRows.map((entry) => entry.row.id)} strategy={verticalListSortingStrategy}>
            {openRows.map((entry, index) => (
              <SortableChecklistLine key={entry.row.id} entry={entry} gap={rowGap(openRows, index)} {...lineProps} />
            ))}
          </SortableContext>
          {done.length > 0 ? <div className="mx-3 my-3 h-3 rounded-sm bg-neutral-300" /> : null}
          <SortableContext
            items={done.flatMap((entry) => (entry.kind === "item" ? [entry.row.id] : []))}
            strategy={verticalListSortingStrategy}
          >
            {done.map((entry, index) =>
              entry.kind === "parentCopy" ? (
                <div key={`copy-${entry.row.id}`} style={{ marginTop: rowGap(done, index) }}>
                  <ChecklistLine entry={entry} gap="" {...lineProps} />
                </div>
              ) : (
                <SortableChecklistLine key={entry.row.id} entry={entry} gap={rowGap(done, index)} {...lineProps} />
              ),
            )}
          </SortableContext>
        </div>
      </DndContext>
    </div>
  );
}

function rowGap(entries: ChecklistEntry[], index: number) {
  if (index === 0) return 0;
  const entry = entries[index];
  return entry.kind === "parentCopy" || entry.row.indent === 0 ? 4 : 2;
}

function SortableChecklistLine({
  gap,
  ...props
}: {
  entry: ChecklistEntry;
  gap: number;
  selectedId: string | null;
  draft: string;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  drag: RefObject<{ id: string; x: number; y: number } | null>;
  onSelect: (id: string) => void;
  onDraft: (id: string, value: string) => void;
  onCommit: (id: string, value: string) => void;
  onEnter: (id: string) => void;
  onDelete: (id: string) => void;
  onChecked: (id: string, checked: boolean) => void;
  onSwipe: (id: string, direction: "increase" | "decrease") => void;
  onGestureStart: () => void;
  menuId: string | null;
  onToggleMenu: (id: string) => void;
  onPriority: (id: string, priority: ChecklistPriority) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.entry.row.id });
  return (
    <div
      ref={setNodeRef}
      style={{ marginTop: gap, transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.75 : 1, position: "relative", zIndex: isDragging ? 2 : props.menuId === props.entry.row.id ? 4 : undefined }}
    >
      <ChecklistLine {...props} gap="" dragHandle={{ ...attributes, ...listeners }} />
    </div>
  );
}

function ChecklistLine({
  entry,
  selectedId,
  draft,
  inputRef,
  gap,
  drag,
  onSelect,
  onDraft,
  onCommit,
  onEnter,
  onDelete,
  onChecked,
  onSwipe,
  onGestureStart,
  menuId,
  onToggleMenu,
  onPriority,
  dragHandle,
}: {
  entry: ChecklistEntry;
  selectedId: string | null;
  draft: string;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  gap: string;
  drag: RefObject<{ id: string; x: number; y: number } | null>;
  onSelect: (id: string) => void;
  onDraft: (id: string, value: string) => void;
  onCommit: (id: string, value: string) => void;
  onEnter: (id: string) => void;
  onDelete: (id: string) => void;
  onChecked: (id: string, checked: boolean) => void;
  onSwipe: (id: string, direction: "increase" | "decrease") => void;
  onGestureStart: () => void;
  menuId: string | null;
  onToggleMenu: (id: string) => void;
  onPriority: (id: string, priority: ChecklistPriority) => void;
  dragHandle?: object;
}) {
  const handleProps = dragHandle as { onPointerDown?: (event: ReactPointerEvent<HTMLButtonElement>) => void } | undefined;
  const lists = useLists();
  const copy = entry.kind === "parentCopy";
  const row = entry.row;
  const selected = !copy && selectedId === row.id;
  const indent = !copy && row.indent === 1;
  const tone = priorities.find((item) => item.id === row.priority);
  const gray = (copy || row.checked) && !tone;
  const menuOpen = !copy && menuId === row.id;
  const indentDirection = row.indent === 1 ? "decrease" : "increase";
  const indentEnabled = !copy && changeIndent(lists.checklist, row.id, indentDirection) !== null;
  const priorityButtonRef = useRef<HTMLButtonElement>(null);
  const priorityMenuRef = useRef<HTMLDivElement>(null);
  const [priorityAbove, setPriorityAbove] = useState(false);
  useLayoutEffect(() => {
    if (!menuOpen) return;
    const button = priorityButtonRef.current;
    const menu = priorityMenuRef.current;
    if (!button || !menu) return;
    const buttonBox = button.getBoundingClientRect();
    const navTop = document.querySelector("nav")?.getBoundingClientRect().top ?? window.innerHeight;
    const spaceBelow = navTop - buttonBox.bottom;
    const spaceAbove = buttonBox.top;
    setPriorityAbove(spaceBelow < menu.offsetHeight + 8 && spaceAbove > spaceBelow);
  }, [menuOpen]);
  useEffect(() => {
    const element = inputRef.current;
    if (!selected || !element) return;
    element.style.height = "0px";
    element.style.height = `${element.scrollHeight}px`;
  }, [draft, inputRef, selected]);
  return (
    <div className={`flex items-center ${gap}`} data-checklist-line={copy ? undefined : ""}>
      <div
        className={`min-w-0 flex-1 touch-pan-y ${indent ? "ms-16" : "ms-3"} me-1`}
        onClick={(event) => {
          event.stopPropagation();
          if (!copy) onSelect(row.id);
        }}
        onPointerDown={(event) => {
          if (copy || event.button !== 0) return;
          const target = event.target;
          if (target instanceof Element && target.closest("button, input, textarea")) return;
          onGestureStart();
          drag.current = { id: row.id, x: event.clientX, y: event.clientY };
        }}
        onPointerUp={(event) => {
          const start = drag.current;
          drag.current = null;
          if (!start || start.id !== row.id) return;
          const dx = event.clientX - start.x;
          const dy = event.clientY - start.y;
          if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
          onSwipe(row.id, dx > 0 ? "increase" : "decrease");
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <div
          className={`flex items-center gap-1 rounded-lg px-1 ${gray ? "bg-neutral-200 text-neutral-500" : tone ? "" : "bg-white"} ${indent ? "" : "border"} ${copy ? "pointer-events-none" : ""}`}
          style={{ ...(indent ? {} : { borderColor: "#000" }), ...(tone ? { backgroundColor: tone.background, color: tone.color } : {}) }}
          aria-disabled={copy || undefined}
        >
          <CheckBox
            checked={copy || row.checked}
            disabled={copy}
            label={row.body}
            onToggle={copy ? undefined : () => onChecked(row.id, !row.checked)}
          />
          {selected ? (
            <textarea
              ref={inputRef}
              dir="rtl"
              rows={1}
              value={draft}
              maxLength={400}
              placeholder={placeholder}
              aria-label="טקסט השורה"
              className={`min-w-0 flex-1 resize-none overflow-hidden bg-transparent px-1 outline-none ${gray ? "text-neutral-500" : ""}`}
              style={{ paddingTop: 3, paddingBottom: 3, lineHeight: "20px" }}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => onDraft(row.id, event.target.value)}
              onBlur={(event) => onCommit(row.id, event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                onEnter(row.id);
              }}
            />
          ) : (
            <span className={`min-w-0 flex-1 whitespace-pre-wrap break-words px-1 ${row.body ? "" : "text-neutral-400"}`} style={{ paddingTop: 3, paddingBottom: 3, lineHeight: "20px" }}>{row.body || placeholder}</span>
          )}
          {copy ? null : (
            <>
              <button
                type="button"
                className="grid size-8 shrink-0 place-items-center text-neutral-500 disabled:opacity-30"
                style={{ height: 26 }}
                aria-label={indentDirection === "increase" ? "הזחה פנימה" : "הזחה החוצה"}
                disabled={!indentEnabled}
                onClick={(event) => {
                  event.stopPropagation();
                  onSwipe(row.id, indentDirection);
                }}
              >
                <ArrowIcon className={`size-5 ${indentDirection === "increase" ? "rotate-180" : ""}`} />
              </button>
              <button
                type="button"
                className="grid size-8 shrink-0 cursor-grab touch-none place-items-center text-neutral-400 active:cursor-grabbing"
                style={{ height: 26 }}
                aria-label="גרירה"
                {...handleProps}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  handleProps?.onPointerDown?.(event);
                }}
              >
                <GripIcon className="size-5" />
              </button>
            </>
          )}
        </div>
      </div>
      <div className="me-2 flex shrink-0 items-center">
        {copy ? (
          <span className="inline-block size-9" style={{ height: 28 }} />
        ) : (
          <div className="relative" data-priority-menu="">
            <button
              ref={priorityButtonRef}
              type="button"
              className="grid size-9 place-items-center text-neutral-500"
              style={{ height: 28 }}
              aria-label="עדיפות"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={(event) => {
                event.stopPropagation();
                onToggleMenu(row.id);
              }}
            >
              <FlagIcon className="size-5" />
            </button>
            {menuOpen ? (
              <div ref={priorityMenuRef} role="menu" aria-label="עדיפות" className="absolute z-30 overflow-hidden rounded-xl border border-neutral-200 bg-white py-1 text-neutral-800 shadow-lg" style={{ insetInlineEnd: 0, minWidth: "8.5rem", ...(priorityAbove ? { bottom: "100%", marginBottom: 4 } : { top: "100%", marginTop: 4 }) }}>
                {priorities.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={row.priority === item.id}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-start ${row.priority === item.id ? "font-semibold" : ""}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onPriority(row.id, item.id);
                    }}
                  >
                    <span className="size-4 shrink-0 rounded-[3px] border" style={{ backgroundColor: item.background, borderColor: "#000" }} />
                    {item.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        )}
        {selected ? (
          <button
            type="button"
            className="grid size-9 shrink-0 place-items-center"
            style={{ height: 28 }}
            aria-label="מחיקה"
            onClick={(event) => {
              event.stopPropagation();
              onDelete(row.id);
            }}
          >
            <CloseIcon className="size-5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function CheckBox({
  checked,
  disabled,
  label,
  onToggle,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onToggle?: () => void;
}) {
  const box = (
    <span className={`grid size-5 place-items-center rounded-[3px] border-2 bg-white ${disabled ? "border-neutral-400" : "border-neutral-800"}`}>
      {checked ? <CheckIcon className={`size-3.5 ${disabled ? "text-neutral-400" : ""}`} /> : null}
    </span>
  );
  if (!onToggle) return <span className="grid size-8 place-items-center" style={{ height: 26 }}>{box}</span>;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label ? `${checked ? "ביטול סימון" : "סימון"} ${label}` : checked ? "ביטול סימון" : "סימון"}
      className="grid size-8 shrink-0 place-items-center"
      style={{ height: 26 }}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      {box}
    </button>
  );
}
