"use client";

/** Full-screen family chart. It stays available in portrait and in landscape. */

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { ChevronIcon, CloseIcon, FolderIcon, HomeIcon, LegendIcon, LinkIcon, PlusIcon, SearchIcon, TrashIcon } from "@/components/icons";
import { CARD_H, CARD_W, FAMILY_LINE_COLORS, familyLineColors, layoutTree, rootPersonId, spousesOutsideFamily, type TreeBox, type TreeLine } from "@/lib/family-layout";
import { personLabel, personName, UNION_STATUSES, unionStatusLabel, type FamilyGraph, type FamilyLink, type FamilyPerson, type FamilyPersonBrief, type FamilyTree, type PersonDraft, type SpouseInput, type UnionStatus } from "@/lib/family-trees";
import { plainNote } from "@/lib/gedcom";
import { readTreeHebrewNames, treeHebrewNamesEvent } from "@/lib/tree-hebrew-names";

type View = { x: number; y: number; scale: number };

const MAX_SCALE = 2.6;

const SPOUSE_LINE_COLORS: Record<UnionStatus, string> = {
  married: "#128f86",
  divorced: "#dc2626",
  separated: "#d97706",
  widowed: "#737373",
  partner: "#7c3aed",
};

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
  onLoadGraph,
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
  onDeletePerson: (personId: string, alsoIds: string[]) => Promise<void>;
  onLoadImage: (path: string) => Promise<Blob | null>;
  onPersonImage: (personId: string, file: File | null) => Promise<void>;
  links: Record<string, FamilyLink[]>;
  trees: FamilyTree[];
  focusPersonId: string | null;
  focusToken: number;
  onLoadGraph: (treeId: string) => Promise<FamilyGraph>;
  onLinkPerson: (personId: string, otherId: string) => Promise<void>;
  onUnlinkPerson: (personId: string) => Promise<void>;
  onLoadTreePeople: (treeId: string) => Promise<FamilyPersonBrief[]>;
}) {
  const [ready, setReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [clearUpward, setClearUpward] = useState(false);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [jump, setJump] = useState<{ id: string; token: number } | null>(null);
  const [linkMenu, setLinkMenu] = useState<{ x: number; y: number; anchorId: string; links: FamilyLink[] } | null>(null);
  const [inset, setInset] = useState<EmbeddedTree | null>(null);
  const [hebrewNames, setHebrewNames] = useState(true);
  const appliedFocus = useRef(0);
  const insetRequest = useRef(0);

  useEffect(() => setReady(true), []);
  useEffect(() => {
    const sync = () => setHebrewNames(readTreeHebrewNames());
    sync();
    window.addEventListener(treeHebrewNamesEvent, sync);
    return () => window.removeEventListener(treeHebrewNamesEvent, sync);
  }, []);
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
  useEffect(() => {
    setInset(null);
  }, [graph?.people[0]?.tree_id]);

  function showLinked(anchorId: string, treeId: string, personId: string) {
    const treeName = trees.find((row) => row.id === treeId)?.name ?? "עץ";
    const request = insetRequest.current + 1;
    insetRequest.current = request;
    setDetailsOpen(false);
    setLinkMenu(null);
    setJump({ id: anchorId, token: Date.now() });
    setInset({ anchorId, treeId, treeName, personId, graph: null, loading: true, error: "", stamp: request });
    void onLoadGraph(treeId)
      .then((loaded) => {
        if (insetRequest.current !== request) return;
        const opened = graph ? peopleOnlyInTree(graph, loaded, personId) : null;
        if (opened && opened.people.every((person) => person.id === personId)) {
          setInset(null);
          return;
        }
        setInset((current) => (current && current.stamp === request ? { ...current, graph: loaded, loading: false } : current));
      })
      .catch(() => {
        if (insetRequest.current !== request) return;
        setInset((current) => (current && current.stamp === request ? { ...current, loading: false, error: "לא ניתן לטעון את העץ" } : current));
      });
  }

  if (!ready) return null;

  const selected = graph?.people.find((person) => person.id === selectedId) ?? null;
  const matches = matchingPeople(graph?.people ?? [], query);
  const relatedIds = confirming && selected && graph ? upwardIds(selected.id, graph) : [];

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
        hebrewNames={hebrewNames}
        inset={inset}
        onCloseInset={() => {
          insetRequest.current += 1;
          setInset(null);
        }}
        onOpenLinks={(personId, x, y) => {
          const list = links[personId] ?? [];
          if (list.length === 0) return;
          if (list.length === 1) {
            showLinked(personId, list[0].treeId, list[0].personId);
            return;
          }
          setLinkMenu({ x, y, anchorId: personId, links: list });
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
          <button type="button" className="grid size-10 shrink-0 place-items-center rounded-full bg-white shadow" aria-label="מקרא" onClick={() => setLegendOpen(true)}>
            <LegendIcon className="size-5 text-neutral-500" />
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
          onDelete={() => {
            setClearUpward(false);
            setConfirming(true);
          }}
          onImage={(file) => onPersonImage(selected.id, file)}
          links={links[selected.id] ?? []}
          otherTrees={trees.filter((row) => row.id !== selected.tree_id)}
          onOpenLink={(treeId, personId) => showLinked(selected.id, treeId, personId)}
          onLinkPerson={(otherId) => onLinkPerson(selected.id, otherId)}
          onUnlink={() => onUnlinkPerson(selected.id)}
          onLoadTreePeople={onLoadTreePeople}
        />
      ) : null}
      {legendOpen ? <ColorLegend onClose={() => setLegendOpen(false)} /> : null}
      {confirming && selected && graph ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="מחיקת אדם">
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 text-start">
            <p className="text-sm font-medium">{`למחוק את "${personName(selected)}"?`}</p>
            {relatedIds.length > 0 ? (
              <label className="mt-4 flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  className="size-5 accent-[var(--teal)]"
                  checked={clearUpward}
                  onChange={(event) => setClearUpward(event.target.checked)}
                />
                <span>{`למחוק גם אבות, אחים ובני זוג (${relatedIds.length})`}</span>
              </label>
            ) : null}
            <button
              type="button"
              className="mt-4 w-full rounded-xl bg-red-600 py-3 font-medium text-white disabled:opacity-40"
              disabled={busy}
              onClick={() => {
                const id = selected.id;
                const also = clearUpward ? relatedIds : [];
                setConfirming(false);
                setClearUpward(false);
                setDetailsOpen(false);
                void onDeletePerson(id, also);
              }}
            >
              מחיקה
            </button>
            <button
              type="button"
              className="mt-2 w-full rounded-xl bg-neutral-100 py-3 font-medium text-neutral-700"
              onClick={() => {
                setConfirming(false);
                setClearUpward(false);
              }}
            >
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
                  const anchorId = linkMenu.anchorId;
                  setLinkMenu(null);
                  showLinked(anchorId, link.treeId, link.personId);
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

type EmbeddedTree = {
  anchorId: string;
  treeId: string;
  treeName: string;
  personId: string;
  graph: FamilyGraph | null;
  loading: boolean;
  error: string;
  stamp: number;
};

type TreePanel = { x: number; y: number; w: number; h: number };

function embedScene(layout: { boxes: TreeBox[]; lines: TreeLine[] }, source: FamilyGraph | null, inset: EmbeddedTree | null) {
  const empty = {
    boxes: layout.boxes,
    lines: layout.lines,
    panels: [] as TreePanel[],
    focus: null as TreePanel | null,
    insetBoxes: [] as TreeBox[],
    insetLines: [] as TreeLine[],
    insetPeople: [] as FamilyPerson[],
    insetOutside: new Set<string>(),
    insetColor: new Map<string, string>(),
  };
  if (!inset || !source) return empty;
  const anchor = layout.boxes.find((box) => box.id === inset.anchorId);
  if (!anchor) return empty;
  if (!inset.graph) {
    const panel = { x: anchor.x + CARD_W + 36, y: anchor.y + anchor.height / 2 - 74, w: 220, h: 148 };
    const cleared = clearAround(layout, inset.anchorId, [panel], []);
    return { ...empty, boxes: cleared.boxes, lines: cleared.lines, panels: [panel], focus: panel };
  }
  const filtered = peopleOnlyInTree(source, inset.graph, inset.personId);
  const shown = filtered.people.filter((person) => person.id !== inset.personId);
  if (shown.length === 0) return empty;
  const other = layoutTree(filtered.people, filtered.unions, filtered.children);
  const ghost = other.boxes.find((box) => box.id === inset.personId);
  if (!ghost) return empty;
  const dx = anchor.x - ghost.x;
  const dy = anchor.y - ghost.y;
  const insetBoxes = other.boxes.filter((box) => box.id !== ghost.id).map((box) => ({ ...box, x: box.x + dx, y: box.y + dy }));
  const insetLines = other.lines.map((line) => shiftLine(line, dx, dy));
  const panels = groupAround(insetBoxes, anchor).flatMap((group) => {
    const panel = frameOf(group, anchor);
    return panel ? [panel] : [];
  });
  const cleared = clearAround(layout, inset.anchorId, panels, insetBoxes);
  const focus = unionPanel(panels);
  return {
    boxes: cleared.boxes,
    lines: cleared.lines,
    panels,
    focus,
    insetBoxes,
    insetLines,
    insetPeople: shown,
    insetOutside: spousesOutsideFamily(filtered.unions, filtered.children),
    insetColor: familyLineColors(filtered.unions, filtered.children),
  };
}

function peopleOnlyInTree(source: FamilyGraph, other: FamilyGraph, linkedPersonId: string): FamilyGraph {
  const sourceLinks = new Set(source.people.flatMap((person) => (person.link_id ? [person.link_id] : [])));
  const drop = new Set(
    other.people.filter((person) => person.id !== linkedPersonId && person.link_id !== null && sourceLinks.has(person.link_id)).map((person) => person.id),
  );
  const people = other.people.filter((person) => !drop.has(person.id));
  const ids = new Set(people.map((person) => person.id));
  const unions = other.unions.filter((union) => (union.partner_a && ids.has(union.partner_a)) || (union.partner_b && ids.has(union.partner_b)));
  const unionIds = new Set(unions.map((union) => union.id));
  const children = other.children.filter((link) => ids.has(link.person_id) && unionIds.has(link.union_id));
  return { people, unions, children };
}

function shiftLine(line: TreeLine, dx: number, dy: number): TreeLine {
  const points = line.points.map((point) => ({ x: point.x + dx, y: point.y + dy }));
  const first = points[0] ?? { x: line.x1 + dx, y: line.y1 + dy };
  const last = points[points.length - 1] ?? first;
  return { ...line, x1: first.x, y1: first.y, x2: last.x, y2: last.y, points };
}

function groupAround(boxes: TreeBox[], anchor: TreeBox) {
  const above: TreeBox[] = [];
  const below: TreeBox[] = [];
  const left: TreeBox[] = [];
  const right: TreeBox[] = [];
  for (const box of boxes) {
    const midY = box.y + box.height / 2;
    const midX = box.x + CARD_W / 2;
    if (midY < anchor.y) above.push(box);
    else if (midY > anchor.y + anchor.height) below.push(box);
    else if (midX < anchor.x) left.push(box);
    else right.push(box);
  }
  return [above, below, left, right].filter((group) => group.length > 0);
}

function frameOf(boxes: TreeBox[], anchor: TreeBox): TreePanel | null {
  const bounds = boundsOf(boxes);
  if (!bounds) return null;
  const pad = 28;
  const head = 36;
  const gap = 16;
  let x = bounds.minX - pad;
  let y = bounds.minY - pad - head;
  let right = bounds.minX + bounds.width + pad;
  let bottom = bounds.minY + bounds.height + pad;
  if (bounds.minY + bounds.height <= anchor.y + 1) bottom = Math.min(bottom, anchor.y - gap);
  if (bounds.minY >= anchor.y + anchor.height - 1) y = Math.max(y, anchor.y + anchor.height + gap);
  if (bounds.minX + bounds.width <= anchor.x + 1) right = Math.min(right, anchor.x - gap);
  if (bounds.minX >= anchor.x + CARD_W - 1) x = Math.max(x, anchor.x + CARD_W + gap);
  if (right - x < 20 || bottom - y < 20) return null;
  return { x, y, w: right - x, h: bottom - y };
}

function unionPanel(panels: TreePanel[]): TreePanel | null {
  if (panels.length === 0) return null;
  const x = Math.min(...panels.map((panel) => panel.x));
  const y = Math.min(...panels.map((panel) => panel.y));
  const right = Math.max(...panels.map((panel) => panel.x + panel.w));
  const bottom = Math.max(...panels.map((panel) => panel.y + panel.h));
  return { x, y, w: right - x, h: bottom - y };
}

function clearAround(source: { boxes: TreeBox[]; lines: TreeLine[] }, anchorId: string, panels: TreePanel[], obstacles: TreeBox[]) {
  const anchor = source.boxes.find((box) => box.id === anchorId);
  const zones = [...panels, ...obstacles.map((box) => ({ x: box.x, y: box.y, w: CARD_W, h: box.height }))];
  if (!anchor || zones.length === 0) return source;
  const blocked = zones.map((zone) => ({ x: zone.x - 12, y: zone.y - 12, w: zone.w + 24, h: zone.h + 24 }));
  let moving = source.boxes.filter((box) => box.id !== anchorId && blocked.some((zone) => rectsOverlap(boxRect(box), zone)));
  let guard = 0;
  while (guard < source.boxes.length) {
    guard += 1;
    const push = moving.length === 0 ? 0 : Math.max(...moving.map((box) => rightEdge(zones) + 36 - box.x), 0);
    const extra = source.boxes.filter((box) => box.id !== anchorId && !moving.some((item) => item.id === box.id) && moving.some((item) => rectsOverlap(boxRect({ ...item, x: item.x + push }), boxRect(box))));
    if (extra.length === 0) break;
    moving = [...moving, ...extra];
  }
  let push = moving.length === 0 ? 0 : Math.max(...moving.map((box) => rightEdge(zones) + 36 - box.x), 0);
  let slide = 0;
  while (slide < 12 && moving.some((box) => rectsOverlap(boxRect({ ...box, x: box.x + push }), boxRect(anchor)))) {
    push += CARD_W + 36;
    slide += 1;
  }
  const moved = new Map(moving.map((box) => [box.id, push]));
  const boxes = source.boxes.map((box) => (moved.has(box.id) ? { ...box, x: box.x + push } : box));
  const lines = source.lines.map((line) => retouchLine(line, source.boxes, moved, panels));
  return { boxes, lines };
}

function retouchLine(line: TreeLine, before: TreeBox[], moved: Map<string, number>, panels: TreePanel[]): TreeLine {
  const attached = line.points.flatMap((point) => {
    const host = before.find((box) => pointOnBox(point, box));
    return host ? [moved.get(host.id) ?? 0] : [];
  });
  const same = attached.length > 0 && attached.every((dx) => dx === attached[0]);
  const shifted = line.points.map((point) => {
    if (same) return { x: point.x + attached[0], y: point.y };
    const host = before.find((box) => pointOnBox(point, box));
    const dx = host ? moved.get(host.id) ?? 0 : 0;
    return { x: point.x + dx, y: point.y };
  });
  const points = routeOutside(shifted, panels);
  const first = points[0] ?? { x: line.x1, y: line.y1 };
  const last = points[points.length - 1] ?? first;
  return { ...line, x1: first.x, y1: first.y, x2: last.x, y2: last.y, points };
}

function routeOutside(points: { x: number; y: number }[], panels: TreePanel[]) {
  if (points.length === 0) return points;
  const safe = points.map((point) => panels.reduce((current, panel) => leavePanel(current, panel), point));
  const next = [safe[0]];
  for (let index = 1; index < safe.length; index += 1) next.push(...joinOutside(next[next.length - 1], safe[index], panels));
  return straighten(next);
}

function joinOutside(from: { x: number; y: number }, to: { x: number; y: number }, panels: TreePanel[]) {
  if (Math.hypot(from.x - to.x, from.y - to.y) < 0.5) return [];
  const across = elbow(from, to, true);
  if (pathClear(across, panels)) return across.slice(1);
  const down = elbow(from, to, false);
  if (pathClear(down, panels)) return down.slice(1);
  const hit = panels.find((panel) => !pathClear([from, to], [panel]));
  if (!hit) return across.slice(1);
  const rails = [rail(from, to, hit.y - 16), rail(from, to, hit.y + hit.h + 16), rail(from, to, hit.x - 16, true), rail(from, to, hit.x + hit.w + 16, true)];
  const clear = rails.find((path) => pathClear(path, panels));
  return (clear ?? aroundCorners(from, to, hit)).slice(1);
}

function elbow(from: { x: number; y: number }, to: { x: number; y: number }, horizontalFirst: boolean) {
  if (Math.abs(from.x - to.x) < 0.5 || Math.abs(from.y - to.y) < 0.5) return [from, to];
  return [from, horizontalFirst ? { x: to.x, y: from.y } : { x: from.x, y: to.y }, to];
}

function rail(from: { x: number; y: number }, to: { x: number; y: number }, edge: number, vertical = false) {
  if (vertical) return [from, { x: edge, y: from.y }, { x: edge, y: to.y }, to];
  return [from, { x: from.x, y: edge }, { x: to.x, y: edge }, to];
}

function aroundCorners(from: { x: number; y: number }, to: { x: number; y: number }, panel: TreePanel) {
  const gap = 16;
  const corners = [
    { x: panel.x - gap, y: panel.y - gap },
    { x: panel.x + panel.w + gap, y: panel.y - gap },
    { x: panel.x + panel.w + gap, y: panel.y + panel.h + gap },
    { x: panel.x - gap, y: panel.y + panel.h + gap },
  ];
  const start = nearestIndex(from, corners);
  const end = nearestIndex(to, corners);
  const paths = [walkCorners(corners, start, end, 1), walkCorners(corners, start, end, -1)].map((points) => orthogonalChain([from, ...points, to]));
  return paths.find((path) => pathClear(path, [panel])) ?? paths[0];
}

function orthogonalChain(points: { x: number; y: number }[]) {
  const next = [points[0]];
  for (let index = 1; index < points.length; index += 1) next.push(...elbow(next[next.length - 1], points[index], true).slice(1));
  return next;
}

function walkCorners(corners: { x: number; y: number }[], start: number, end: number, step: number) {
  const points = [corners[start]];
  let index = start;
  while (index !== end) {
    index = (index + step + corners.length) % corners.length;
    points.push(corners[index]);
  }
  return points;
}

function nearestIndex(point: { x: number; y: number }, corners: { x: number; y: number }[]) {
  let best = 0;
  corners.forEach((corner, index) => {
    if (Math.hypot(corner.x - point.x, corner.y - point.y) < Math.hypot(corners[best].x - point.x, corners[best].y - point.y)) best = index;
  });
  return best;
}

function pathClear(points: { x: number; y: number }[], panels: TreePanel[]) {
  if (points.some((point) => panels.some((panel) => insidePanel(point, panel)))) return false;
  for (let index = 1; index < points.length; index += 1) {
    if (panels.some((panel) => segmentHitsRect(points[index - 1], points[index], panel))) return false;
  }
  return true;
}

function segmentHitsRect(from: { x: number; y: number }, to: { x: number; y: number }, zone: TreePanel) {
  if (insidePanel(from, zone) || insidePanel(to, zone)) return true;
  const right = zone.x + zone.w;
  const bottom = zone.y + zone.h;
  if (Math.abs(from.y - to.y) <= 0.5) {
    const y = from.y;
    if (y <= zone.y || y >= bottom) return false;
    return Math.max(from.x, to.x) > zone.x && Math.min(from.x, to.x) < right;
  }
  if (Math.abs(from.x - to.x) <= 0.5) {
    const x = from.x;
    if (x <= zone.x || x >= right) return false;
    return Math.max(from.y, to.y) > zone.y && Math.min(from.y, to.y) < bottom;
  }
  return Math.max(from.x, to.x) > zone.x && Math.min(from.x, to.x) < right && Math.max(from.y, to.y) > zone.y && Math.min(from.y, to.y) < bottom;
}

function insidePanel(point: { x: number; y: number }, zone: TreePanel) {
  return point.x > zone.x && point.x < zone.x + zone.w && point.y > zone.y && point.y < zone.y + zone.h;
}

function leavePanel(point: { x: number; y: number }, zone: TreePanel) {
  if (!insidePanel(point, zone)) return point;
  const gap = 16;
  const options = [
    { x: zone.x - gap, y: point.y },
    { x: zone.x + zone.w + gap, y: point.y },
    { x: point.x, y: zone.y - gap },
    { x: point.x, y: zone.y + zone.h + gap },
  ];
  return options.reduce((best, option) => (Math.hypot(option.x - point.x, option.y - point.y) < Math.hypot(best.x - point.x, best.y - point.y) ? option : best));
}

function straighten(points: { x: number; y: number }[]) {
  if (points.length === 0) return points;
  const elbowed = [points[0]];
  for (let index = 1; index < points.length; index += 1) {
    const prev = elbowed[elbowed.length - 1];
    const point = points[index];
    if (Math.abs(prev.x - point.x) >= 0.5 && Math.abs(prev.y - point.y) >= 0.5) elbowed.push({ x: point.x, y: prev.y });
    elbowed.push(point);
  }
  const next: { x: number; y: number }[] = [];
  for (const point of elbowed) {
    const prev = next[next.length - 1];
    if (prev && Math.abs(prev.x - point.x) < 0.5 && Math.abs(prev.y - point.y) < 0.5) continue;
    const before = next[next.length - 2];
    if (prev && before && colinear(before, prev, point)) {
      next[next.length - 1] = point;
      continue;
    }
    next.push(point);
  }
  return next;
}

function colinear(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) {
  const horizontal = Math.abs(a.y - b.y) < 0.5 && Math.abs(b.y - c.y) < 0.5;
  const vertical = Math.abs(a.x - b.x) < 0.5 && Math.abs(b.x - c.x) < 0.5;
  return horizontal || vertical;
}

function pointOnBox(point: { x: number; y: number }, box: TreeBox) {
  return point.x >= box.x - 3 && point.x <= box.x + CARD_W + 3 && point.y >= box.y - 3 && point.y <= box.y + box.height + 3;
}

function boxRect(box: TreeBox) {
  return { x: box.x, y: box.y, w: CARD_W, h: box.height };
}

function rectsOverlap(a: TreePanel, b: TreePanel) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function rightEdge(zones: TreePanel[]) {
  return zones.reduce((edge, zone) => Math.max(edge, zone.x + zone.w), 0);
}

function boundsOf(boxes: TreeBox[]) {
  if (boxes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const box of boxes) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + CARD_W);
    maxY = Math.max(maxY, box.y + box.height);
  }
  return { minX, minY, width: maxX - minX, height: maxY - minY };
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
  hebrewNames,
  inset,
  onCloseInset,
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
  hebrewNames: boolean;
  inset: EmbeddedTree | null;
  onCloseInset: () => void;
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
  const outsideFamily = useMemo(() => (graph ? spousesOutsideFamily(graph.unions, graph.children) : new Set<string>()), [graph]);
  const familyColor = useMemo(() => (graph ? familyLineColors(graph.unions, graph.children) : new Map<string, string>()), [graph]);
  const scene = useMemo(() => embedScene(layout, graph, inset), [layout, graph, inset]);
  const titlePanel = scene.panels.reduce<TreePanel | null>((top, panel) => (!top || panel.y < top.y ? panel : top), null);
  const insetById = useMemo(() => new Map(scene.insetPeople.map((person) => [person.id, person])), [scene.insetPeople]);
  const photos = usePersonPhotos([...(graph?.people ?? []), ...scene.insetPeople], onLoadImage);
  const appliedInset = useRef(0);

  useLayoutEffect(() => {
    const node = canvas.current;
    if (!node || scene.boxes.length === 0) return;
    const place = () => {
      const rect = node.getBoundingClientRect();
      if (rect.width < 40 || rect.height < 40) return;
      const next = new Map(scene.boxes.map((box) => [box.id, box]));
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
      const sameTree = scene.boxes.some((box) => previous.has(box.id));
      if (previous.size > 0 && sameTree) return;
      setView(centerView(scene.boxes, rect.width, rect.height));
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(node);
    return () => observer.disconnect();
  }, [scene.boxes, selectedId]);

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
  }, [scene.boxes.length]);

  useLayoutEffect(() => {
    const node = canvas.current;
    const box = scene.boxes.find((item) => item.id === jumpId);
    if (!node || !box || !jumpToken || appliedJump.current === jumpToken) return;
    const rect = node.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 40) return;
    appliedJump.current = jumpToken;
    setView({
      scale: 1,
      x: rect.width / 2 - (box.x + CARD_W / 2),
      y: rect.height / 2 - (box.y + box.height / 2),
    });
  }, [jumpId, jumpToken, scene.boxes]);

  useLayoutEffect(() => {
    const node = canvas.current;
    const panel = scene.focus;
    const anchor = inset ? scene.boxes.find((box) => box.id === inset.anchorId) : undefined;
    if (!node || !panel || !inset || inset.loading || appliedInset.current === inset.stamp) return;
    const rect = node.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 40) return;
    appliedInset.current = inset.stamp;
    const left = anchor ? Math.min(panel.x, anchor.x) : panel.x;
    const top = anchor ? Math.min(panel.y, anchor.y) : panel.y;
    const right = anchor ? Math.max(panel.x + panel.w, anchor.x + CARD_W) : panel.x + panel.w;
    const bottom = anchor ? Math.max(panel.y + panel.h, anchor.y + anchor.height) : panel.y + panel.h;
    setView((current) => ({
      ...current,
      x: rect.width / 2 - ((left + right) / 2) * current.scale,
      y: rect.height / 2 - ((top + bottom) / 2) * current.scale,
    }));
  }, [inset, scene.boxes, scene.focus]);

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
            {treeLinePaths(scene.lines).map((d, index) => (
              <path key={index} d={d} fill="none" stroke={scene.lines[index].color ?? spouseLineColor(scene.lines[index])} strokeWidth={2} />
            ))}
            {scene.panels.length > 0 ? (
              <g>
                {scene.panels.map((panel, index) => (
                  <rect key={`panel-${index}`} x={panel.x} y={panel.y} width={panel.w} height={panel.h} rx={16} fill="#fff" stroke="#171717" strokeWidth={1.5} />
                ))}
                {titlePanel ? (
                  <text x={titlePanel.x + titlePanel.w / 2} y={titlePanel.y + 24} textAnchor="middle" direction="rtl" fill="#525252" style={{ fontSize: 14, fontWeight: 700 }}>
                    {shorten(inset?.treeName ?? "", 32)}
                  </text>
                ) : null}
                {inset?.loading && scene.focus ? (
                  <text x={scene.focus.x + scene.focus.w / 2} y={scene.focus.y + scene.focus.h / 2} textAnchor="middle" direction="rtl" fill="#737373" style={{ fontSize: 14 }}>
                    טוען…
                  </text>
                ) : null}
                {inset?.error && scene.focus ? (
                  <text x={scene.focus.x + scene.focus.w / 2} y={scene.focus.y + scene.focus.h / 2} textAnchor="middle" direction="rtl" fill="#b91c1c" style={{ fontSize: 14 }}>
                    {inset.error}
                  </text>
                ) : null}
                {treeLinePaths(scene.insetLines).map((d, index) => (
                  <path key={`inset-line-${index}`} d={d} fill="none" stroke={scene.insetLines[index].color ?? spouseLineColor(scene.insetLines[index])} strokeWidth={2} />
                ))}
                {scene.insetBoxes.map((box) => {
                  const person = insetById.get(box.id);
                  if (!person) return null;
                  const photo = person.image_path ? photos[person.image_path] : "";
                  const cardH = box.height || CARD_H;
                  const title = nodeTitle(person, hebrewNames);
                  const lived = years(person);
                  const nameX = box.x + CARD_W / 2 + (photo ? 10 : 0);
                  const outside = scene.insetOutside.has(person.id);
                  const family = scene.insetColor.get(person.id);
                  return (
                    <g key={`inset-${person.id}`} aria-label={title.label}>
                      <rect x={box.x} y={box.y} width={CARD_W} height={cardH} rx={12} fill={outside ? "#f4f4f4" : "#fff"} stroke={family ?? (outside ? "#d4d4d4" : "#e5e5e5")} strokeWidth={family ? 2.5 : 1} />
                      {person.sex === "m" || person.sex === "f" ? <GenderMark sex={person.sex} x={box.x + 5} y={box.y + 4} /> : null}
                      {person.deceased ? (
                        <svg x={box.x + CARD_W - 22} y={box.y + 6} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#737373" strokeWidth="1.8" aria-hidden="true">
                          <path d="M12 10.2c1.3-1.7 1.3-3.4 0-5.2-1.3 1.8-1.3 3.5 0 5.2Z" strokeLinejoin="round" />
                          <path d="M9 10.2h6V18a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-7.8Z" strokeLinejoin="round" />
                        </svg>
                      ) : null}
                      {photo ? (
                        <foreignObject x={box.x + 8} y={box.y + (cardH - 28) / 2} width={28} height={28} style={{ pointerEvents: "none" }}>
                          <img src={photo} alt="" width={28} height={28} style={{ display: "block", width: 28, height: 28, borderRadius: 14, objectFit: "cover" }} />
                        </foreignObject>
                      ) : null}
                      <text x={nameX} y={box.y + (title.sub ? (lived ? 20 : 28) : 30)} textAnchor="middle" direction={title.dir} fill="#171717" style={{ fontSize: 15, fontWeight: 700, unicodeBidi: "isolate" }}>
                        {shorten(title.main, photo ? 14 : 18)}
                      </text>
                      {title.sub ? (
                        <text x={nameX} y={box.y + (lived ? 36 : 48)} textAnchor="middle" direction="ltr" fill="#404040" style={{ fontSize: 11, unicodeBidi: "isolate" }}>
                          {shorten(title.sub, photo ? 18 : 24)}
                        </text>
                      ) : null}
                      <text x={box.x + CARD_W / 2} y={box.y + (title.sub && lived ? 54 : 52)} textAnchor="middle" direction="ltr" fill="#737373" style={{ fontSize: 12, unicodeBidi: "isolate" }}>
                        {shorten(lived, 22)}
                      </text>
                    </g>
                  );
                })}
                {titlePanel ? (
                <foreignObject x={titlePanel.x + titlePanel.w - 38} y={titlePanel.y + 8} width={28} height={28}>
                  <button
                    type="button"
                    data-close-inset=""
                    className="grid size-7 place-items-center rounded-full bg-white text-neutral-700 shadow"
                    aria-label="סגירת העץ"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      onCloseInset();
                    }}
                  >
                    <CloseIcon className="size-4" />
                  </button>
                </foreignObject>
                ) : null}
              </g>
            ) : null}
            {scene.boxes.map((box) => {
              const person = byId.get(box.id);
              if (!person) return null;
              const active = person.id === (selectedId ?? focusId);
              const photo = person.image_path ? photos[person.image_path] : "";
              const cardH = box.height || CARD_H;
              const linked = (links[person.id]?.length ?? 0) > 0;
              const photoX = box.x + 8;
              const photoY = box.y + (cardH - 28) / 2;
              const title = nodeTitle(person, hebrewNames);
              const lived = years(person);
              const nameX = box.x + CARD_W / 2 + (photo ? 10 : 0);
              const nameLimit = photo ? 14 : 18;
              const sexLabel = person.sex === "m" ? "זכר" : person.sex === "f" ? "נקבה" : "";
              const outside = outsideFamily.has(person.id);
              const family = familyColor.get(person.id);
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
                    fill={active ? "#d7efe9" : outside ? "#f4f4f4" : "#fff"}
                    stroke={linked ? "#c45c12" : family ? family : active ? "#128f86" : outside ? "#d4d4d4" : "#e5e5e5"}
                    strokeWidth={linked || active || family ? 2.5 : 1}
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
                  <text x={nameX} y={box.y + (title.sub ? (lived ? 20 : 28) : 30)} textAnchor="middle" direction={title.dir} fill="#171717" style={{ fontSize: 15, fontWeight: 700, unicodeBidi: "isolate" }}>
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
              <Field label="כינוי" value={draft.nickname} maxLength={120} onChange={(value) => setField("nickname", value)} />
              <Field label="כתובת" value={draft.address} maxLength={500} onChange={(value) => setField("address", value)} />
              <Field label="עיר" value={draft.city} maxLength={120} onChange={(value) => setField("city", value)} />
              <Field label="מדינה" value={draft.country} maxLength={120} onChange={(value) => setField("country", value)} />
              <Field label="דוא״ל" value={draft.email} maxLength={200} onChange={(value) => setField("email", value)} />
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
              <Field label="סיבת פטירה" value={draft.cause_of_death} maxLength={200} onChange={(value) => setField("cause_of_death", value)} />
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
            <div className="grid gap-4">
              <label className="block">
                <span className="text-neutral-600">הערה</span>
                <textarea value={draft.note} maxLength={1000} rows={6} onChange={(event) => setField("note", event.target.value)} className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 outline-none" style={{ fontSize: "1rem" }} aria-label="הערה" />
              </label>
              <label className="block">
                <span className="text-neutral-600">עיסוק</span>
                <textarea value={draft.occupation} maxLength={1000} rows={3} onChange={(event) => setField("occupation", event.target.value)} className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 outline-none" style={{ fontSize: "1rem" }} aria-label="עיסוק" />
              </label>
              <label className="block">
                <span className="text-neutral-600">מקור</span>
                <textarea value={draft.source} maxLength={2000} rows={4} onChange={(event) => setField("source", event.target.value)} className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 outline-none" style={{ fontSize: "1rem" }} aria-label="מקור" />
              </label>
              <label className="block">
                <span className="text-neutral-600">מדיה</span>
                <textarea value={draft.media} maxLength={2000} rows={4} onChange={(event) => setField("media", event.target.value)} className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 outline-none" style={{ fontSize: "1rem" }} aria-label="מדיה" />
                <span className="mt-1 block text-sm text-neutral-500">שורה לכל פריט. כותרת | קובץ | סוג</span>
              </label>
            </div>
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
    note: plainNote(person.note),
    deceased: person.deceased,
    nickname: person.nickname,
    cause_of_death: person.cause_of_death,
    occupation: person.occupation,
    source: person.source,
    media: person.media,
    address: person.address,
    city: person.city,
    country: person.country,
    email: person.email,
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

function siblingsOf(personId: string, graph: FamilyGraph, byId: Map<string, FamilyPerson>, unionById: Map<string, FamilyGraph["unions"][number]>) {
  const parentIds = new Set<string>();
  for (const link of graph.children) {
    if (link.person_id !== personId) continue;
    const union = unionById.get(link.union_id);
    if (!union) continue;
    if (union.partner_a) parentIds.add(union.partner_a);
    if (union.partner_b) parentIds.add(union.partner_b);
  }
  if (parentIds.size === 0) return [];
  const unionIds = new Set(graph.unions.filter((union) => parentIds.has(union.partner_a) || (union.partner_b != null && parentIds.has(union.partner_b))).map((union) => union.id));
  const links = graph.children
    .filter((link) => unionIds.has(link.union_id) && link.person_id !== personId && !parentIds.has(link.person_id))
    .sort((a, b) => a.sort_order - b.sort_order || a.person_id.localeCompare(b.person_id));
  const found: FamilyPerson[] = [];
  const seen = new Set<string>();
  for (const link of links) {
    if (seen.has(link.person_id)) continue;
    const person = byId.get(link.person_id);
    if (!person) continue;
    seen.add(person.id);
    found.push(person);
  }
  return found;
}

function upwardIds(personId: string, graph: FamilyGraph) {
  const byId = new Map(graph.people.map((person) => [person.id, person]));
  const unionById = new Map(graph.unions.map((union) => [union.id, union]));
  const ids = new Set<string>();
  const ancestors: string[] = [];
  const visitAncestors = (id: string) => {
    for (const parent of parentsOf(id, graph, byId, unionById)) {
      if (parent.id === personId || ids.has(parent.id)) continue;
      ids.add(parent.id);
      ancestors.push(parent.id);
      visitAncestors(parent.id);
    }
  };
  visitAncestors(personId);
  const siblings: string[] = [];
  for (const id of [personId, ...ancestors]) {
    for (const sibling of siblingsOf(id, graph, byId, unionById)) {
      if (sibling.id === personId || ids.has(sibling.id)) continue;
      ids.add(sibling.id);
      siblings.push(sibling.id);
    }
    for (const link of spouseLinks(id, graph)) {
      if (link.person.id !== personId) ids.add(link.person.id);
    }
  }
  for (const id of siblings) {
    for (const link of spouseLinks(id, graph)) {
      if (link.person.id !== personId) ids.add(link.person.id);
    }
  }
  ids.delete(personId);
  const removed = new Set([personId, ...ids]);
  const descendants = descendantIds(personId, graph);
  const everyone = new Set(graph.people.map((person) => person.id));
  const original = reachable([personId], familyNeighbors(graph, everyone));
  const alive = new Set([...everyone].filter((id) => !removed.has(id)));
  let guard = alive.size + 1;
  while (guard > 0) {
    guard -= 1;
    const neighbors = familyNeighbors(graph, alive);
    const anchors = [...descendants].filter((id) => alive.has(id));
    const keep = anchors.length > 0 ? reachable(anchors, neighbors) : null;
    let changed = false;
    for (const id of [...alive]) {
      const degree = neighbors.get(id)?.size ?? 0;
      const splitOff = keep !== null && original.has(id) && !keep.has(id);
      if (degree > 0 && !splitOff) continue;
      alive.delete(id);
      ids.add(id);
      changed = true;
    }
    if (!changed) break;
  }
  ids.delete(personId);
  return [...ids];
}

function descendantIds(personId: string, graph: FamilyGraph) {
  const found = new Set<string>();
  const stack: string[] = [];
  for (const union of graph.unions) {
    if (union.partner_a !== personId && union.partner_b !== personId) continue;
    for (const link of graph.children) if (link.union_id === union.id) stack.push(link.person_id);
  }
  while (stack.length > 0) {
    const id = stack.pop() ?? "";
    if (!id || id === personId || found.has(id)) continue;
    found.add(id);
    for (const union of graph.unions) {
      if (union.partner_a !== id && union.partner_b !== id) continue;
      for (const link of graph.children) if (link.union_id === union.id) stack.push(link.person_id);
    }
  }
  return found;
}

function familyNeighbors(graph: FamilyGraph, alive: Set<string>) {
  const neighbors = new Map<string, Set<string>>();
  for (const id of alive) neighbors.set(id, new Set());
  const link = (left: string, right: string) => {
    if (left === right || !alive.has(left) || !alive.has(right)) return;
    neighbors.get(left)?.add(right);
    neighbors.get(right)?.add(left);
  };
  for (const union of graph.unions) {
    if (!union.partner_a || !alive.has(union.partner_a)) continue;
    if (union.partner_b) link(union.partner_a, union.partner_b);
    for (const child of graph.children) {
      if (child.union_id !== union.id) continue;
      link(union.partner_a, child.person_id);
      if (union.partner_b) link(union.partner_b, child.person_id);
    }
  }
  return neighbors;
}

function reachable(starts: string[], neighbors: Map<string, Set<string>>) {
  const seen = new Set<string>();
  const stack = starts.filter((id) => neighbors.has(id));
  while (stack.length > 0) {
    const id = stack.pop() ?? "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    for (const next of neighbors.get(id) ?? []) if (!seen.has(next)) stack.push(next);
  }
  return seen;
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
  const siblings = siblingsOf(personId, graph, byId, unionById);

  return (
    <div className="grid gap-5">
      <ConnectionGroup title="סבים וסבתות" people={grandparents} onOpenPerson={onOpenPerson} />
      <ConnectionGroup title="הורים" people={parents} onOpenPerson={onOpenPerson} />
      <ConnectionGroup title="אחים ואחיות" people={siblings} onOpenPerson={onOpenPerson} />
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

function nodeTitle(person: FamilyPerson, preferHebrew?: boolean) {
  const english = `${person.given_name} ${person.surname}`.replace(/\s+/g, " ").trim();
  const hebrew = `${person.hebrew_given ?? ""} ${person.hebrew_surname ?? ""}`.replace(/\s+/g, " ").trim();
  if (preferHebrew === true) {
    if (hebrew) return { main: hebrew, sub: "", label: hebrew, dir: "rtl" as const };
    const main = english || personName(person);
    return { main, sub: "", label: main, dir: english ? ("ltr" as const) : ("rtl" as const) };
  }
  if (preferHebrew === false) {
    if (english) return { main: english, sub: "", label: english, dir: "ltr" as const };
    const main = hebrew || personName(person);
    return { main, sub: "", label: main, dir: "rtl" as const };
  }
  if (hebrew && english) return { main: hebrew, sub: english, label: `${hebrew} (${english})`, dir: "rtl" as const };
  const main = hebrew || personName(person);
  return { main, sub: "", label: main, dir: hebrew || !english ? ("rtl" as const) : ("ltr" as const) };
}

function years(person: FamilyPerson) {
  const birth = yearOf(person.birth_date);
  const death = yearOf(person.death_date);
  const dead = person.deceased || Boolean(death);
  if (dead) {
    if (birth && death) {
      const age = ageBetween(person.birth_date, person.death_date);
      return age === null ? `${birth} – ${death}` : `${birth} – ${death} (${age})`;
    }
    if (birth) return `${birth} –`;
    return death;
  }
  const age = ageOf(person.birth_date);
  if (birth && age !== null) return `${birth} (${age})`;
  return birth;
}

function ageBetween(birthValue: string, deathValue: string) {
  const birth = calendarValue(birthValue);
  const death = calendarValue(deathValue);
  if (birth && death) {
    const [birthYear, birthMonth, birthDay] = birth.split("-").map(Number);
    const [deathYear, deathMonth, deathDay] = death.split("-").map(Number);
    let age = deathYear - birthYear;
    if (deathMonth < birthMonth || (deathMonth === birthMonth && deathDay < birthDay)) age -= 1;
    return age >= 0 && age < 130 ? age : null;
  }
  const birthYear = Number(yearOf(birthValue));
  const deathYear = Number(yearOf(deathValue));
  if (!birthYear || !deathYear) return null;
  const age = deathYear - birthYear;
  return age >= 0 && age < 130 ? age : null;
}

function ageOf(value: string) {
  const today = new Date();
  const iso = calendarValue(value);
  if (iso) {
    const [year, month, day] = iso.split("-").map(Number);
    let age = today.getFullYear() - year;
    if (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day)) age -= 1;
    return age >= 0 && age < 130 ? age : null;
  }
  const year = Number(yearOf(value));
  if (!year) return null;
  const age = today.getFullYear() - year;
  return age >= 0 && age < 130 ? age : null;
}

function yearOf(value: string) {
  return value.match(/\d{4}/)?.[0] ?? value.match(/\d{3}/)?.[0] ?? "";
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

function spouseLineColor(line: TreeLine) {
  if (line.kind !== "spouse") return SPOUSE_LINE_COLORS.married;
  return SPOUSE_LINE_COLORS[line.status ?? "married"] ?? SPOUSE_LINE_COLORS.married;
}

function ColorLegend({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="מקרא">
      <div className="flex max-h-[85dvh] w-full max-w-xs flex-col rounded-2xl bg-white p-4 text-start">
        <h2 className="text-base font-medium">מקרא</h2>
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
          <LegendGroup title="כרטיסים">
            <ColorSwatch label="נבחר" fill="#d7efe9" border="#128f86" />
            <ColorSwatch label="בן או בת זוג מחוץ למשפחה" fill="#f4f4f4" border="#d4d4d4" />
            <ColorSwatch label="מקושר לעץ אחר" fill="#fff" border="#c45c12" />
          </LegendGroup>
          <LegendGroup title="מין">
            <ColorSwatch label="זכר" fill="#2563eb" />
            <ColorSwatch label="נקבה" fill="#db2777" />
          </LegendGroup>
          <LegendGroup title="קווים">
            {UNION_STATUSES.map((status) => (
              <LineSwatch key={status} label={unionStatusLabel(status)} color={SPOUSE_LINE_COLORS[status]} />
            ))}
            <LineSwatch label="הורים וילדים" color={SPOUSE_LINE_COLORS.married} />
          </LegendGroup>
          <LegendGroup title="משפחות עם אבות בעץ">
            <ColorSwatch label="משפחה אחת" fill="#fff" border={FAMILY_LINE_COLORS[0]} />
            <ColorSwatch label="משפחת בן או בת הזוג" fill="#fff" border={FAMILY_LINE_COLORS[1]} />
            <LineSwatch label="קו המשפחה" color={FAMILY_LINE_COLORS[0]} />
          </LegendGroup>
        </div>
        <button type="button" className="mt-4 w-full rounded-xl bg-neutral-100 py-3 font-medium text-neutral-700" onClick={onClose}>
          סגירה
        </button>
      </div>
    </div>
  );
}

function LegendGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-3 first:mt-0">
      <h3 className="text-sm font-medium text-neutral-500">{title}</h3>
      <ul className="mt-2 flex flex-col gap-2">{children}</ul>
    </section>
  );
}

function ColorSwatch({ label, fill, border }: { label: string; fill: string; border?: string }) {
  return (
    <li className="flex items-center gap-3">
      <span className="size-5 shrink-0 rounded-md border-2" style={{ background: fill, borderColor: border ?? fill }} />
      <span className="text-sm">{label}</span>
    </li>
  );
}

function LineSwatch({ label, color }: { label: string; color: string }) {
  return (
    <li className="flex items-center gap-3">
      <span className="h-1 w-8 shrink-0 rounded-full" style={{ background: color }} />
      <span className="text-sm">{label}</span>
    </li>
  );
}

type LineSeg = { x1: number; y1: number; x2: number; y2: number; horizontal: boolean };

const HOP = 8;

function treeLinePaths(lines: TreeLine[]) {
  const parts = lines.map(segmentsOf);
  const hops: { x: number; y: number }[][] = parts.map(() => []);
  for (let i = 0; i < parts.length; i += 1) {
    for (let j = i + 1; j < parts.length; j += 1) {
      for (const a of parts[i]) {
        for (const b of parts[j]) {
          const point = segmentCrossing(a, b);
          if (point) hops[j].push(point);
        }
      }
    }
  }
  return parts.map((segments, index) => pathWithHops(segments, hops[index]));
}

function segmentsOf(line: TreeLine): LineSeg[] {
  const segs: LineSeg[] = [];
  for (let index = 0; index < line.points.length - 1; index += 1) {
    const start = line.points[index];
    const end = line.points[index + 1];
    if (Math.hypot(end.x - start.x, end.y - start.y) < 0.5) continue;
    segs.push({
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
      horizontal: Math.abs(start.y - end.y) <= Math.abs(start.x - end.x),
    });
  }
  return segs;
}

function segmentCrossing(a: LineSeg, b: LineSeg) {
  if (a.horizontal === b.horizontal) return null;
  const horizontal = a.horizontal ? a : b;
  const vertical = a.horizontal ? b : a;
  const x = vertical.x1;
  const y = horizontal.y1;
  const left = Math.min(horizontal.x1, horizontal.x2);
  const right = Math.max(horizontal.x1, horizontal.x2);
  const top = Math.min(vertical.y1, vertical.y2);
  const bottom = Math.max(vertical.y1, vertical.y2);
  if (x <= left + 1 || x >= right - 1 || y <= top + 1 || y >= bottom - 1) return null;
  return { x, y };
}

function pathWithHops(segments: LineSeg[], hops: { x: number; y: number }[]) {
  const first = segments[0];
  if (!first) return "";
  let d = `M ${first.x1} ${first.y1}`;
  for (const seg of segments) {
    const len = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1);
    if (len < 1) continue;
    const ux = (seg.x2 - seg.x1) / len;
    const uy = (seg.y2 - seg.y1) / len;
    const along = hops
      .filter((hop) => hopOnSegment(hop, seg))
      .map((hop) => ({ hop, t: (hop.x - seg.x1) * ux + (hop.y - seg.y1) * uy }))
      .sort((a, b) => a.t - b.t);
    let blockedUntil = 0;
    for (let index = 0; index < along.length; index += 1) {
      const current = along[index];
      const nextT = index + 1 < along.length ? along[index + 1].t : len;
      const room = Math.min(
        current.t - blockedUntil,
        index + 1 < along.length ? (nextT - current.t) / 2 : len - current.t,
      );
      const radius = Math.min(HOP, room - 0.5);
      if (radius < 4) continue;
      const { hop } = current;
      const beforeX = hop.x - ux * radius;
      const beforeY = hop.y - uy * radius;
      const afterX = hop.x + ux * radius;
      const afterY = hop.y + uy * radius;
      d += ` L ${beforeX} ${beforeY} A ${radius} ${radius} 0 0 1 ${afterX} ${afterY}`;
      blockedUntil = current.t + radius;
    }
    d += ` L ${seg.x2} ${seg.y2}`;
  }
  return d;
}

function hopOnSegment(hop: { x: number; y: number }, seg: LineSeg) {
  if (seg.horizontal) {
    if (Math.abs(hop.y - seg.y1) > 0.5) return false;
    const left = Math.min(seg.x1, seg.x2);
    const right = Math.max(seg.x1, seg.x2);
    return hop.x > left + 0.5 && hop.x < right - 0.5;
  }
  if (Math.abs(hop.x - seg.x1) > 0.5) return false;
  const top = Math.min(seg.y1, seg.y2);
  const bottom = Math.max(seg.y1, seg.y2);
  return hop.y > top + 0.5 && hop.y < bottom - 0.5;
}
