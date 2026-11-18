"use client";

/** Full-screen family chart. It stays available in portrait and in landscape. */

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";

import { ChevronIcon, FolderIcon, HomeIcon, LinkIcon, PlusIcon, SearchIcon, TrashIcon } from "@/components/icons";
import { CARD_H, CARD_W, layoutTree, rootPersonId } from "@/lib/family-layout";
import { personLabel, personName, UNION_STATUSES, unionStatusLabel, type FamilyGraph, type FamilyLink, type FamilyPerson, type FamilyPersonBrief, type FamilyTree, type PersonDraft, type SpouseInput, type UnionStatus } from "@/lib/family-trees";

type View = { x: number; y: number; scale: number };

const MAX_SCALE = 2.6;

export function TreeEditor({
  name,
  graph,
  error,
  busy,
  onBack,
  showHome,
  onHome,
  onCreatePerson,
  onSavePerson,
  onAddSpouse,
  onSetUnionStatus,
  onAddChild,
  onAddParents,
  onDeletePerson,
  onLoadImage,
  onPersonImage,
  links,
  trees,
  focusPersonId,
  focusToken,
  onOpenLink,
  onLinkPerson,
  onUnlinkPerson,
  onLoadTreePeople,
}: {
  name: string;
  graph: FamilyGraph | null;
  error: string;
  busy: boolean;
  onBack: () => void;
  showHome: boolean;
  onHome: () => void;
  onCreatePerson: () => Promise<string | null>;
  onSavePerson: (personId: string, draft: PersonDraft) => Promise<boolean>;
  onAddSpouse: (personId: string, input: SpouseInput) => Promise<string | null>;
  onSetUnionStatus: (unionId: string, status: UnionStatus) => Promise<void>;
  onAddChild: (personId: string) => Promise<string | null>;
  onAddParents: (personId: string) => Promise<string | null>;
  onDeletePerson: (personId: string) => Promise<void>;
  onLoadImage: (path: string) => Promise<Blob | null>;
  onPersonImage: (personId: string, file: File | null) => Promise<void>;
  links: Record<string, FamilyLink[]>;
  trees: FamilyTree[];
  focusPersonId: string | null;
  focusToken: number;
  onOpenLink: (treeId: string, personId: string) => void;
  onLinkPerson: (personId: string, otherId: string) => Promise<void>;
  onUnlinkPerson: (personId: string) => Promise<void>;
  onLoadTreePeople: (treeId: string) => Promise<FamilyPersonBrief[]>;
}) {
  const [ready, setReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [jump, setJump] = useState<{ id: string; token: number } | null>(null);
  const [linkMenu, setLinkMenu] = useState<{ x: number; y: number; links: FamilyLink[] } | null>(null);
  const appliedFocus = useRef(0);

  useEffect(() => setReady(true), []);
  useEffect(() => {
    document.documentElement.dataset.allowLandscape = "1";
    return () => {
      delete document.documentElement.dataset.allowLandscape;
    };
  }, []);
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  useEffect(() => {
    if (!focusPersonId || !focusToken || appliedFocus.current === focusToken) return;
    if (!graph?.people.some((person) => person.id === focusPersonId)) return;
    appliedFocus.current = focusToken;
    setSelectedId(focusPersonId);
    setDetailsOpen(false);
    setLinkMenu(null);
    setJump({ id: focusPersonId, token: focusToken });
  }, [focusPersonId, focusToken, graph]);
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
      {error ? <p className="mx-3 mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <Chart
        name={name}
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
        onLoadImage={onLoadImage}
        links={links}
        onOpenLinks={(personId, x, y) => {
          const list = links[personId] ?? [];
          if (list.length === 0) return;
          if (list.length === 1) {
            onOpenLink(list[0].treeId, list[0].personId);
            return;
          }
          setLinkMenu({ x, y, links: list });
        }}
      />
      <div className="absolute start-3 top-3 z-20 flex items-start gap-2">
        <button type="button" className="grid size-10 shrink-0 place-items-center rounded-full bg-white shadow" aria-label="חזרה" onClick={onBack}>
          <ChevronIcon className="size-6 rotate-90" />
        </button>
        {showHome ? (
          <button type="button" className="grid size-10 shrink-0 place-items-center rounded-full bg-white shadow" aria-label="רשימת העצים" onClick={onHome}>
            <HomeIcon className="size-6" />
          </button>
        ) : null}
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
      </div>
      {graph && selected && detailsOpen ? (
        <PersonDialog
          person={selected}
          graph={graph}
          busy={busy}
          hasParents={Boolean(graph?.children.some((link) => link.person_id === selected.id))}
          onLoadImage={onLoadImage}
          onClose={() => setDetailsOpen(false)}
          onSave={async (draft) => {
            const saved = await onSavePerson(selected.id, draft);
            if (saved) setDetailsOpen(false);
          }}
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
          links={links[selected.id] ?? []}
          otherTrees={trees.filter((row) => row.id !== selected.tree_id)}
          onOpenLink={onOpenLink}
          onLinkPerson={(otherId) => onLinkPerson(selected.id, otherId)}
          onUnlink={() => onUnlinkPerson(selected.id)}
          onLoadTreePeople={onLoadTreePeople}
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
      {linkMenu ? (
        <>
          <button type="button" className="fixed inset-0 z-[94] cursor-default" aria-label="סגירת קישורים" onClick={() => setLinkMenu(null)} />
          <div dir="rtl" role="menu" className="fixed z-[95] max-h-64 w-64 overflow-y-auto rounded-xl bg-white py-1 text-start shadow-lg" style={{ top: linkMenu.y, left: Math.max(8, Math.min(linkMenu.x, window.innerWidth - 272)) }}>
            {linkMenu.links.map((link) => (
              <button
                key={link.personId}
                type="button"
                role="menuitem"
                className="block w-full px-3 py-2 text-start"
                onClick={() => {
                  setLinkMenu(null);
                  onOpenLink(link.treeId, link.personId);
                }}
              >
                <span className="block truncate font-medium">{link.treeName}</span>
                <span className="block truncate text-sm text-neutral-500">{link.label}</span>
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );

  return createPortal(panel, document.body);
}

function Chart({
  name,
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
  onLoadImage,
  links,
  onOpenLinks,
}: {
  name: string;
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
  onLoadImage: (path: string) => Promise<Blob | null>;
  links: Record<string, FamilyLink[]>;
  onOpenLinks: (personId: string, x: number, y: number) => void;
}) {
  const canvas = useRef<SVGSVGElement>(null);
  const placed = useRef(new Map<string, { x: number; y: number }>());
  const appliedJump = useRef(0);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef({ x: 0, y: 0, moved: false });
  const press = useRef<string | null>(null);
  const linkPress = useRef<{ id: string; x: number; y: number } | null>(null);
  const pinch = useRef({ dist: 0, x: 0, y: 0 });
  const [view, setView] = useState<View>({ x: 24, y: 24, scale: 1 });
  const focusId = graph
    ? selectedId && graph.people.some((person) => person.id === selectedId)
      ? selectedId
      : rootPersonId(graph.people, graph.children)
    : null;
  const linkedIds = useMemo(() => new Set(Object.keys(links).filter((id) => (links[id]?.length ?? 0) > 0)), [links]);
  const layout = useMemo(
    () => (graph && graph.people.length > 0 ? layoutTree(graph.people, graph.unions, graph.children, linkedIds) : { boxes: [], lines: [] }),
    [graph, linkedIds],
  );
  const byId = useMemo(() => new Map(graph?.people.map((person) => [person.id, person]) ?? []), [graph]);
  const photos = usePersonPhotos(graph?.people, onLoadImage);

  useLayoutEffect(() => {
    const node = canvas.current;
    if (!node || layout.boxes.length === 0) return;
    const place = () => {
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
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(node);
    return () => observer.disconnect();
  }, [layout.boxes, selectedId]);

  useEffect(() => {
    const node = canvas.current;
    if (!node || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.deltaY === 0) return;
      const point = localPoint(node, event.clientX, event.clientY);
      const pixels = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * node.clientHeight : event.deltaY;
      setView((current) => zoomAt(current, Math.exp(-pixels * 0.0015), point.x, point.y, point.x, point.y));
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [layout.boxes.length]);

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
      y: rect.height / 2 - (box.y + box.height / 2),
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
    const linkId = event.target instanceof Element ? event.target.closest("[data-link]")?.getAttribute("data-link") : null;
    linkPress.current = linkId ? { id: linkId, x: event.clientX, y: event.clientY } : null;
    press.current = linkId || !(event.target instanceof Element) ? null : event.target.closest("[data-person]")?.getAttribute("data-person") ?? null;
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
    const link = linkPress.current;
    press.current = null;
    linkPress.current = null;
    if (pointers.current.size > 0 || drag.current.moved) return;
    if (link) {
      onOpenLinks(link.id, link.x, link.y);
      return;
    }
    if (!id) {
      onDismiss();
      return;
    }
    onSelect(id);
  }

  return (
    <div className="relative min-h-0 flex-1">
      <p
        className="pointer-events-none absolute inset-x-0 top-2 z-0 flex h-10 items-center justify-center truncate text-lg"
        style={{ color: "#a3a3a3", paddingInline: "11rem" }}
      >
        {name}
      </p>
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
          className="relative z-[1] h-full w-full touch-none"
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
              const photo = person.image_path ? photos[person.image_path] : "";
              const cardH = box.height || CARD_H;
              const linked = (links[person.id]?.length ?? 0) > 0;
              const photoX = box.x + 8;
              const photoY = box.y + (cardH - 28) / 2;
              const title = nodeTitle(person);
              const lived = years(person);
              const nameX = box.x + CARD_W / 2 + (photo ? 10 : 0);
              const nameLimit = photo ? 14 : 18;
              const sexLabel = person.sex === "m" ? "זכר" : person.sex === "f" ? "נקבה" : "";
              return (
                <g
                  key={person.id}
                  data-person={person.id}
                  role="button"
                  tabIndex={0}
                  aria-label={[title.label, sexLabel, person.deceased ? "נפטר" : ""].filter(Boolean).join(", ")}
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
                    height={cardH}
                    rx={12}
                    fill={active ? "#d7efe9" : "#fff"}
                    stroke={linked ? "#c45c12" : active ? "#128f86" : "#e5e5e5"}
                    strokeWidth={linked || active ? 2.5 : 1}
                  />
                  {linked ? (
                    <foreignObject x={box.x + 4} y={box.y + cardH - 24} width={22} height={22}>
                      <button
                        type="button"
                        data-link={person.id}
                        className="grid size-5 place-items-center rounded-full bg-white text-[#c45c12] shadow"
                        aria-label="קישורים לעצים אחרים"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenLinks(person.id, event.clientX, event.clientY);
                        }}
                      >
                        <LinkIcon className="size-3.5" />
                      </button>
                    </foreignObject>
                  ) : null}
                  {person.sex === "m" || person.sex === "f" ? <GenderMark sex={person.sex} x={box.x + 5} y={box.y + 4} /> : null}
                  {person.deceased ? (
                    <svg x={box.x + CARD_W - 22} y={box.y + 6} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#737373" strokeWidth="1.8" aria-hidden="true">
                      <path d="M12 10.2c1.3-1.7 1.3-3.4 0-5.2-1.3 1.8-1.3 3.5 0 5.2Z" strokeLinejoin="round" />
                      <path d="M9 10.2h6V18a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-7.8Z" strokeLinejoin="round" />
                    </svg>
                  ) : null}
                  {photo ? (
                    <foreignObject x={photoX} y={photoY} width={28} height={28} style={{ pointerEvents: "none" }}>
                      <img src={photo} alt="" width={28} height={28} style={{ display: "block", width: 28, height: 28, borderRadius: 14, objectFit: "cover" }} />
                    </foreignObject>
                  ) : null}
                  <text x={nameX} y={box.y + (title.sub ? (lived ? 20 : 28) : 30)} textAnchor="middle" direction="rtl" fill="#171717" style={{ fontSize: 15, fontWeight: 700 }}>
                    {shorten(title.main, nameLimit)}
                  </text>
                  {title.sub ? (
                    <text x={nameX} y={box.y + (lived ? 36 : 48)} textAnchor="middle" direction="ltr" fill="#404040" style={{ fontSize: 11, fontWeight: 400, unicodeBidi: "isolate" }}>
                      {shorten(title.sub, photo ? 18 : 24)}
                    </text>
                  ) : null}
                  <text x={box.x + CARD_W / 2} y={box.y + (title.sub && lived ? 54 : 52)} textAnchor="middle" direction="ltr" fill="#737373" style={{ fontSize: 12, unicodeBidi: "isolate" }}>
                    {shorten(lived, 22)}
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

function usePersonPhotos(people: FamilyPerson[] | undefined, load: (path: string) => Promise<Blob | null>) {
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const paths = useMemo(() => [...new Set((people ?? []).flatMap((person) => (person.image_path ? [person.image_path] : [])))].sort(), [people]);
  const key = paths.join("\n");
  useEffect(() => {
    if (!key) {
      setPhotos({});
      return;
    }
    let cancelled = false;
    const created: string[] = [];
    void Promise.all(
      key.split("\n").map(async (path) => {
        const blob = await load(path);
        if (!blob) return [path, ""] as const;
        const url = URL.createObjectURL(blob);
        created.push(url);
        return [path, url] as const;
      }),
    ).then((pairs) => {
      if (cancelled) {
        for (const url of created) URL.revokeObjectURL(url);
        return;
      }
      setPhotos(Object.fromEntries(pairs.filter((pair) => pair[1])));
    });
    return () => {
      cancelled = true;
      for (const url of created) URL.revokeObjectURL(url);
    };
  }, [key, load]);
  return photos;
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
      <button type="button" className="grid size-10 place-items-center rounded-full bg-white shadow" aria-label="חיפוש אדם" onClick={onOpen}>
        <SearchIcon className="size-5 text-neutral-500" />
      </button>
    );
  }
  return (
    <div className="w-64">
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
  links,
  otherTrees,
  onOpenLink,
  onLinkPerson,
  onUnlink,
  onLoadTreePeople,
}: {
  person: FamilyPerson;
  graph: FamilyGraph;
  busy: boolean;
  hasParents: boolean;
  links: FamilyLink[];
  otherTrees: FamilyTree[];
  onOpenLink: (treeId: string, personId: string) => void;
  onLinkPerson: (otherId: string) => Promise<void>;
  onUnlink: () => Promise<void>;
  onLoadTreePeople: (treeId: string) => Promise<FamilyPersonBrief[]>;
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
  const [photoOpen, setPhotoOpen] = useState(false);
  const [tab, setTab] = useState<PersonTab>("details");
  useEffect(() => setDraft(draftOf(person)), [person]);
  useEffect(() => {
    setSpouseName("");
    setSpouseStatus("married");
    setPhotoOpen(false);
    setTab("details");
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
  const compact = useCompactDialog();

  function setField<Key extends keyof PersonDraft>(key: Key, value: PersonDraft[Key]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-2" role="dialog" aria-modal="true" aria-label={personName(person)}>
      <form
        className="flex flex-col overflow-hidden rounded-2xl bg-white p-4 text-start"
        style={{ width: "min(1040px, calc(100vw - 1rem))", height: "min(720px, calc(100dvh - 1rem))", fontSize: "1rem", zoom: compact ? 0.86 : 1 }}
        onSubmit={(event) => {
          event.preventDefault();
          void onSave(draft);
        }}
      >
        <div className="flex items-center gap-3">
          {src ? (
            <button type="button" className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-full bg-neutral-100" aria-label={`הגדלת התמונה של ${personName(person)}`} onClick={() => setPhotoOpen(true)}>
              <img src={src} alt="" className="size-full object-cover" />
            </button>
          ) : (
            <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-full bg-neutral-100 text-neutral-400" style={{ fontSize: "0.75rem" }}>אין תמונה</span>
          )}
          <p className="min-w-0 font-semibold" style={{ fontSize: "1.15rem" }}>{personName(person)}</p>
        </div>
        <div role="tablist" aria-label="פרטי האדם" className="mt-3 flex shrink-0 flex-wrap gap-1 border-b border-neutral-200">
          {personTabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className="px-2 py-1.5 font-medium"
              style={{ borderBottom: tab === item.id ? "3px solid var(--teal)" : "3px solid transparent", color: tab === item.id ? "#171717" : "#737373" }}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div role="tabpanel" className="mt-4 min-h-0 flex-1 overflow-y-auto">
          {tab === "details" ? (
            <div className="grid gap-4">
              <Field label="שם פרטי" value={draft.given_name} maxLength={80} onChange={(value) => setField("given_name", value)} />
              <Field label="שם משפחה" value={draft.surname} maxLength={80} onChange={(value) => setField("surname", value)} />
              <Field label="שם פרטי בעברית" value={draft.hebrew_given} maxLength={80} onChange={(value) => setField("hebrew_given", value)} />
              <Field label="שם משפחה בעברית" value={draft.hebrew_surname} maxLength={80} onChange={(value) => setField("hebrew_surname", value)} />
              <label className="block">
                <span className="text-neutral-600">מין</span>
                <select className="mt-1 w-full rounded-xl border border-neutral-300 bg-white py-2 ps-3 outline-none" style={{ fontSize: "1rem" }} value={draft.sex} onChange={(event) => setField("sex", event.target.value as PersonDraft["sex"])}>
                  <option value="m">זכר</option>
                  <option value="f">נקבה</option>
                  <option value="u">לא ידוע</option>
                </select>
              </label>
              <label className="flex items-center gap-3">
                <input type="checkbox" className="size-5" checked={draft.deceased} onChange={(event) => setField("deceased", event.target.checked)} />
                <span>נפטר/ה</span>
              </label>
            </div>
          ) : null}
          {tab === "photo" ? (
            <div className="relative flex h-full min-h-64 items-center justify-center overflow-hidden rounded-2xl bg-neutral-100">
              {src ? (
                <button type="button" className="flex h-full max-h-full w-full items-center justify-center" aria-label={`הגדלת התמונה של ${personName(person)}`} onClick={() => setPhotoOpen(true)}>
                  <img src={src} alt="" className="max-h-full max-w-full object-contain" />
                </button>
              ) : (
                <span className="text-neutral-500" style={{ fontSize: "1rem" }}>אין תמונה</span>
              )}
              <div className="absolute bottom-3 start-3 flex gap-2">
                <button
                  type="button"
                  className="grid size-9 place-items-center rounded-full bg-white text-neutral-800 shadow disabled:opacity-40"
                  aria-label={src ? "החלפת תמונה" : "הוספת תמונה"}
                  disabled={busy}
                  onClick={() => fileRef.current?.click()}
                >
                  {src ? <FolderIcon className="size-5" /> : <PlusIcon className="size-5" />}
                </button>
                {src ? (
                  <button
                    type="button"
                    className="grid size-9 place-items-center rounded-full bg-white text-red-700 shadow disabled:opacity-40"
                    aria-label="הסרת תמונה"
                    disabled={busy}
                    onClick={() => onImage(null)}
                  >
                    <TrashIcon className="size-5" />
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
          {tab === "dates" ? (
            <div className="grid gap-4">
              <DateField label="תאריך לידה" value={draft.birth_date} onChange={(value) => setField("birth_date", value)} />
              <Field label="מקום לידה" value={draft.birth_place} maxLength={120} onChange={(value) => setField("birth_place", value)} />
              <DateField
                label="תאריך פטירה"
                value={draft.death_date}
                onChange={(value) => setDraft((current) => ({ ...current, death_date: value, deceased: value.trim() ? true : current.deceased }))}
              />
              <Field label="מקום פטירה" value={draft.death_place} maxLength={120} onChange={(value) => setField("death_place", value)} />
            </div>
          ) : null}
          {tab === "family" ? (
            <div>
              <p className="text-neutral-600">בן/בת זוג</p>
              {spouses.length === 0 ? <p className="mt-2 text-neutral-500">אין</p> : null}
              <ul className="mt-3 flex flex-col gap-3">
                {spouses.map((link) => (
                  <li key={link.unionId} className="flex flex-col gap-2">
                    <button type="button" className="min-w-0 truncate rounded-xl bg-neutral-100 px-3 py-2 text-start" onClick={() => onOpenPerson(link.person.id)}>
                      {personName(link.person)}
                    </button>
                    <select
                      className="w-full rounded-xl border border-neutral-300 bg-white py-2 ps-3 outline-none"
                      style={{ fontSize: "1rem" }}
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
              <div className="mt-4 grid gap-2">
                <input
                  value={spouseName}
                  maxLength={80}
                  onChange={(event) => setSpouseName(event.target.value)}
                  placeholder="שם"
                  aria-label="שם בן או בת הזוג"
                  className="w-full rounded-xl border border-neutral-300 px-3 py-2 outline-none"
                  style={{ fontSize: "1rem" }}
                />
                <select className="w-full rounded-xl border border-neutral-300 bg-white py-2 ps-3 outline-none" style={{ fontSize: "1rem" }} aria-label="סטטוס הזוגיות" value={spouseStatus} onChange={(event) => setSpouseStatus(event.target.value as UnionStatus)}>
                  {UNION_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {unionStatusLabel(status)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="rounded-xl bg-neutral-100 px-3 py-2 font-medium disabled:opacity-40"
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
            </div>
          ) : null}
          {tab === "children" ? (
            <div>
              <ChildList personId={person.id} graph={graph} onOpenPerson={onOpenPerson} />
              <button type="button" className="mt-4 rounded-xl bg-neutral-100 px-3 py-2 font-medium text-neutral-800 disabled:opacity-40" disabled={busy} onClick={() => void onAddChild()}>
                הוספת ילד
              </button>
            </div>
          ) : null}
          {tab === "links" ? (
            <PersonLinks
              links={links}
              otherTrees={otherTrees}
              busy={busy}
              onOpenLink={onOpenLink}
              onLinkPerson={onLinkPerson}
              onUnlink={onUnlink}
              onLoadTreePeople={onLoadTreePeople}
            />
          ) : null}
          {tab === "connections" ? <ConnectionSummary personId={person.id} graph={graph} onOpenPerson={onOpenPerson} /> : null}
          {tab === "note" ? (
            <label className="block">
              <span className="text-neutral-600">הערה</span>
              <textarea value={draft.note} maxLength={1000} rows={8} onChange={(event) => setField("note", event.target.value)} className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 outline-none" style={{ fontSize: "1rem" }} aria-label="הערה" />
            </label>
          ) : null}
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
        <button type="button" className="mt-3 shrink-0 self-start rounded-xl bg-neutral-100 px-3 py-2 font-medium text-neutral-800 disabled:opacity-40" disabled={busy || hasParents} onClick={() => void onAddParents()}>
          הוספת הורים
        </button>
        <div className="mt-3 flex shrink-0 items-center gap-2">
          <button type="submit" className="rounded-xl bg-[var(--teal)] px-3 py-2 font-medium text-white disabled:opacity-40" disabled={busy}>
            שמירה
          </button>
          <button type="button" className="rounded-xl bg-neutral-100 px-3 py-2 font-medium text-neutral-700" onClick={onClose}>
            ביטול
          </button>
          <button type="button" className="ms-auto grid size-9 shrink-0 place-items-center rounded-full bg-red-50 text-red-700 disabled:opacity-40" aria-label="מחיקה" disabled={busy} onClick={onDelete}>
            <TrashIcon className="size-5" />
          </button>
        </div>
      </form>
      {photoOpen && src ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-6" role="dialog" aria-modal="true" aria-label={personName(person)} onClick={() => setPhotoOpen(false)}>
          <img src={src} alt={personName(person)} className="max-h-[80vh] max-w-full rounded-lg object-contain" />
        </div>
      ) : null}
    </div>
  );
}

type PersonTab = "details" | "photo" | "dates" | "family" | "children" | "links" | "connections" | "note";

const personTabs: { id: PersonTab; label: string }[] = [
  { id: "details", label: "פרטים" },
  { id: "photo", label: "תמונה" },
  { id: "dates", label: "תאריכים" },
  { id: "family", label: "בני זוג" },
  { id: "children", label: "ילדים" },
  { id: "links", label: "קישורים" },
  { id: "connections", label: "קשרים" },
  { id: "note", label: "הערה" },
];

function PersonLinks({
  links,
  otherTrees,
  busy,
  onOpenLink,
  onLinkPerson,
  onUnlink,
  onLoadTreePeople,
}: {
  links: FamilyLink[];
  otherTrees: FamilyTree[];
  busy: boolean;
  onOpenLink: (treeId: string, personId: string) => void;
  onLinkPerson: (otherId: string) => Promise<void>;
  onUnlink: () => Promise<void>;
  onLoadTreePeople: (treeId: string) => Promise<FamilyPersonBrief[]>;
}) {
  const [treeId, setTreeId] = useState("");
  const [people, setPeople] = useState<FamilyPersonBrief[]>([]);
  const [query, setQuery] = useState("");
  const linked = new Set(links.map((link) => link.personId));
  useEffect(() => {
    if (!treeId) {
      setPeople([]);
      return;
    }
    let cancel = false;
    onLoadTreePeople(treeId)
      .then((rows) => {
        if (!cancel) setPeople(rows);
      })
      .catch(() => {
        if (!cancel) setPeople([]);
      });
    return () => {
      cancel = true;
    };
  }, [onLoadTreePeople, treeId]);
  const needle = query.trim().toLocaleLowerCase("he");
  const matches = needle
    ? people.filter((person) => !linked.has(person.id) && personLabel(person).toLocaleLowerCase("he").includes(needle)).slice(0, 20)
    : [];
  return (
    <div className="grid gap-4">
      {links.length === 0 ? <p className="text-neutral-500">אין קישורים לעצים אחרים</p> : null}
      {links.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {links.map((link) => (
            <li key={link.personId} className="rounded-xl bg-neutral-100 px-3 py-2">
              <button type="button" className="block w-full truncate text-start font-medium" onClick={() => onOpenLink(link.treeId, link.personId)}>
                {link.label}
              </button>
              <p className="mt-1 truncate text-neutral-600">{link.treeName}</p>
            </li>
          ))}
        </ul>
      ) : null}
      {links.length > 0 ? (
        <button type="button" className="justify-self-start rounded-xl bg-neutral-100 px-3 py-2 font-medium text-red-700 disabled:opacity-40" disabled={busy} onClick={() => void onUnlink()}>
          ניתוק
        </button>
      ) : null}
      <label className="block">
        <span className="text-neutral-600">עץ אחר</span>
        <select className="mt-1 w-full rounded-xl border border-neutral-300 bg-white py-2 ps-3 outline-none" style={{ fontSize: "1rem" }} value={treeId} onChange={(event) => { setTreeId(event.target.value); setQuery(""); }}>
          <option value="">בחירת עץ</option>
          {otherTrees.map((tree) => (
            <option key={tree.id} value={tree.id}>{tree.name}</option>
          ))}
        </select>
      </label>
      {treeId ? (
        <label className="block">
          <span className="text-neutral-600">חיפוש אדם</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 outline-none" style={{ fontSize: "1rem" }} aria-label="חיפוש אדם בעץ אחר" />
        </label>
      ) : null}
      {matches.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {matches.map((person) => (
            <li key={person.id}>
              <button type="button" className="w-full truncate rounded-xl bg-neutral-100 px-3 py-2 text-start disabled:opacity-40" disabled={busy} onClick={() => void onLinkPerson(person.id).then(() => setQuery(""))}>
                {personLabel(person)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function useCompactDialog() {
  const [compact, setCompact] = useState(false);
  useLayoutEffect(() => {
    const query = window.matchMedia("(max-width: 700px)");
    const update = () => setCompact(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return compact;
}

function matchingPeople(people: FamilyPerson[], query: string) {
  const needle = query.trim().toLocaleLowerCase("he");
  if (!needle) return [];
  return people
    .filter((person) => `${personName(person)} ${person.hebrew_given} ${person.hebrew_surname}`.toLocaleLowerCase("he").includes(needle))
    .sort((a, b) => personName(a).localeCompare(personName(b), "he"))
    .slice(0, 20);
}

function Field({ label, value, maxLength, ltr = false, onChange }: { label: string; value: string; maxLength: number; ltr?: boolean; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-neutral-600">{label}</span>
      <input value={value} maxLength={maxLength} dir={ltr ? "ltr" : undefined} onChange={(event) => onChange(event.target.value)} className={`mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 outline-none ${ltr ? "text-end" : ""}`} style={{ fontSize: "1rem" }} aria-label={label} />
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
    <label className="block">
      <span className="text-neutral-600">{label}</span>
      <input
        type="date"
        value={iso}
        dir="ltr"
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-end outline-none"
        style={{ fontSize: "1rem" }}
        aria-label={label}
      />
      {value.trim() && !iso ? (
        <span dir="ltr" className="mt-1 block text-end text-sm text-neutral-500">
          {value}
        </span>
      ) : null}
    </label>
  );
}

function draftOf(person: FamilyPerson): PersonDraft {
  return {
    given_name: person.given_name,
    surname: person.surname,
    hebrew_given: person.hebrew_given,
    hebrew_surname: person.hebrew_surname,
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

function parentsOf(personId: string, graph: FamilyGraph, byId: Map<string, FamilyPerson>, unionById: Map<string, FamilyGraph["unions"][number]>) {
  const found: FamilyPerson[] = [];
  const seen = new Set<string>();
  for (const link of graph.children) {
    if (link.person_id !== personId) continue;
    const union = unionById.get(link.union_id);
    if (!union) continue;
    for (const parentId of [union.partner_a, union.partner_b]) {
      if (!parentId || seen.has(parentId)) continue;
      const parent = byId.get(parentId);
      if (!parent) continue;
      seen.add(parentId);
      found.push(parent);
    }
  }
  return found;
}

function ConnectionSummary({ personId, graph, onOpenPerson }: { personId: string; graph: FamilyGraph; onOpenPerson: (id: string) => void }) {
  const byId = new Map(graph.people.map((person) => [person.id, person]));
  const unionById = new Map(graph.unions.map((union) => [union.id, union]));
  const parents = parentsOf(personId, graph, byId, unionById);
  const grandSeen = new Set<string>();
  const grandparents: FamilyPerson[] = [];
  for (const parent of parents) {
    for (const grand of parentsOf(parent.id, graph, byId, unionById)) {
      if (grandSeen.has(grand.id)) continue;
      grandSeen.add(grand.id);
      grandparents.push(grand);
    }
  }
  const spouses = spouseLinks(personId, graph).filter((link) => link.status === "married").map((link) => link.person);

  return (
    <div className="grid gap-5">
      <ConnectionGroup title="סבים וסבתות" people={grandparents} onOpenPerson={onOpenPerson} />
      <ConnectionGroup title="הורים" people={parents} onOpenPerson={onOpenPerson} />
      <ConnectionGroup title="בן/בת זוג נוכחי" people={spouses} onOpenPerson={onOpenPerson} />
      <section>
        <h3 className="font-medium text-neutral-600">ילדים</h3>
        <ChildList personId={personId} graph={graph} onOpenPerson={onOpenPerson} bothNames />
      </section>
    </div>
  );
}

function childrenOf(personId: string, graph: FamilyGraph) {
  const byId = new Map(graph.people.map((person) => [person.id, person]));
  const children: { child: FamilyPerson; other: FamilyPerson | null }[] = [];
  const seen = new Set<string>();
  for (const union of graph.unions) {
    if (union.partner_a !== personId && union.partner_b !== personId) continue;
    const otherId = union.partner_a === personId ? union.partner_b : union.partner_a;
    const other = otherId ? byId.get(otherId) ?? null : null;
    const kids = graph.children.filter((link) => link.union_id === union.id).sort((a, b) => a.sort_order - b.sort_order);
    for (const link of kids) {
      if (seen.has(link.person_id)) continue;
      const child = byId.get(link.person_id);
      if (!child) continue;
      seen.add(child.id);
      children.push({ child, other });
    }
  }
  return children;
}

function ChildList({ personId, graph, onOpenPerson, bothNames = false }: { personId: string; graph: FamilyGraph; onOpenPerson: (id: string) => void; bothNames?: boolean }) {
  const children = childrenOf(personId, graph);
  if (children.length === 0) return <p className="text-neutral-500">אין</p>;
  return (
    <ul className="flex flex-col gap-2">
      {children.map(({ child, other }) => (
        <li key={child.id} className="rounded-xl bg-neutral-100 px-3 py-2">
          <button type="button" className="block w-full truncate text-start" onClick={() => onOpenPerson(child.id)}>
            {bothNames ? <PersonNames person={child} /> : <span className="font-medium">{personName(child)}</span>}
          </button>
          <p className="mt-1 text-neutral-600">
            ההורה השני:{" "}
            {other ? (
              <button type="button" className="text-neutral-900" onClick={() => onOpenPerson(other.id)}>
                {bothNames ? <PersonNames person={other} /> : <span className="font-medium">{personName(other)}</span>}
              </button>
            ) : (
              "לא ידוע"
            )}
          </p>
        </li>
      ))}
    </ul>
  );
}

function ConnectionGroup({ title, people, onOpenPerson }: { title: string; people: FamilyPerson[]; onOpenPerson: (id: string) => void }) {
  return (
    <section>
      <h3 className="font-medium text-neutral-600">{title}</h3>
      {people.length === 0 ? <p className="mt-1 text-neutral-500">אין</p> : null}
      <ul className="mt-2 flex flex-col gap-2">
        {people.map((person) => (
          <li key={person.id}>
            <button type="button" className="w-full truncate rounded-xl bg-neutral-100 px-3 py-2 text-start" onClick={() => onOpenPerson(person.id)}>
              <PersonNames person={person} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function splitName(value: string) {
  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { given: value.trim(), surname: "" };
  return { given: parts.slice(0, -1).join(" "), surname: parts[parts.length - 1] ?? "" };
}

function GenderMark({ sex, x, y }: { sex: "m" | "f"; x: number; y: number }) {
  const color = sex === "m" ? "#2563eb" : "#db2777";
  return (
    <svg x={x} y={y} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      {sex === "m" ? (
        <>
          <circle cx="10" cy="14.5" r="5" />
          <path d="M13.5 11 20 4.5" />
          <path d="M14.8 4.5H20V9.7" />
        </>
      ) : (
        <>
          <circle cx="12" cy="8.5" r="5" />
          <path d="M12 13.5V21" />
          <path d="M8.2 17.2h7.6" />
        </>
      )}
    </svg>
  );
}

function PersonNames({ person }: { person: FamilyPerson }) {
  const title = nodeTitle(person);
  const text = title.sub ? `${title.main} - ${title.sub}` : title.main;
  return <span className="font-medium">{text}</span>;
}

function nodeTitle(person: FamilyPerson) {
  const english = `${person.given_name} ${person.surname}`.replace(/\s+/g, " ").trim();
  const hebrew = `${person.hebrew_given ?? ""} ${person.hebrew_surname ?? ""}`.replace(/\s+/g, " ").trim();
  if (hebrew && english) return { main: hebrew, sub: english, label: `${hebrew} (${english})` };
  const main = hebrew || personName(person);
  return { main, sub: "", label: main };
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
