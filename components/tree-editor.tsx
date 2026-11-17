"use client";

/** Full-screen family chart. On a phone in portrait it asks to rotate. */

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";

import { ChevronIcon, SearchIcon } from "@/components/icons";
import { CARD_H, CARD_W, layoutTree, rootPersonId } from "@/lib/family-layout";
import { personName, UNION_STATUSES, unionStatusLabel, type FamilyGraph, type FamilyPerson, type PersonDraft, type SpouseInput, type UnionStatus } from "@/lib/family-trees";

type View = { x: number; y: number; scale: number };

const MAX_SCALE = 2.6;

export function TreeEditor({
  name,
  graph,
  error,
  busy,
  onBack,
  onCreatePerson,
  onSavePerson,
  onAddSpouse,
  onSetUnionStatus,
  onAddChild,
  onAddParents,
  onDeletePerson,
  onLoadImage,
  onPersonImage,
}: {
  name: string;
  graph: FamilyGraph | null;
  error: string;
  busy: boolean;
  onBack: () => void;
  onCreatePerson: () => Promise<string | null>;
  onSavePerson: (personId: string, draft: PersonDraft) => Promise<void>;
  onAddSpouse: (personId: string, input: SpouseInput) => Promise<string | null>;
  onSetUnionStatus: (unionId: string, status: UnionStatus) => Promise<void>;
  onAddChild: (personId: string) => Promise<string | null>;
  onAddParents: (personId: string) => Promise<string | null>;
  onDeletePerson: (personId: string) => Promise<void>;
  onLoadImage: (path: string) => Promise<Blob | null>;
  onPersonImage: (personId: string, file: File | null) => Promise<void>;
}) {
  const [ready, setReady] = useState(false);
  const portraitPhone = usePortraitPhone();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [jump, setJump] = useState<{ id: string; token: number } | null>(null);

  useEffect(() => setReady(true), []);
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  useEffect(() => {
    const orientation = window.screen?.orientation;
    if (!orientation?.lock) return;
    void orientation.lock("landscape").catch(() => undefined);
    return () => {
      void orientation.unlock?.();
    };
  }, []);
  useEffect(() => {
    if (!graph || !selectedId) return;
    if (graph.people.some((person) => person.id === selectedId)) return;
    setSelectedId(null);
    setDetailsOpen(false);
  }, [graph, selectedId]);

  if (!ready) return null;

  const selected = graph?.people.find((person) => person.id === selectedId) ?? null;
  const matches = matchingPeople(graph?.people ?? [], query);

  function jumpTo(id: string) {
    setSelectedId(id);
    setDetailsOpen(false);
    setQuery("");
    setSearchOpen(false);
    setJump({ id, token: Date.now() });
  }
  const panel = (
    <div dir="rtl" className="fixed inset-0 z-[80] flex flex-col bg-[var(--cream)] text-neutral-900" role="dialog" aria-modal="true" aria-label={name}>
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-neutral-200 bg-[var(--header)] px-1">
        <button type="button" className="grid size-10 place-items-center" aria-label="חזרה" onClick={onBack}>
          <ChevronIcon className="size-6 rotate-90" />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-center text-base font-semibold">{name}</h1>
        <span className="w-10 text-center text-sm text-neutral-600">{graph ? graph.people.length : ""}</span>
      </div>
      {error ? <p className="mx-3 mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {portraitPhone ? (
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <p className="text-2xl font-semibold">סובבו את המסך לרוחב</p>
          <p className="mt-3 text-neutral-600">עריכת העץ נפתחת לרוחב</p>
        </div>
      ) : (
        <>
        <Chart
          graph={graph}
          loading={!graph && !error}
          selectedId={selected?.id ?? null}
          detailsOpen={detailsOpen}
          busy={busy}
          jumpId={jump?.id ?? null}
          jumpToken={jump?.token ?? 0}
          onSelect={(id) => {
            setSelectedId(id);
            setDetailsOpen(true);
            setQuery("");
            setSearchOpen(false);
          }}
          onDismiss={() => setDetailsOpen(false)}
          onCreate={async () => {
            const id = await onCreatePerson();
            if (!id) return;
            setSelectedId(id);
            setDetailsOpen(true);
          }}
        />
        {graph && graph.people.length > 0 ? (
          <PersonSearch
            open={searchOpen}
            query={query}
            matches={matches}
            onOpen={() => setSearchOpen(true)}
            onClose={() => {
              setSearchOpen(false);
              setQuery("");
            }}
            onQuery={setQuery}
            onPick={jumpTo}
          />
        ) : null}
        </>
      )}
      {graph && selected && detailsOpen && !portraitPhone ? (
        <PersonDialog
          person={selected}
          graph={graph}
          busy={busy}
          hasParents={Boolean(graph?.children.some((link) => link.person_id === selected.id))}
          onLoadImage={onLoadImage}
          onClose={() => setDetailsOpen(false)}
          onSave={(draft) => onSavePerson(selected.id, draft)}
          onAddSpouse={(input) => onAddSpouse(selected.id, input)}
          onSetUnionStatus={onSetUnionStatus}
          onOpenPerson={(id) => {
            setSelectedId(id);
            setDetailsOpen(true);
            setJump({ id, token: Date.now() });
          }}
          onAddChild={() => onAddChild(selected.id)}
          onAddParents={() => onAddParents(selected.id)}
          onDelete={() => setConfirming(true)}
          onImage={(file) => onPersonImage(selected.id, file)}
        />
      ) : null}
      {confirming && selected ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="מחיקת אדם">
          <div className="w-full max-w-xs rounded-2xl bg-white p-4 text-start">
            <p className="text-sm font-medium">{`למחוק את "${personName(selected)}"?`}</p>
            <button
              type="button"
              className="mt-4 w-full rounded-xl bg-red-600 py-3 font-medium text-white disabled:opacity-40"
              disabled={busy}
              onClick={() => {
                const id = selected.id;
                setConfirming(false);
                setDetailsOpen(false);
                void onDeletePerson(id);
              }}
            >
              מחיקה
            </button>
            <button type="button" className="mt-2 w-full rounded-xl bg-neutral-100 py-3 font-medium text-neutral-700" onClick={() => setConfirming(false)}>
              ביטול
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );

  return createPortal(panel, document.body);
}

function Chart({
  graph,
  loading,
  selectedId,
  detailsOpen,
  busy,
  jumpId,
  jumpToken,
  onSelect,
  onDismiss,
  onCreate,
}: {
  graph: FamilyGraph | null;
  loading: boolean;
  selectedId: string | null;
  detailsOpen: boolean;
  busy: boolean;
  jumpId: string | null;
  jumpToken: number;
  onSelect: (id: string) => void;
  onDismiss: () => void;
  onCreate: () => void;
}) {
  const canvas = useRef<SVGSVGElement>(null);
  const placed = useRef(new Map<string, { x: number; y: number }>());
  const appliedJump = useRef(0);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef({ x: 0, y: 0, moved: false });
  const press = useRef<string | null>(null);
  const pinch = useRef({ dist: 0, x: 0, y: 0 });
  const [view, setView] = useState<View>({ x: 24, y: 24, scale: 1 });
  const focusId = graph
    ? selectedId && graph.people.some((person) => person.id === selectedId)
      ? selectedId
      : rootPersonId(graph.people, graph.children)
    : null;
  const layout = useMemo(
    () => (graph && graph.people.length > 0 ? layoutTree(graph.people, graph.unions, graph.children) : { boxes: [], lines: [] }),
    [graph],
  );
  const byId = useMemo(() => new Map(graph?.people.map((person) => [person.id, person]) ?? []), [graph]);

  useLayoutEffect(() => {
    const node = canvas.current;
    if (!node || layout.boxes.length === 0) return;
    const rect = node.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 40) return;
    const next = new Map(layout.boxes.map((box) => [box.id, box]));
    const previous = placed.current;
    const before = selectedId ? previous.get(selectedId) : undefined;
    const after = selectedId ? next.get(selectedId) : undefined;
    placed.current = next;
    if (before && after) {
      if (before.x === after.x && before.y === after.y) return;
      setView((current) => ({
        ...current,
        x: current.x + (before.x - after.x) * current.scale,
        y: current.y + (before.y - after.y) * current.scale,
      }));
      return;
    }
    const sameTree = layout.boxes.some((box) => previous.has(box.id));
    if (previous.size > 0 && sameTree) return;
    setView(centerView(layout.boxes, rect.width, rect.height));
  }, [layout.boxes, selectedId]);

  useLayoutEffect(() => {
    const node = canvas.current;
    const box = layout.boxes.find((item) => item.id === jumpId);
    if (!node || !box || !jumpToken || appliedJump.current === jumpToken) return;
    const rect = node.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 40) return;
    appliedJump.current = jumpToken;
    setView({
      scale: 1,
      x: rect.width / 2 - (box.x + CARD_W / 2),
      y: rect.height / 2 - (box.y + CARD_H / 2),
    });
  }, [jumpId, jumpToken, layout.boxes]);

  function zoomBy(factor: number) {
    const node = canvas.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    setView((current) => zoomAt(current, factor, rect.width / 2, rect.height / 2, rect.width / 2, rect.height / 2));
  }

  function onPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = localPoint(event.currentTarget, event.clientX, event.clientY);
    pointers.current.set(event.pointerId, point);
    drag.current = { x: point.x, y: point.y, moved: pointers.current.size > 1 };
    press.current = event.target instanceof Element ? event.target.closest("[data-person]")?.getAttribute("data-person") ?? null : null;
    if (pointers.current.size >= 2) pinch.current = pinchOf([...pointers.current.values()]);
  }

  function onPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    const point = localPoint(event.currentTarget, event.clientX, event.clientY);
    pointers.current.set(event.pointerId, point);
    if (pointers.current.size >= 2) {
      drag.current.moved = true;
      const next = pinchOf([...pointers.current.values()]);
      const previousPinch = pinch.current;
      if (previousPinch.dist > 0 && next.dist > 0) {
        setView((current) => zoomAt(current, next.dist / previousPinch.dist, next.x, next.y, previousPinch.x, previousPinch.y));
      }
      pinch.current = next;
      return;
    }
    if (Math.abs(point.x - drag.current.x) + Math.abs(point.y - drag.current.y) <= 8) return;
    drag.current.moved = true;
    setView((current) => ({ ...current, x: current.x + (point.x - previous.x), y: current.y + (point.y - previous.y) }));
  }

  function onPointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = { dist: 0, x: 0, y: 0 };
    const id = press.current;
    press.current = null;
    if (pointers.current.size > 0 || drag.current.moved) return;
    if (!id) {
      onDismiss();
      return;
    }
    onSelect(id);
  }

  return (
    <div className="relative min-h-0 flex-1">
      {loading ? <p className="px-6 pt-16 text-center text-neutral-500">טוען…</p> : null}
      {graph && graph.people.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-neutral-500">העץ ריק</p>
          <button type="button" className="rounded-xl bg-[var(--teal)] px-5 py-3 font-medium text-white disabled:opacity-40" disabled={busy} onClick={onCreate}>
            הוספת אדם
          </button>
        </div>
      ) : null}
      {graph && graph.people.length > 0 ? (
        <>
        <div className="absolute end-2 top-2 z-10 flex gap-2">
          <button type="button" className="grid size-10 place-items-center rounded-full bg-white text-lg shadow" aria-label="הקטנה" onClick={() => zoomBy(1 / 1.2)}>
            −
          </button>
          <button type="button" className="grid size-10 place-items-center rounded-full bg-white text-lg shadow" aria-label="הגדלה" onClick={() => zoomBy(1.2)}>
            +
          </button>
        </div>
        <svg
          ref={canvas}
          className="h-full w-full touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
            {layout.lines.map((line, index) => (
              <path key={index} d={linePath(line)} fill="none" stroke="#128f86" strokeWidth={2} />
            ))}
            {layout.boxes.map((box) => {
              const person = byId.get(box.id);
              if (!person) return null;
              const active = person.id === (selectedId ?? focusId);
              return (
                <g
                  key={person.id}
                  data-person={person.id}
                  role="button"
                  tabIndex={0}
                  aria-label={person.deceased ? `${personName(person)}, נפטר` : personName(person)}
                  aria-pressed={detailsOpen && active}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    onSelect(person.id);
                  }}
                >
                  <rect
                    x={box.x}
                    y={box.y}
                    width={CARD_W}
                    height={CARD_H}
                    rx={12}
                    fill={active ? "#d7efe9" : "#fff"}
                    stroke={active ? "#128f86" : "#e5e5e5"}
                    strokeWidth={active ? 2 : 1}
                  />
                  {person.deceased ? (
                    <svg x={box.x + CARD_W - 22} y={box.y + 6} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#737373" strokeWidth="1.8" aria-hidden="true">
                      <path d="M12 10.2c1.3-1.7 1.3-3.4 0-5.2-1.3 1.8-1.3 3.5 0 5.2Z" strokeLinejoin="round" />
                      <path d="M9 10.2h6V18a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-7.8Z" strokeLinejoin="round" />
                    </svg>
                  ) : null}
                  <text x={box.x + CARD_W / 2} y={box.y + 30} textAnchor="middle" direction="rtl" fill="#171717" style={{ fontSize: 15, fontWeight: 600 }}>
                    {shorten(personName(person), 18)}
                  </text>
                  <text x={box.x + CARD_W / 2} y={box.y + 52} textAnchor="middle" direction="ltr" fill="#737373" style={{ fontSize: 12, unicodeBidi: "isolate" }}>
                    {shorten(years(person), 22)}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
        </>
      ) : null}
    </div>
  );
}

function PersonSearch({
  open,
  query,
  matches,
  onOpen,
  onClose,
  onQuery,
  onPick,
}: {
  open: boolean;
  query: string;
  matches: FamilyPerson[];
  onOpen: () => void;
  onClose: () => void;
  onQuery: (value: string) => void;
  onPick: (id: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsOpen = open && query.trim().length > 0;
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);
  if (!open) {
    return (
      <button type="button" className="absolute start-3 top-16 z-20 grid size-10 place-items-center rounded-full bg-white shadow" aria-label="חיפוש אדם" onClick={onOpen}>
        <SearchIcon className="size-5 text-neutral-500" />
      </button>
    );
  }
  return (
    <div className="absolute start-3 top-16 z-20 w-64">
      <label className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 shadow">
        <button type="button" className="grid shrink-0 place-items-center" aria-label="סגירת חיפוש" onClick={onClose}>
          <SearchIcon className="size-5 text-neutral-500" />
        </button>
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") onClose();
          }}
          placeholder="חיפוש אדם"
          aria-label="חיפוש אדם"
          aria-expanded={resultsOpen}
          aria-controls="family-search-results"
          className="min-w-0 flex-1 bg-transparent outline-none"
        />
      </label>
      {resultsOpen ? (
        <ul id="family-search-results" role="listbox" className="mt-1 max-h-64 overflow-y-auto rounded-xl bg-white py-1 text-start shadow-lg">
          {matches.length === 0 ? <li className="px-3 py-2 text-sm text-neutral-500">אין תוצאות</li> : null}
          {matches.map((person) => (
            <li key={person.id}>
              <button type="button" role="option" className="w-full px-3 py-2 text-start" onClick={() => onPick(person.id)}>
                <span className="block truncate">{personName(person)}</span>
                {years(person) ? <span className="block truncate text-xs text-neutral-500" dir="ltr">{years(person)}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function PersonDialog({
  person,
  graph,
  busy,
  hasParents,
  onLoadImage,
  onClose,
  onSave,
  onAddSpouse,
  onSetUnionStatus,
  onOpenPerson,
  onAddChild,
  onAddParents,
  onDelete,
  onImage,
}: {
  person: FamilyPerson;
  graph: FamilyGraph;
  busy: boolean;
  hasParents: boolean;
  onLoadImage: (path: string) => Promise<Blob | null>;
  onClose: () => void;
  onSave: (draft: PersonDraft) => Promise<void>;
  onAddSpouse: (input: SpouseInput) => Promise<string | null>;
  onSetUnionStatus: (unionId: string, status: UnionStatus) => Promise<void>;
  onOpenPerson: (id: string) => void;
  onAddChild: () => Promise<string | null>;
  onAddParents: () => Promise<string | null>;
  onDelete: () => void;
  onImage: (file: File | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [draft, setDraft] = useState<PersonDraft>(draftOf(person));
  const [spouseName, setSpouseName] = useState("");
  const [spouseStatus, setSpouseStatus] = useState<UnionStatus>("married");
  useEffect(() => setDraft(draftOf(person)), [person]);
  useEffect(() => {
    setSpouseName("");
    setSpouseStatus("married");
  }, [person.id]);
  useEffect(() => {
    const path = person.image_path;
    if (!path) {
      setSrc(null);
      return;
    }
    let cancelled = false;
    let url = "";
    void onLoadImage(path).then((blob) => {
      if (cancelled || !blob) return;
      url = URL.createObjectURL(blob);
      setSrc(url);
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [onLoadImage, person.image_path]);

  const spouses = spouseLinks(person.id, graph);

  function setField<Key extends keyof PersonDraft>(key: Key, value: PersonDraft[Key]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={personName(person)}>
      <form
        className="w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-3 text-start"
        style={{ maxHeight: "68vh", minHeight: 0 }}
        onSubmit={(event) => {
          event.preventDefault();
          void onSave(draft);
        }}
      >
        <div className="flex items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-full bg-neutral-100 text-neutral-400">
            {src ? <img src={src} alt="" className="size-full object-cover" /> : <span className="text-xs">אין תמונה</span>}
          </span>
          <p className="min-w-0 text-base font-semibold">{personName(person)}</p>
        </div>
        <div className="mt-3 flex flex-col gap-2">
          <Field label="שם פרטי" value={draft.given_name} maxLength={80} onChange={(value) => setField("given_name", value)} />
          <Field label="שם משפחה" value={draft.surname} maxLength={80} onChange={(value) => setField("surname", value)} />
          <label className="block text-sm">
            <span className="text-neutral-600">מין</span>
            <select className="mt-1 w-full rounded-xl border border-neutral-300 bg-white py-2 ps-3 outline-none" value={draft.sex} onChange={(event) => setField("sex", event.target.value as PersonDraft["sex"])}>
              <option value="m">זכר</option>
              <option value="f">נקבה</option>
              <option value="u">לא ידוע</option>
            </select>
          </label>
          <DateField label="תאריך לידה" value={draft.birth_date} onChange={(value) => setField("birth_date", value)} />
          <Field label="מקום לידה" value={draft.birth_place} maxLength={120} onChange={(value) => setField("birth_place", value)} />
          <DateField
            label="תאריך פטירה"
            value={draft.death_date}
            onChange={(value) => setDraft((current) => ({ ...current, death_date: value, deceased: value.trim() ? true : current.deceased }))}
          />
          <Field label="מקום פטירה" value={draft.death_place} maxLength={120} onChange={(value) => setField("death_place", value)} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={draft.deceased} onChange={(event) => setField("deceased", event.target.checked)} />
            <span>נפטר/ה</span>
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">הערה</span>
            <textarea value={draft.note} maxLength={1000} rows={2} onChange={(event) => setField("note", event.target.value)} className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 outline-none" aria-label="הערה" />
          </label>
        </div>
        <div className="mt-4">
          <p className="text-sm text-neutral-600">בן/בת זוג</p>
          {spouses.length === 0 ? <p className="mt-1 text-sm text-neutral-500">אין</p> : null}
          <ul className="mt-2 flex flex-col gap-2">
            {spouses.map((link) => (
              <li key={link.unionId} className="flex items-center gap-2">
                <button type="button" className="min-w-0 flex-1 truncate rounded-xl bg-neutral-100 px-3 py-2 text-start" onClick={() => onOpenPerson(link.person.id)}>
                  {personName(link.person)}
                </button>
                <select
                  className="w-36 rounded-xl border border-neutral-300 bg-white py-2 ps-3 outline-none"
                  aria-label={`סטטוס של ${personName(link.person)}`}
                  value={link.status}
                  disabled={busy}
                  onChange={(event) => void onSetUnionStatus(link.unionId, event.target.value as UnionStatus)}
                >
                  {UNION_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {unionStatusLabel(status)}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center gap-2">
            <input
              value={spouseName}
              maxLength={80}
              onChange={(event) => setSpouseName(event.target.value)}
              placeholder="שם"
              aria-label="שם בן או בת הזוג"
              className="min-w-0 flex-1 rounded-xl border border-neutral-300 px-3 py-2 outline-none"
            />
            <select className="w-36 rounded-xl border border-neutral-300 bg-white py-2 ps-3 outline-none" aria-label="סטטוס הזוגיות" value={spouseStatus} onChange={(event) => setSpouseStatus(event.target.value as UnionStatus)}>
              {UNION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {unionStatusLabel(status)}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="mt-2 w-full rounded-xl bg-neutral-100 py-2.5 font-medium disabled:opacity-40"
            disabled={busy}
            onClick={() => {
              const typed = spouseName.trim();
              const match = typed ? graph.people.find((item) => item.id !== person.id && personName(item) === typed) : undefined;
              const parts = splitName(typed);
              void onAddSpouse({
                given_name: match ? match.given_name : parts.given,
                surname: match ? match.surname : parts.surname,
                status: spouseStatus,
                spouseId: match?.id ?? null,
              }).then((id) => {
                if (id) setSpouseName("");
              });
            }}
          >
            הוספה לעץ
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) onImage(file);
          }}
        />
        <button type="button" className="mt-4 w-full rounded-xl bg-neutral-100 py-2.5 font-medium disabled:opacity-40" disabled={busy} onClick={() => fileRef.current?.click()}>
          {person.image_path ? "החלפת תמונה" : "הוספת תמונה"}
        </button>
        {person.image_path ? (
          <button type="button" className="mt-2 w-full rounded-xl bg-neutral-100 py-2.5 font-medium text-red-700 disabled:opacity-40" disabled={busy} onClick={() => onImage(null)}>
            הסרת תמונה
          </button>
        ) : null}
        <button type="submit" className="mt-2 w-full rounded-xl bg-[var(--teal)] py-2.5 font-medium text-white disabled:opacity-40" disabled={busy}>
          שמירה
        </button>
        <ActionButton disabled={busy} onClick={() => void onAddChild()}>הוספת ילד</ActionButton>
        <ActionButton disabled={busy || hasParents} onClick={() => void onAddParents()}>הוספת הורים</ActionButton>
        <button type="button" className="mt-2 w-full rounded-xl bg-red-50 py-2.5 font-medium text-red-700 disabled:opacity-40" disabled={busy} onClick={onDelete}>
          מחיקה
        </button>
        <button type="button" className="mt-2 w-full rounded-xl bg-neutral-100 py-2.5 font-medium text-neutral-700" onClick={onClose}>
          סגירה
        </button>
      </form>
    </div>
  );
}

function matchingPeople(people: FamilyPerson[], query: string) {
  const needle = query.trim().toLocaleLowerCase("he");
  if (!needle) return [];
  return people
    .filter((person) => personName(person).toLocaleLowerCase("he").includes(needle))
    .sort((a, b) => personName(a).localeCompare(personName(b), "he"))
    .slice(0, 20);
}

function Field({ label, value, maxLength, ltr = false, onChange }: { label: string; value: string; maxLength: number; ltr?: boolean; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm">
      <span className="text-neutral-600">{label}</span>
      <input value={value} maxLength={maxLength} dir={ltr ? "ltr" : undefined} onChange={(event) => onChange(event.target.value)} className={`mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 outline-none ${ltr ? "text-end" : ""}`} aria-label={label} />
    </label>
  );
}

const DATE_MONTHS: Record<string, string> = {
  JAN: "01",
  FEB: "02",
  MAR: "03",
  APR: "04",
  MAY: "05",
  JUN: "06",
  JUL: "07",
  AUG: "08",
  SEP: "09",
  OCT: "10",
  NOV: "11",
  DEC: "12",
};

function calendarValue(value: string) {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  const month = match ? DATE_MONTHS[match[2].toUpperCase()] : "";
  if (!match || !month) return "";
  return `${match[3]}-${month}-${match[1].padStart(2, "0")}`;
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const iso = calendarValue(value);
  return (
    <label className="block text-sm">
      <span className="text-neutral-600">{label}</span>
      <input
        type="date"
        value={iso}
        dir="ltr"
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-end outline-none"
        aria-label={label}
      />
      {value.trim() && !iso ? (
        <span dir="ltr" className="mt-1 block text-end text-xs text-neutral-500">
          {value}
        </span>
      ) : null}
    </label>
  );
}

function ActionButton({ children, disabled, onClick }: { children: string; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" className="mt-2 w-full rounded-xl bg-neutral-100 py-2.5 font-medium text-neutral-800 disabled:opacity-40" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

function usePortraitPhone() {
  const [portraitPhone, setPortraitPhone] = useState(false);
  useLayoutEffect(() => {
    const query = window.matchMedia("(orientation: portrait) and (max-width: 900px) and (hover: none), (orientation: portrait) and (max-width: 900px) and (pointer: coarse)");
    const update = () => setPortraitPhone(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return portraitPhone;
}

function draftOf(person: FamilyPerson): PersonDraft {
  return {
    given_name: person.given_name,
    surname: person.surname,
    sex: person.sex,
    birth_date: person.birth_date,
    birth_place: person.birth_place,
    death_date: person.death_date,
    death_place: person.death_place,
    note: person.note,
    deceased: person.deceased,
  };
}

function spouseLinks(personId: string, graph: FamilyGraph) {
  const byId = new Map(graph.people.map((person) => [person.id, person]));
  const links: { unionId: string; person: FamilyPerson; status: UnionStatus }[] = [];
  for (const union of graph.unions) {
    const otherId = union.partner_a === personId ? union.partner_b : union.partner_b === personId ? union.partner_a : null;
    const person = otherId ? byId.get(otherId) : undefined;
    if (!person) continue;
    links.push({ unionId: union.id, person, status: union.status });
  }
  return links;
}

function splitName(value: string) {
  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { given: value.trim(), surname: "" };
  return { given: parts.slice(0, -1).join(" "), surname: parts[parts.length - 1] ?? "" };
}

function years(person: FamilyPerson) {
  if (person.birth_date && person.death_date) return `${person.birth_date} – ${person.death_date}`;
  if (person.birth_date && person.deceased) return `${person.birth_date} –`;
  if (person.death_date) return person.death_date;
  return person.birth_date;
}

function shorten(value: string, max: number) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function localPoint(node: SVGSVGElement, clientX: number, clientY: number) {
  const rect = node.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
}

function pinchOf(points: { x: number; y: number }[]) {
  const first = points[0];
  const second = points[1] ?? points[0];
  return { dist: Math.hypot(first.x - second.x, first.y - second.y), x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}

function centerView(boxes: { x: number; y: number }[], width: number, height: number): View {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const box of boxes) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + CARD_W);
    maxY = Math.max(maxY, box.y + CARD_H);
  }
  const scale = 1;
  return {
    scale,
    x: width / 2 - ((minX + maxX) / 2) * scale,
    y: height / 2 - ((minY + maxY) / 2) * scale,
  };
}

function zoomAt(view: View, factor: number, x: number, y: number, previousX: number, previousY: number): View {
  const scale = Math.min(MAX_SCALE, Math.max(view.scale * factor, 1e-4));
  const applied = scale / view.scale;
  return {
    scale,
    x: x - (x - view.x) * applied + (x - previousX),
    y: y - (y - view.y) * applied + (y - previousY),
  };
}

function linePath(line: { x1: number; y1: number; x2: number; y2: number }) {
  if (Math.abs(line.y1 - line.y2) < 2) return `M ${line.x1} ${line.y1} H ${line.x2}`;
  const mid = (line.y1 + line.y2) / 2;
  return `M ${line.x1} ${line.y1} V ${mid} H ${line.x2} V ${line.y2}`;
}
